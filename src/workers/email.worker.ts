import { Worker, type Job } from 'bullmq'
import { redis } from '../config/redis.js'
import { mailer, SMTP_FROM } from '../config/mailer.js'
import { prisma } from '../config/prisma.js'
import type { EmailJobData } from '../queues/email.queue.js'

async function processEmail(job: Job<EmailJobData>) {
  const { blastId, recipient, subject, html } = job.data

  await prisma.emailBlast.update({
    where: { id: blastId },
    data: { status: 'processing' },
  })

  await mailer.sendMail({ from: SMTP_FROM, to: recipient, subject, html })

  await prisma.emailLog.upsert({
    where: { blastId_recipient: { blastId, recipient } },
    create: { blastId, recipient, status: 'sent', attempt: job.attemptsMade + 1, sentAt: new Date() },
    update: { status: 'sent', attempt: job.attemptsMade + 1, sentAt: new Date(), error: null },
  })

  await prisma.emailBlast.update({
    where: { id: blastId },
    data: { sentCount: { increment: 1 } },
  })
}

async function onFailed(job: Job<EmailJobData> | undefined, err: Error) {
  if (!job) return
  const { blastId, recipient } = job.data
  const isFinal = job.attemptsMade >= (job.opts.attempts ?? 5)

  await prisma.emailLog.upsert({
    where: { blastId_recipient: { blastId, recipient } },
    create: { blastId, recipient, status: 'failed', attempt: job.attemptsMade, error: err.message },
    update: { status: 'failed', attempt: job.attemptsMade, error: err.message },
  })

  if (isFinal) {
    await prisma.emailBlast.update({
      where: { id: blastId },
      data: { failedCount: { increment: 1 } },
    })
    await syncBlastStatus(blastId)
  }
}

async function onCompleted(job: Job<EmailJobData>) {
  await syncBlastStatus(job.data.blastId)
}

async function syncBlastStatus(blastId: string) {
  const blast = await prisma.emailBlast.findUnique({ where: { id: blastId } })
  if (!blast) return

  const processed = blast.sentCount + blast.failedCount
  if (processed < blast.totalCount) return

  let status = 'done'
  if (blast.sentCount === 0) status = 'failed'
  else if (blast.failedCount > 0) status = 'partial_failed'

  await prisma.emailBlast.update({ where: { id: blastId }, data: { status } })
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>('email-blast', processEmail, {
    connection: redis,
    concurrency: 5,
  })

  worker.on('completed', onCompleted)
  worker.on('failed', onFailed)

  worker.on('error', (err) => {
    console.error('[email-worker] error:', err.message)
  })

  console.log('[email-worker] started')
  return worker
}
