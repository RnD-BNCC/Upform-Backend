import { S3Client } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  endpoint: 'https://s3.bncc.net',
  region: 'Jakarta',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  forcePathStyle: true,
})

export const S3_BUCKET = 'upform'
