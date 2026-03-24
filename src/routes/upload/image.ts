import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3, S3_BUCKET } from '../../config/s3.js'
import { requireAuth } from '../../middlewares/auth.js'

const router = Router()

const ALLOWED_TYPES = [
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file type'))
    }
  },
})

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const ext = path.extname(file.originalname) || '.png'
  const key = `slides/${crypto.randomUUID()}${ext}`

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  )

  const url = `https://s3.bncc.net/${S3_BUCKET}/${key}`

  res.json({ url })
})

export default router
