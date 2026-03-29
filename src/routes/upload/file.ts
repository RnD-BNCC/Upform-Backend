import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3, S3_BUCKET } from '../../config/s3.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
})

router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const ext = path.extname(file.originalname) || ''
  const key = `files/${crypto.randomUUID()}${ext}`

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  )

  const url = `https://s3.bncc.net/${S3_BUCKET}/${key}`

  res.json({ url, filename: file.originalname })
})

export default router
