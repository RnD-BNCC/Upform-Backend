import type { Request, Response } from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { prisma } from '../config/prisma.js'
import { s3, S3_BUCKET } from '../config/s3.js'
import { auth, isEmailAllowed } from '../config/auth.js'
import {
  createDriveAccountAuthUrl,
  createDriveFolder,
  exchangeDriveAccountCode,
  syncDriveFolderPermissions,
  syncDriveGalleryFiles,
  type DriveGalleryFile,
} from '../config/google-drive.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { AuthUser } from '../middlewares/auth.js'
import type { FileEntry, FormField } from '../types/gallery.js'
import type { Prisma } from '../../generated/prisma/index.js'

const S3_BASE_URL = `https://s3.bncc.net/${S3_BUCKET}/`

const TEXT_TYPES = new Set(['text', 'short_text', 'email', 'short_answer', 'name', 'paragraph'])
const SHARE_VISIBILITIES = new Set(['private', 'restricted', 'public'])
const SHARE_ROLES = new Set(['viewer', 'editor'])
const DRIVE_AUTH_CALLBACK_PATH = '/api/gallery/share/drive/callback'

type GalleryShareRecord = {
  id: string
  eventId: string
  visibility: string
  publicRole: string
  token: string
  driveFolderId?: string | null
  driveFolderUrl?: string | null
  driveOwnerEmail?: string | null
  driveRefreshToken?: string | null
  driveSyncEnabled: boolean
  members: GalleryShareMemberRecord[]
}

type GalleryShareMemberRecord = {
  id: string
  email: string
  role: string
}

type GalleryEventSource = {
  id: string
  name: string
  status: string
  sections: Array<{ fields: unknown }>
  responses: Array<{
    id: string
    submittedAt: Date
    answers: unknown
  }>
  galleryShare?: GalleryShareRecord | null
}

function createShareToken() {
  return randomBytes(18).toString('base64url')
}

function getDriveStateSecret() {
  return process.env.BETTER_AUTH_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? 'upform-drive'
}

function getApiOrigin(req: Request) {
  return (process.env.PUBLIC_API_URL?.trim() || `${req.protocol}://${req.get('host')}`).replace(
    /\/$/,
    '',
  )
}

function getDriveRedirectUri(req: Request) {
  return (
    process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() ||
    `${getApiOrigin(req)}${DRIVE_AUTH_CALLBACK_PATH}`
  )
}

type DriveAuthState = {
  eventId: string
  redirectTo: string
  userId: string
  exp: number
}

function signDriveState(payload: DriveAuthState) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getDriveStateSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function parseDriveState(value: unknown): DriveAuthState | null {
  if (typeof value !== 'string') return null
  const [body, sig] = value.split('.')
  if (!body || !sig) return null

  const expected = createHmac('sha256', getDriveStateSecret()).update(body).digest('base64url')
  const actualBuffer = Buffer.from(sig)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DriveAuthState
    if (!parsed.eventId || !parsed.redirectTo || !parsed.userId || parsed.exp < Date.now()) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function isSafeRedirectUrl(value: unknown, req: Request) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.origin === getAppOrigin(req)
  } catch {
    return false
  }
}

function appendRedirectStatus(redirectTo: string, params: Record<string, string>) {
  const url = new URL(redirectTo)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

function normalizeVisibility(value: unknown) {
  return typeof value === 'string' && SHARE_VISIBILITIES.has(value) ? value : 'private'
}

function normalizeRole(value: unknown) {
  return typeof value === 'string' && SHARE_ROLES.has(value) ? value : 'viewer'
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getAppOrigin(req: Request) {
  const configuredOrigin = process.env.PUBLIC_APP_URL?.trim()
  const firstAllowedOrigin = (process.env.ALLOWED_ORIGINS ?? '').split(',')[0]?.trim()
  return (configuredOrigin || firstAllowedOrigin || `${req.protocol}://${req.get('host')}`).replace(
    /\/$/,
    '',
  )
}

function serializeShare(share: GalleryShareRecord, req: Request) {
  return {
    id: share.id,
    eventId: share.eventId,
    visibility: share.visibility,
    publicRole: share.publicRole,
    token: share.token,
    shareUrl: `${getAppOrigin(req)}/gallery/share/${share.token}`,
    driveFolderId: share.driveFolderId ?? null,
    driveFolderUrl: share.driveFolderUrl ?? null,
    driveOwnerEmail: share.driveOwnerEmail ?? null,
    driveSyncEnabled: share.driveSyncEnabled,
    members: share.members.map((member) => ({
      id: member.id,
      email: member.email,
      role: member.role,
    })),
  }
}

function serializeShareSummary(share: GalleryShareRecord | null | undefined, req: Request) {
  if (!share) return null
  return {
    visibility: share.visibility,
    publicRole: share.publicRole,
    token: share.token,
    shareUrl: `${getAppOrigin(req)}/gallery/share/${share.token}`,
    memberCount: share.members.length,
    driveSyncEnabled: share.driveSyncEnabled,
    driveFolderUrl: share.driveFolderUrl ?? null,
    driveOwnerEmail: share.driveOwnerEmail ?? null,
  }
}

function extractFiles(value: unknown, fieldId: string, fieldLabel: string): FileEntry[] {
  if (!value) return []
  const fieldName = fieldLabel?.trim() || 'Untitled upload'

  const toEntry = (v: unknown): FileEntry | null => {
    if (typeof v === 'string' && v.includes('::')) {
      const sepIdx = v.indexOf('::')
      const filename = v.slice(0, sepIdx)
      const url = v.slice(sepIdx + 2)
      return { fieldId, fieldLabel: fieldName, fieldName, url, filename }
    }

    if (typeof v === 'string' && v.startsWith('http')) {
      const parts = v.split('/')
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        url: v,
        filename: decodeURIComponent(parts[parts.length - 1]),
      }
    }

    if (typeof v === 'object' && v !== null && 'url' in v) {
      const obj = v as Record<string, unknown>
      const url = String(obj.url)
      const filename =
        typeof obj.filename === 'string'
          ? obj.filename
          : decodeURIComponent(url.split('/').pop() ?? '')
      return { fieldId, fieldLabel: fieldName, fieldName, url, filename }
    }

    return null
  }

  if (Array.isArray(value)) {
    return value.map(toEntry).filter(Boolean) as FileEntry[]
  }

  const entry = toEntry(value)
  return entry ? [entry] : []
}

function extractRespondentLabel(answers: Record<string, unknown>, fields: FormField[]): string {
  for (const field of fields) {
    if (TEXT_TYPES.has(field.type)) {
      const val = answers[field.id]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
  }

  return 'Anonymous'
}

function getStoredFileUrl(value: unknown) {
  if (typeof value === 'string' && value.includes('::')) {
    return value.slice(value.indexOf('::') + 2)
  }

  if (typeof value === 'string' && value.startsWith('http')) {
    return value
  }

  if (typeof value === 'object' && value !== null && 'url' in value) {
    const url = (value as Record<string, unknown>).url
    return typeof url === 'string' ? url : ''
  }

  return ''
}

function removeFileUrlFromAnswerValue(value: unknown, url: string) {
  if (Array.isArray(value)) {
    const next = value.filter((item) => getStoredFileUrl(item) !== url)
    return {
      changed: next.length !== value.length,
      value: next.length > 0 ? next : '',
    }
  }

  if (getStoredFileUrl(value) === url) {
    return { changed: true, value: '' }
  }

  return { changed: false, value }
}

async function removeGalleryFileReferences(url: string) {
  const responses = await prisma.response.findMany({
    where: { deletedAt: null },
    select: { id: true, answers: true },
  })

  await Promise.all(
    responses.map(async (response) => {
      const answers = (response.answers ?? {}) as Record<string, unknown>
      let changed = false
      const nextAnswers: Record<string, unknown> = {}

      for (const [fieldId, value] of Object.entries(answers)) {
        const result = removeFileUrlFromAnswerValue(value, url)
        nextAnswers[fieldId] = result.value
        changed = changed || result.changed
      }

      if (!changed) return

      await prisma.response.update({
        where: { id: response.id },
        data: { answers: nextAnswers as Prisma.InputJsonValue },
      })
    }),
  )
}

function isNoSuchKeyError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('name' in error && (error as { name?: string }).name === 'NoSuchKey') ||
      ('$metadata' in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404))
  )
}

function buildGalleryEvent(event: GalleryEventSource, req: Request) {
  const allFields: FormField[] = event.sections.flatMap((section) => {
    const fields = section.fields as FormField[]
    return Array.isArray(fields) ? fields : []
  })
  const fileFields = allFields.filter((field) => field.type === 'file_upload')
  if (fileFields.length === 0) return null

  let fileCount = 0
  const responses = event.responses
    .map((response) => {
      const answers = (response.answers ?? {}) as Record<string, unknown>
      const files: FileEntry[] = fileFields.flatMap((field) =>
        extractFiles(answers[field.id], field.id, field.label),
      )
      if (files.length === 0) return null

      fileCount += files.length
      return {
        id: response.id,
        submittedAt: response.submittedAt.toISOString(),
        respondentLabel: extractRespondentLabel(answers, allFields),
        files,
      }
    })
    .filter(Boolean)

  if (responses.length === 0) return null

  return {
    id: event.id,
    name: event.name || 'Untitled Form',
    status: event.status,
    fileCount,
    share: serializeShareSummary(event.galleryShare, req),
    responses,
  }
}

type BuiltGalleryEvent = NonNullable<ReturnType<typeof buildGalleryEvent>>

async function getOptionalUser(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session?.user as AuthUser | undefined
}

function getShareRole(share: GalleryShareRecord, userEmail?: string) {
  if (isEmailAllowed(userEmail)) return 'editor'
  if (share.visibility === 'public') return normalizeRole(share.publicRole)
  if (!userEmail) return null

  const member = share.members.find((item) => item.email === userEmail.toLowerCase())
  return member ? normalizeRole(member.role) : null
}

async function getGoogleRefreshToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'google' },
    select: { refreshToken: true },
  })
  return account?.refreshToken ?? null
}

async function syncShareToDrive(refreshToken: string, share: GalleryShareRecord) {
  if (!share.driveSyncEnabled || !share.driveFolderId) return

  await syncDriveFolderPermissions(
    refreshToken,
    share.driveFolderId,
    normalizeVisibility(share.visibility) as 'private' | 'restricted' | 'public',
    normalizeRole(share.publicRole) as 'viewer' | 'editor',
    share.members.map((member) => ({
      email: member.email,
      role: normalizeRole(member.role) as 'viewer' | 'editor',
    })),
  )
}

async function syncEventFilesToDrive(
  refreshToken: string,
  folderId: string,
  event: BuiltGalleryEvent,
) {
  const responses = event.responses.filter(
    (response): response is NonNullable<(typeof event.responses)[number]> => response !== null,
  )
  const files: DriveGalleryFile[] = responses.flatMap((response) =>
    response.files.map((file) => ({
      eventId: event.id,
      responseId: response.id,
      respondentLabel: response.respondentLabel,
      filename: file.filename,
      sourceUrl: file.url,
      getContent: async () => {
        if (!file.url.startsWith(S3_BASE_URL)) return null

        try {
          const key = decodeURIComponent(file.url.slice(S3_BASE_URL.length))
          const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))

          if (object.Body instanceof Readable) {
            return {
              body: object.Body,
              contentType: object.ContentType ?? undefined,
            }
          }

          const body = await object.Body?.transformToByteArray()
          return {
            body: Buffer.from(body ?? []),
            contentType: object.ContentType ?? undefined,
          }
        } catch (error) {
          if (isNoSuchKeyError(error)) {
            await removeGalleryFileReferences(file.url)
            return null
          }
          throw error
        }
      },
    })),
  )

  if (files.length === 0) return { uploaded: 0, skipped: 0, failed: 0 }
  return syncDriveGalleryFiles(refreshToken, folderId, files)
}

async function syncDriveForEvent(
  req: Request,
  refreshToken: string,
  event: GalleryEventSource,
  share: GalleryShareRecord,
  ownerEmail?: string | null,
) {
  let nextShare = share

  if (!nextShare.driveFolderId || !nextShare.driveFolderUrl) {
    const folder = await createDriveFolder(
      refreshToken,
      `UpForm - ${event.name || 'Gallery Files'}`,
    )
    nextShare = await prisma.galleryShare.update({
      where: { eventId: event.id },
      data: {
        driveFolderId: folder.folderId,
        driveFolderUrl: folder.folderUrl,
        driveOwnerEmail: ownerEmail ?? nextShare.driveOwnerEmail ?? null,
        driveRefreshToken: refreshToken,
        driveSyncEnabled: true,
      },
      include: { members: { orderBy: { email: 'asc' } } },
    })
  } else {
    nextShare = await prisma.galleryShare.update({
      where: { eventId: event.id },
      data: {
        driveOwnerEmail: ownerEmail ?? nextShare.driveOwnerEmail ?? null,
        driveRefreshToken: refreshToken,
        driveSyncEnabled: true,
      },
      include: { members: { orderBy: { email: 'asc' } } },
    })
  }

  await syncShareToDrive(refreshToken, nextShare)
  if (nextShare.driveFolderId) {
    const galleryEvent = buildGalleryEvent({ ...event, galleryShare: nextShare }, req)
    if (galleryEvent) {
      await syncEventFilesToDrive(refreshToken, nextShare.driveFolderId, galleryEvent)
    }
  }

  return nextShare
}

export async function listGalleryFiles(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 20))
    const skip = (page - 1) * take

    const events = await prisma.event.findMany({
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: {
          where: { deletedAt: null },
          orderBy: { submittedAt: 'desc' },
        },
        galleryShare: {
          include: { members: { orderBy: { email: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = events
      .map((event) => {
        return buildGalleryEvent(event, req)
      })
      .filter(Boolean)

    const totalFiles = result.reduce((sum, event) => sum + event!.fileCount, 0)
    const total = result.length
    const paginated = result.slice(skip, skip + take)

    res.json({
      totalFiles,
      events: paginated,
      meta: { page, take, total, totalPages: Math.ceil(total / take) },
    })
  } catch (error) {
    handleControllerError('Gallery', 'list files failed', error, res)
  }
}

export async function getGalleryShare(req: Request, res: Response) {
  try {
    const { eventId } = req.params as Record<string, string>
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: {
          where: { deletedAt: null },
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const share = await prisma.galleryShare.upsert({
      where: { eventId },
      update: {},
      create: { eventId, token: createShareToken() },
      include: { members: { orderBy: { email: 'asc' } } },
    })

    res.json(serializeShare(share, req))
  } catch (error) {
    handleControllerError('Gallery', 'get share failed', error, res)
  }
}

export async function updateGalleryShare(req: Request, res: Response) {
  try {
    const { eventId } = req.params as Record<string, string>
    const body = req.body as Record<string, unknown>
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: {
          where: { deletedAt: null },
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const membersInput = Array.isArray(body.members) ? body.members : []
    const membersByEmail = new Map<string, string>()
    membersInput.forEach((item) => {
      const member = item as Record<string, unknown>
      const email = normalizeEmail(member.email)
      if (!email) return
      membersByEmail.set(email, normalizeRole(member.role))
    })

    const existing = await prisma.galleryShare.findUnique({ where: { eventId } })
    const share = await prisma.galleryShare.upsert({
      where: { eventId },
      update: {
        visibility: normalizeVisibility(body.visibility),
        publicRole: normalizeRole(body.publicRole),
        driveSyncEnabled:
          typeof body.driveSyncEnabled === 'boolean' ? body.driveSyncEnabled : false,
        ...(typeof body.driveFolderId === 'string' && { driveFolderId: body.driveFolderId }),
        ...(typeof body.driveFolderUrl === 'string' && { driveFolderUrl: body.driveFolderUrl }),
        members: {
          deleteMany: {},
          create: Array.from(membersByEmail.entries()).map(([email, role]) => ({
            email,
            role,
          })),
        },
      },
      create: {
        eventId,
        token: existing?.token ?? createShareToken(),
        visibility: normalizeVisibility(body.visibility),
        publicRole: normalizeRole(body.publicRole),
        driveSyncEnabled:
          typeof body.driveSyncEnabled === 'boolean' ? body.driveSyncEnabled : false,
        ...(typeof body.driveFolderId === 'string' && { driveFolderId: body.driveFolderId }),
        ...(typeof body.driveFolderUrl === 'string' && { driveFolderUrl: body.driveFolderUrl }),
        members: {
          create: Array.from(membersByEmail.entries()).map(([email, role]) => ({
            email,
            role,
          })),
        },
      },
      include: { members: { orderBy: { email: 'asc' } } },
    })

    if (share.driveSyncEnabled && share.driveFolderId) {
      const user = res.locals.user as AuthUser
      const refreshToken = await getGoogleRefreshToken(user.id)
      if (!refreshToken) {
        res.status(400).json({ error: 'Missing Google Drive permission. Please re-login.' })
        return
      }
      await syncDriveForEvent(req, share.driveRefreshToken ?? refreshToken, event, share)
    }

    res.json(serializeShare(share, req))
  } catch (error) {
    handleControllerError('Gallery', 'update share failed', error, res)
  }
}

export async function startGalleryDriveAuth(req: Request, res: Response) {
  try {
    const user = res.locals.user as AuthUser
    const { eventId } = req.params as Record<string, string>
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const redirectTo = isSafeRedirectUrl(req.query.redirect, req)
      ? (req.query.redirect as string)
      : `${getAppOrigin(req)}/gallery`
    const state = signDriveState({
      eventId,
      redirectTo,
      userId: user.id,
      exp: Date.now() + 10 * 60 * 1000,
    })

    const authUrl = createDriveAccountAuthUrl(getDriveRedirectUri(req), state)
    if (req.query.response === 'json') {
      res.json({ authUrl })
      return
    }

    res.redirect(authUrl)
  } catch (error) {
    handleControllerError('Gallery', 'start drive auth failed', error, res)
  }
}

export async function completeGalleryDriveAuth(req: Request, res: Response) {
  const state = parseDriveState(req.query.state)
  if (!state) {
    res.status(400).json({ error: 'Invalid Google Drive authorization state' })
    return
  }

  const redirectWithStatus = (status: string) =>
    res.redirect(appendRedirectStatus(state.redirectTo, { drive: status }))

  try {
    if (req.query.error) {
      redirectWithStatus('cancelled')
      return
    }

    const code = req.query.code
    if (typeof code !== 'string' || !code) {
      redirectWithStatus('missing-code')
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: state.userId },
      select: { email: true },
    })
    if (!user || !isEmailAllowed(user.email)) {
      redirectWithStatus('unauthorized')
      return
    }

    const event = await prisma.event.findUnique({
      where: { id: state.eventId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: {
          where: { deletedAt: null },
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
    if (!event) {
      redirectWithStatus('not-found')
      return
    }

    const driveAccount = await exchangeDriveAccountCode(code, getDriveRedirectUri(req))
    if (!driveAccount.refreshToken) {
      redirectWithStatus('missing-permission')
      return
    }

    const share = await prisma.galleryShare.upsert({
      where: { eventId: state.eventId },
      update: {},
      create: { eventId: state.eventId, token: createShareToken() },
      include: { members: { orderBy: { email: 'asc' } } },
    })

    await syncDriveForEvent(
      req,
      driveAccount.refreshToken,
      event,
      share,
      driveAccount.email ?? user.email,
    )

    redirectWithStatus('connected')
  } catch (error) {
    console.error('[Gallery] complete drive auth failed:', error)
    redirectWithStatus('error')
  }
}

export async function connectGalleryDrive(req: Request, res: Response) {
  try {
    const user = res.locals.user as AuthUser
    const { eventId } = req.params as Record<string, string>

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: {
          where: { deletedAt: null },
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existingShare = await prisma.galleryShare.upsert({
      where: { eventId },
      update: {},
      create: { eventId, token: createShareToken() },
      include: { members: { orderBy: { email: 'asc' } } },
    })

    const refreshToken = existingShare.driveRefreshToken ?? (await getGoogleRefreshToken(user.id))
    if (!refreshToken) {
      res.status(400).json({ error: 'Missing Google Drive permission. Please choose a Drive account.' })
      return
    }

    const share = await syncDriveForEvent(
      req,
      refreshToken,
      event,
      existingShare,
      existingShare.driveOwnerEmail ?? user.email,
    )
    res.json(serializeShare(share, req))
  } catch (error) {
    handleControllerError('Gallery', 'connect drive failed', error, res)
  }
}

export async function getSharedGalleryFiles(req: Request, res: Response) {
  try {
    const { token } = req.params as Record<string, string>
    const share = await prisma.galleryShare.findUnique({
      where: { token },
      include: {
        members: { orderBy: { email: 'asc' } },
        event: {
          include: {
            sections: { orderBy: { order: 'asc' } },
            responses: {
              where: { deletedAt: null },
              orderBy: { submittedAt: 'desc' },
            },
          },
        },
      },
    })

    if (!share) {
      res.status(404).json({ error: 'Shared gallery not found' })
      return
    }

    const user = await getOptionalUser(req)
    const role = getShareRole(share, user?.email)
    if (!role) {
      res.status(user ? 403 : 401).json({ error: 'You do not have access to this gallery' })
      return
    }

    const event = buildGalleryEvent(
      {
        ...share.event,
        galleryShare: share,
      },
      req,
    )

    if (!event) {
      res.json({ role, event: null })
      return
    }

    res.json({ role, event })
  } catch (error) {
    handleControllerError('Gallery', 'get shared files failed', error, res)
  }
}

export async function listGalleryMedia(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(100, Math.max(1, parseInt(req.query.take as string) || 21))
    const skip = (page - 1) * take

    const items: { key: string; url: string; filename: string; size: number; lastModified: string }[] =
      []
    let continuationToken: string | undefined

    do {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: 'slides/',
          ContinuationToken: continuationToken,
        }),
      )

      for (const object of response.Contents ?? []) {
        if (!object.Key || object.Key.endsWith('/')) continue

        items.push({
          key: object.Key,
          url: `${S3_BASE_URL}${object.Key}`,
          filename: decodeURIComponent(object.Key.split('/').pop() ?? object.Key),
          size: object.Size ?? 0,
          lastModified: object.LastModified?.toISOString() ?? '',
        })
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    items.sort((a, b) => b.lastModified.localeCompare(a.lastModified))

    const total = items.length
    const paginated = items.slice(skip, skip + take)

    res.json({
      items: paginated,
      meta: { page, take, total, totalPages: Math.ceil(total / take) },
    })
  } catch (error) {
    handleControllerError('Gallery', 'list media failed', error, res)
  }
}

export async function previewGalleryFile(req: Request, res: Response) {
  try {
    const url = req.query.url as string | undefined
    if (!url || !url.startsWith(S3_BASE_URL)) {
      res.status(400).json({ error: 'Invalid URL' })
      return
    }

    const key = decodeURIComponent(url.slice(S3_BASE_URL.length))
    const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))

    if (object.ContentType) {
      res.setHeader('Content-Type', object.ContentType)
    }
    if (object.ContentLength) {
      res.setHeader('Content-Length', String(object.ContentLength))
    }
    res.setHeader('Cache-Control', 'private, max-age=300')

    if (object.Body instanceof Readable) {
      object.Body.pipe(res)
      return
    }

    const body = await object.Body?.transformToByteArray()
    res.send(Buffer.from(body ?? []))
  } catch (error) {
    const url = req.query.url as string | undefined
    if (url && url.startsWith(S3_BASE_URL) && isNoSuchKeyError(error)) {
      await removeGalleryFileReferences(url)
      res.status(404).json({ error: 'File not found' })
      return
    }

    handleControllerError('Gallery', 'preview file failed', error, res)
  }
}

export async function deleteGalleryFile(req: Request, res: Response) {
  try {
    const { url } = req.body as { url?: string }
    if (!url || !url.startsWith(S3_BASE_URL)) {
      res.status(400).json({ error: 'Invalid URL' })
      return
    }

    const key = url.slice(S3_BASE_URL.length)
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    await removeGalleryFileReferences(url)
    res.json({ ok: true })
  } catch (error) {
    handleControllerError('Gallery', 'delete file failed', error, res)
  }
}
