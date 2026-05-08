import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { prisma } from '../config/prisma.js'
import { s3, S3_BUCKET } from '../config/s3.js'
import { syncDriveGalleryFiles, type DriveGalleryFile } from '../config/google-drive.js'
import type { FileEntry, FormField } from '../types/gallery.js'

const S3_BASE_URL = `https://s3.bncc.net/${S3_BUCKET}/`
const TEXT_TYPES = new Set(['text', 'short_text', 'email', 'short_answer', 'name', 'paragraph'])

function extractFiles(value: unknown, fieldId: string, fieldLabel: string): FileEntry[] {
  if (!value) return []
  const fieldName = fieldLabel?.trim() || 'Untitled upload'

  const toEntry = (v: unknown): FileEntry | null => {
    if (typeof v === 'string' && v.includes('::')) {
      const sepIdx = v.indexOf('::')
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename: v.slice(0, sepIdx),
        url: v.slice(sepIdx + 2),
      }
    }

    if (typeof v === 'string' && v.startsWith('http')) {
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename: decodeURIComponent(v.split('/').pop() ?? ''),
        url: v,
      }
    }

    if (typeof v === 'object' && v !== null && 'url' in v) {
      const obj = v as Record<string, unknown>
      const url = String(obj.url)
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename:
          typeof obj.filename === 'string'
            ? obj.filename
            : decodeURIComponent(url.split('/').pop() ?? ''),
        url,
      }
    }

    return null
  }

  if (Array.isArray(value)) return value.map(toEntry).filter(Boolean) as FileEntry[]
  const entry = toEntry(value)
  return entry ? [entry] : []
}

function extractRespondentLabel(answers: Record<string, unknown>, fields: FormField[]) {
  for (const field of fields) {
    if (!TEXT_TYPES.has(field.type)) continue
    const value = answers[field.id]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return 'Anonymous'
}

export async function syncEventFilesToConnectedDrive(eventId: string, responseId?: string) {
  const share = await prisma.galleryShare.findUnique({
    where: { eventId },
    include: {
      driveConnections: {
        where: { syncEnabled: true },
        orderBy: { ownerEmail: 'asc' },
      },
    },
  })
  if (!share?.driveSyncEnabled) {
    return { uploaded: 0, skipped: 0, failed: 0 }
  }

  const driveTargets =
    share.driveConnections.length > 0
      ? share.driveConnections.map((connection) => ({
          refreshToken: connection.refreshToken,
          folderId: connection.folderId,
        }))
      : share.driveFolderId && share.driveRefreshToken
        ? [{ refreshToken: share.driveRefreshToken, folderId: share.driveFolderId }]
        : []

  if (driveTargets.length === 0) {
    return { uploaded: 0, skipped: 0, failed: 0 }
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      sections: { orderBy: { order: 'asc' } },
      responses: {
        where: {
          deletedAt: null,
          ...(responseId ? { id: responseId } : {}),
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  })
  if (!event) return { uploaded: 0, skipped: 0, failed: 0 }

  const allFields: FormField[] = event.sections.flatMap((section) => {
    const fields = section.fields as FormField[]
    return Array.isArray(fields) ? fields : []
  })
  const fileFields = allFields.filter((field) => field.type === 'file_upload')
  if (fileFields.length === 0) return { uploaded: 0, skipped: 0, failed: 0 }

  const driveFiles: DriveGalleryFile[] = event.responses.flatMap((response) => {
    const answers = (response.answers ?? {}) as Record<string, unknown>
    const respondentLabel = extractRespondentLabel(answers, allFields)
    const files = fileFields.flatMap((field) => extractFiles(answers[field.id], field.id, field.label))

    return files.map((file) => ({
      eventId,
      responseId: response.id,
      respondentLabel,
      filename: file.filename,
      sourceUrl: file.url,
      getContent: async () => {
        if (!file.url.startsWith(S3_BASE_URL)) return null

        const key = decodeURIComponent(file.url.slice(S3_BASE_URL.length))
        const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))
        if (object.Body instanceof Readable) {
          return { body: object.Body, contentType: object.ContentType ?? undefined }
        }

        const body = await object.Body?.transformToByteArray()
        return {
          body: Buffer.from(body ?? []),
          contentType: object.ContentType ?? undefined,
        }
      },
    }))
  })

  if (driveFiles.length === 0) return { uploaded: 0, skipped: 0, failed: 0 }

  const total = { uploaded: 0, skipped: 0, failed: 0 }
  for (const target of driveTargets) {
    const result = await syncDriveGalleryFiles(target.refreshToken, target.folderId, driveFiles)
    total.uploaded += result.uploaded
    total.skipped += result.skipped
    total.failed += result.failed
  }

  return total
}
