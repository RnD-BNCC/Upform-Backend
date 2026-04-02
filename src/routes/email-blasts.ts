import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import { emailQueue } from '../queues/email.queue.js'

const router = Router()
router.use(requireAuth)

router.post('/', async (req, res) => {
  const { subject, html, recipients } = req.body as {
    subject?: string
    html?: string
    recipients?: string[]
  }

  if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: 'subject, html, and recipients are required' })
    return
  }

  const unique = [...new Set(recipients.map((r) => r.trim().toLowerCase()))]

  const blast = await prisma.emailBlast.create({
    data: { subject, html, recipients: unique, totalCount: unique.length },
  })

  const jobs = unique.map((recipient) => ({
    name: `send:${recipient}`,
    data: { blastId: blast.id, recipient, subject, html },
  }))

  await emailQueue.addBulk(jobs)

  res.status(201).json(blast)
})

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const take = Math.min(100, Math.max(1, parseInt(req.query.take as string) || 20))
  const skip = (page - 1) * take

  const [blasts, total] = await Promise.all([
    prisma.emailBlast.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        subject: true,
        status: true,
        sentCount: true,
        failedCount: true,
        totalCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.emailBlast.count(),
  ])

  res.json({ data: blasts, meta: { page, take, total, totalPages: Math.ceil(total / take) } })
})

router.get('/:id', async (req, res) => {
  const blast = await prisma.emailBlast.findUnique({
    where: { id: req.params.id },
    include: {
      logs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!blast) {
    res.status(404).json({ error: 'Blast not found' })
    return
  }

  res.json(blast)
})

router.delete('/:id', async (req, res) => {
  const blast = await prisma.emailBlast.findUnique({ where: { id: req.params.id } })

  if (!blast) {
    res.status(404).json({ error: 'Blast not found' })
    return
  }

  const waiting = await emailQueue.getWaiting()
  const delayed = await emailQueue.getDelayed()
  const toRemove = [...waiting, ...delayed].filter((j) => j.data.blastId === blast.id)
  await Promise.all(toRemove.map((j) => j.remove()))

  await prisma.emailBlast.update({
    where: { id: blast.id },
    data: { status: 'cancelled' },
  })

  res.status(204).send()
})

export default router
