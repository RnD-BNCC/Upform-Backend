import { Router } from 'express'
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import { s3, S3_BUCKET } from '../config/s3.js'

const router = Router()

const S3_BASE_URL = `https://s3.bncc.net/${S3_BUCKET}/`

type FileEntry = {
  fieldId: string
  fieldLabel: string
  url: string
  filename: string
}

type FormField = {
  id: string
  type: string
  label: string
}

function extractFiles(value: unknown, fieldId: string, fieldLabel: string): FileEntry[] {
  if (!value) return []
  const toEntry = (v: unknown): FileEntry | null => {
    if (typeof v === 'string' && v.includes('::')) {
      const sepIdx = v.indexOf('::')
      const filename = v.slice(0, sepIdx)
      const url = v.slice(sepIdx + 2)
      return { fieldId, fieldLabel, url, filename }
    }
    if (typeof v === 'string' && v.startsWith('http')) {
      const parts = v.split('/')
      return { fieldId, fieldLabel, url: v, filename: decodeURIComponent(parts[parts.length - 1]) }
    }
    if (typeof v === 'object' && v !== null && 'url' in v) {
      const obj = v as Record<string, unknown>
      const url = String(obj.url)
      const filename = typeof obj.filename === 'string' ? obj.filename : decodeURIComponent(url.split('/').pop() ?? '')
      return { fieldId, fieldLabel, url, filename }
    }
    return null
  }
  if (Array.isArray(value)) {
    return value.map(toEntry).filter(Boolean) as FileEntry[]
  }
  const entry = toEntry(value)
  return entry ? [entry] : []
}

const TEXT_TYPES = new Set(['text', 'short_text', 'email', 'short_answer', 'name', 'paragraph'])

function extractRespondentLabel(answers: Record<string, unknown>, fields: FormField[]): string {
  for (const field of fields) {
    if (TEXT_TYPES.has(field.type)) {
      const val = answers[field.id]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
  }
  return 'Anonymous'
}

// GET /api/gallery/files
router.get('/files', requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 20))
  const skip = (page - 1) * take

  const events = await prisma.event.findMany({
    include: {
      sections: { orderBy: { order: 'asc' } },
      responses: { orderBy: { submittedAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  let totalFiles = 0

  const result = events
    .map((event) => {
      const allFields: FormField[] = event.sections.flatMap((s) => {
        const fields = s.fields as FormField[]
        return Array.isArray(fields) ? fields : []
      })
      const fileFields = allFields.filter((f) => f.type === 'file_upload')
      if (fileFields.length === 0) return null

      const responses = event.responses
        .map((response) => {
          const answers = (response.answers ?? {}) as Record<string, unknown>
          const files: FileEntry[] = fileFields.flatMap((f) =>
            extractFiles(answers[f.id], f.id, f.label)
          )
          if (files.length === 0) return null
          totalFiles += files.length
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
        fileCount: responses.reduce((sum, r) => sum + r!.files.length, 0),
        responses,
      }
    })
    .filter(Boolean)

  const total = result.length
  const paginated = result.slice(skip, skip + take)

  res.json({
    totalFiles,
    events: paginated,
    meta: { page, take, total, totalPages: Math.ceil(total / take) },
  })
})

// GET /api/gallery/media — list all objects under slides/ prefix directly from S3
router.get('/media', requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const take = Math.min(100, Math.max(1, parseInt(req.query.take as string) || 21))
  const skip = (page - 1) * take

  const items: { key: string; url: string; filename: string; size: number; lastModified: string }[] = []
  let continuationToken: string | undefined

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: 'slides/',
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue
      items.push({
        key: obj.Key,
        url: `${S3_BASE_URL}${obj.Key}`,
        filename: decodeURIComponent(obj.Key.split('/').pop() ?? obj.Key),
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? '',
      })
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined
  } while (continuationToken)

  items.sort((a, b) => b.lastModified.localeCompare(a.lastModified))

  const total = items.length
  const paginated = items.slice(skip, skip + take)

  res.json({
    items: paginated,
    meta: { page, take, total, totalPages: Math.ceil(total / take) },
  })
})

// DELETE /api/gallery/file
router.delete('/file', requireAuth, async (req, res) => {
  const { url } = req.body as { url?: string }
  if (!url || !url.startsWith(S3_BASE_URL)) {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const key = url.slice(S3_BASE_URL.length)
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
  res.json({ ok: true })
})

export default router
