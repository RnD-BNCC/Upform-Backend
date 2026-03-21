import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import { getIO, getPollScores } from '../config/socket.js'

const router = Router()
router.use(requireAuth)

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000))
}

/**
 * @swagger
 * /api/polls:
 *   get:
 *     summary: List all polls
 *     tags: [Polls]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 9
 *     responses:
 *       200:
 *         description: Paginated polls
 */
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
  const skip = (page - 1) * take
  const search = req.query.search as string | undefined

  const where: Record<string, unknown> = {}
  if (search) {
    where.title = { contains: search, mode: 'insensitive' }
  }

  const [polls, total] = await Promise.all([
    prisma.poll.findMany({
      where,
      include: { slides: { orderBy: { order: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
    prisma.poll.count({ where }),
  ])

  res.json({
    data: polls,
    meta: { page, take, total, totalPages: Math.ceil(total / take) },
  })
})

/**
 * @swagger
 * /api/polls/{id}:
 *   get:
 *     summary: Get a poll with slides
 *     tags: [Polls]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Poll detail
 *       404:
 *         description: Not found
 */
router.get('/:id', async (req, res) => {
  const poll = await prisma.poll.findUnique({
    where: { id: req.params.id },
    include: { slides: { orderBy: { order: 'asc' } } },
  })

  if (!poll) {
    res.status(404).json({ error: 'Poll not found' })
    return
  }

  res.json(poll)
})

/**
 * @swagger
 * /api/polls:
 *   post:
 *     summary: Create a new poll
 *     tags: [Polls]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created poll
 */
router.post('/', async (req, res) => {
  const { title } = req.body

  let code = generateCode()
  while (await prisma.poll.findUnique({ where: { code } })) {
    code = generateCode()
  }

  const poll = await prisma.poll.create({
    data: {
      title: title ?? '',
      code,
      slides: {
        create: {
          type: 'multiple_choice',
          question: '',
          order: 0,
          options: [],
        },
      },
    },
    include: { slides: { orderBy: { order: 'asc' } } },
  })

  res.status(201).json(poll)
})

/**
 * @swagger
 * /api/polls/{id}:
 *   patch:
 *     summary: Update a poll (title, status, currentSlide)
 *     tags: [Polls]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [waiting, active, ended]
 *               currentSlide:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated poll
 *       404:
 *         description: Not found
 */
router.patch('/:id', async (req, res) => {
  const { title, status, currentSlide, settings } = req.body

  const existing = await prisma.poll.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Poll not found' })
    return
  }

  const poll = await prisma.poll.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(currentSlide !== undefined && { currentSlide }),
      ...(settings !== undefined && { settings }),
    },
    include: { slides: { orderBy: { order: 'asc' } } },
  })

  const io = getIO()
  if (status !== undefined) {
    io.to(`poll:${poll.id}`).emit('poll-state', { status: poll.status })
  }
  if (currentSlide !== undefined) {
    io.to(`poll:${poll.id}`).emit('slide-change', { currentSlide: poll.currentSlide })
  }

  res.json(poll)
})

/**
 * @swagger
 * /api/polls/{id}:
 *   delete:
 *     summary: Delete a poll
 *     tags: [Polls]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete('/:id', async (req, res) => {
  const existing = await prisma.poll.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Poll not found' })
    return
  }

  await prisma.poll.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

router.get('/:id/scores', async (req, res) => {
  const scores = getPollScores(req.params.id)
  res.json(scores)
})

router.delete('/:id/votes', async (req, res) => {
  const slides = await prisma.pollSlide.findMany({
    where: { pollId: req.params.id },
    select: { id: true },
  })
  await prisma.pollVote.deleteMany({
    where: { slideId: { in: slides.map(s => s.id) } },
  })
  res.status(204).send()
})

export default router
