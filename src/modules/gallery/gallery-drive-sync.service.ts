import { eventRepository, galleryShareRepository } from '@/modules/gallery/gallery.repository.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { s3, S3_BUCKET } from '@/config/s3.js'
import { syncDriveGalleryFiles, type DriveGalleryFile } from '@/config/google-drive.js'
import { extractGalleryFiles, extractRespondentLabel } from '@/modules/gallery/gallery-file.utils.js'
import type { FormField } from '@/modules/gallery/gallery.types.js'
import { getActiveFormFields } from '@/utils/form-fields.js'

const S3_BASE_URL = `https://s3.bncc.net/${S3_BUCKET}/`

export async function syncEventFilesToConnectedDrive(eventId: string, responseId?: string) {
  const share = await galleryShareRepository.findUnique({
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

  const event = await eventRepository.findFirst({
    where: { id: eventId, stsrc: { not: 'D' } },
    include: {
      sections: { orderBy: { order: 'asc' } },
      responses: {
        where: {
          stsrc: { not: 'D' },
          ...(responseId ? { id: responseId } : {}),
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  })
  if (!event) return { uploaded: 0, skipped: 0, failed: 0 }

  const allFields: FormField[] = event.sections.flatMap((section) => {
    return getActiveFormFields(section.fields) as FormField[]
  })
  const fileFields = allFields.filter((field) => field.type === 'file_upload')
  if (fileFields.length === 0) return { uploaded: 0, skipped: 0, failed: 0 }

  const driveFiles: DriveGalleryFile[] = event.responses.flatMap((response) => {
    const answers = (response.answers ?? {}) as Record<string, unknown>
    const respondentLabel = extractRespondentLabel(answers, allFields)
    const files = fileFields.flatMap((field) =>
      extractGalleryFiles(answers[field.id], field.id, field.label),
    )

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
