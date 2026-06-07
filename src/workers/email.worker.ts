import { emailBlastRepository, emailLogRepository } from '@/modules/email-blasts/email-blasts.repository.js'
import { Worker, type Job } from 'bullmq'
import { redis } from '@/config/redis.js'
import { mailer, SMTP_FROM } from '@/config/mailer.js'
import type { EmailJobData } from '@/queues/email.queue.js'
import { getInlineEmailAttachments, inlineBrandLogo } from '@/utils/email-inline-assets.js'

async function processEmail(job: Job<EmailJobData>) {
  const { blastId, recipient, subject, html } = job.data

  await emailBlastRepository.update({
    where: { id: blastId },
    data: { status: 'processing' },
  })

  const emailHtml = inlineBrandLogo(html)

  await mailer.sendMail({
    attachments: getInlineEmailAttachments(emailHtml),
    from: SMTP_FROM,
    html: emailHtml,
    subject,
    to: recipient,
  })

  await emailLogRepository.upsert({
    where: { blastId_recipient: { blastId, recipient } },
    create: { blastId, recipient, status: 'sent', attempt: job.attemptsMade + 1, sentAt: new Date() },
    update: { status: 'sent', attempt: job.attemptsMade + 1, sentAt: new Date(), error: null },
  })

  await emailBlastRepository.update({
    where: { id: blastId },
    data: { sentCount: { increment: 1 } },
  })
}

async function onFailed(job: Job<EmailJobData> | undefined, err: Error) {
  if (!job) return
  const { blastId, recipient } = job.data
  const isFinal = job.attemptsMade >= (job.opts.attempts ?? 5)

  await emailLogRepository.upsert({
    where: { blastId_recipient: { blastId, recipient } },
    create: { blastId, recipient, status: 'failed', attempt: job.attemptsMade, error: err.message },
    update: { status: 'failed', attempt: job.attemptsMade, error: err.message },
  })

  if (isFinal) {
    await emailBlastRepository.update({
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
  const blast = await emailBlastRepository.findUnique({ where: { id: blastId } })
  if (!blast) return

  const processed = blast.sentCount + blast.failedCount
  if (processed < blast.totalCount) return

  let status = 'done'
  if (blast.sentCount === 0) status = 'failed'
  else if (blast.failedCount > 0) status = 'partial_failed'

  await emailBlastRepository.update({ where: { id: blastId }, data: { status } })
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
