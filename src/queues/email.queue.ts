import { Queue } from 'bullmq'
import { redis } from '../config/redis.js'

export type EmailJobData = {
  blastId: string
  recipient: string
  subject: string
  html: string
}

export const emailQueue = new Queue<EmailJobData>('email-blast', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})
