import { prisma } from '@/config/prisma.js'
import { auth, isEmailAllowed } from '@/config/auth.js'
import { handleControllerError } from '@/utils/controller-error.js'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import type { AuthUser } from '@/middlewares/auth.js'

type EventParams = {
  eventId: string
}

type ShareParams = {
  token: string
}

type UpdateResultShareBody = {
  members?: Array<{ email?: string; role?: string }>
  publicRole?: string
  visibility?: string
}

function createShareToken() {
  return randomUUID().replace(/-/g, '')
}

function normalizeVisibility(value: unknown) {
  return value === 'public' || value === 'restricted' ? value : 'private'
}

function normalizeRole(value: unknown) {
  return value === 'editor' ? 'editor' : 'viewer'
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function cleanMembers(value: UpdateResultShareBody['members']) {
  const memberMap = new Map<string, { email: string; role: string }>()
  for (const member of value ?? []) {
    const email = normalizeEmail(member.email)
    if (email.includes('@')) memberMap.set(email, { email, role: normalizeRole(member.role) })
  }
  return Array.from(memberMap.values())
}

function getAppOrigin(req: Request) {
  return (
    process.env.APP_ORIGIN ||
    process.env.FRONTEND_URL ||
    req.get('origin') ||
    `${req.protocol}://${req.get('host')}`
  )
}

function serializeShare(
  share: {
    eventId: string
    id: string
    members?: Array<{ id?: string; email: string; role: string }>
    publicRole: string
    token: string
    visibility: string
  },
  req: Request,
) {
  return {
    id: share.id,
    eventId: share.eventId,
    publicRole: normalizeRole(share.publicRole),
    visibility: share.visibility,
    token: share.token,
    shareUrl: `${getAppOrigin(req)}/results/share/${share.token}`,
    members: (share.members ?? []).map((member) => ({
      id: member.id,
      email: member.email,
      role: normalizeRole(member.role),
    })),
  }
}

async function getOptionalUser(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session?.user as AuthUser | undefined
}

function getShareRole(
  share: {
    members: Array<{ email: string; role: string }>
    publicRole: string
    visibility: string
  },
  userEmail?: string,
) {
  if (isEmailAllowed(userEmail)) return 'editor'
  if (share.visibility === 'public') return normalizeRole(share.publicRole)
  if (share.visibility === 'private') return null
  if (!userEmail) return null
  const member = share.members.find((item) => item.email === normalizeEmail(userEmail))
  return member ? normalizeRole(member.role) : null
}

export async function getResultShare(req: Request<EventParams>, res: Response) {
  try {
    const { eventId } = req.params
    const event = await prisma.event.findFirst({
      where: { id: eventId, stsrc: { not: 'D' } },
      select: { id: true },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const share = await prisma.eventResultShare.upsert({
      where: { eventId },
      create: { eventId, token: createShareToken() },
      update: {},
      include: { members: { orderBy: { email: 'asc' } } },
    })

    res.json(serializeShare(share, req))
  } catch (error) {
    handleControllerError('ResultShare', 'get share failed', error, res)
  }
}

export async function updateResultShare(
  req: Request<EventParams, unknown, UpdateResultShareBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const event = await prisma.event.findFirst({
      where: { id: eventId, stsrc: { not: 'D' } },
      select: { id: true },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await prisma.eventResultShare.findUnique({ where: { eventId } })
    const members = cleanMembers(req.body.members)
    const share = await prisma.eventResultShare.upsert({
      where: { eventId },
      create: {
        eventId,
        publicRole: normalizeRole(req.body.publicRole),
        token: createShareToken(),
        visibility: normalizeVisibility(req.body.visibility),
        members: { create: members },
      },
      update: {
        publicRole: normalizeRole(req.body.publicRole),
        visibility: normalizeVisibility(req.body.visibility),
        token: existing?.token ?? createShareToken(),
        members: {
          deleteMany: {},
          create: members,
        },
      },
      include: { members: { orderBy: { email: 'asc' } } },
    })

    res.json(serializeShare(share, req))
  } catch (error) {
    handleControllerError('ResultShare', 'update share failed', error, res)
  }
}

export async function getSharedResults(req: Request<ShareParams>, res: Response) {
  try {
    const share = await prisma.eventResultShare.findUnique({
      where: { token: req.params.token },
      include: {
        members: { orderBy: { email: 'asc' } },
        event: {
          include: {
            sections: { orderBy: { order: 'asc' } },
            responses: {
              where: { stsrc: { not: 'D' } },
              orderBy: { submittedAt: 'desc' },
            },
            responseProgresses: {
              where: { stsrc: { not: 'D' } },
              orderBy: { updatedAt: 'desc' },
            },
          },
        },
      },
    })

    if (!share || share.event.stsrc === 'D') {
      res.status(404).json({ error: 'Shared results not found' })
      return
    }

    const user = await getOptionalUser(req)
    const role = getShareRole(share, user?.email)
    if (!role) {
      res.status(user ? 403 : 401).json({ error: 'You do not have access to these results' })
      return
    }

    res.json({
      role,
      share: serializeShare(share, req),
      event: {
        id: share.event.id,
        name: share.event.name,
        status: share.event.status,
        color: share.event.color,
        theme: share.event.theme,
        sections: share.event.sections,
        responses: share.event.responses,
        responseProgresses: share.event.responseProgresses,
      },
    })
  } catch (error) {
    handleControllerError('ResultShare', 'get shared results failed', error, res)
  }
}
