import type { Request, Response } from 'express'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import multer from 'multer'
import path from 'path'
import { s3, S3_BUCKET } from '../config/s3.js'
import { handleControllerError } from '../utils/controller-error.js'

const ALLOWED_IMAGE_TYPES = [
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

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file type'))
    }
  },
})

export const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
})

export async function uploadImage(req: Request, res: Response) {
  try {
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
  } catch (error) {
    handleControllerError('Upload', 'upload image failed', error, res)
  }
}

export async function uploadFile(req: Request, res: Response) {
  try {
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
  } catch (error) {
    handleControllerError('Upload', 'upload file failed', error, res)
  }
}
