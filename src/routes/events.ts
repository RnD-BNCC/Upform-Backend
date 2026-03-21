import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: List events with pagination, filtering, and search
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 9
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, closed]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by event name
 *     responses:
 *       200:
 *         description: Paginated list of events with counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     take:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 counts:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     totalResponses:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
  const skip = (page - 1) * take
  const status = req.query.status as string | undefined
  const search = req.query.search as string | undefined

  const where: Record<string, unknown> = {}
  if (status && ['draft', 'active', 'closed'].includes(status)) {
    where.status = status
  }
  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const [events, total, allEvents] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        sections: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
    prisma.event.count({ where }),
    prisma.event.findMany({
      select: { status: true, _count: { select: { responses: true } } },
    }),
  ])

  const data = events.map(({ _count, ...event }) => ({
    ...event,
    responseCount: _count.responses,
  }))

  const counts = {
    total: allEvents.length,
    active: allEvents.filter((e) => e.status === 'active').length,
    totalResponses: allEvents.reduce((sum, e) => sum + e._count.responses, 0),
  }

  res.json({
    data,
    meta: { page, take, total, totalPages: Math.ceil(total / take) },
    counts,
  })
})

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Get a single event with sections and responses
 *     tags: [Events]
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
 *         description: Event detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: {
      sections: { orderBy: { order: 'asc' } },
      responses: { orderBy: { submittedAt: 'desc' } },
    },
  })

  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  res.json(event)
})

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEvent'
 *     responses:
 *       201:
 *         description: Created event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 */
router.post('/', async (req, res) => {
  const { name, description, color } = req.body

  const event = await prisma.event.create({
    data: {
      name: name ?? '',
      description: description ?? '',
      color: color ?? '#0054a5',
      sections: {
        create: { title: 'Section 1', order: 0, fields: [] },
      },
    },
    include: {
      sections: { orderBy: { order: 'asc' } },
    },
  })

  res.status(201).json(event)
})

/**
 * @swagger
 * /api/events/{id}:
 *   patch:
 *     summary: Update an event
 *     tags: [Events]
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
 *             $ref: '#/components/schemas/UpdateEvent'
 *     responses:
 *       200:
 *         description: Updated event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 */
router.patch('/:id', async (req, res) => {
  const { name, description, status, color, image } = req.body

  const existing = await prisma.event.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(color !== undefined && { color }),
      ...(image !== undefined && { image }),
    },
    include: {
      sections: { orderBy: { order: 'asc' } },
    },
  })

  res.json(event)
})

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Delete an event and all its sections/responses
 *     tags: [Events]
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
  const existing = await prisma.event.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  await prisma.event.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

export default router
