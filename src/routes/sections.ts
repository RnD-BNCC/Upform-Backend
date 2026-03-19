import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

async function findEvent(eventId: string) {
  return prisma.event.findUnique({ where: { id: eventId } })
}

/**
 * @swagger
 * /api/events/{eventId}/sections:
 *   get:
 *     summary: List all sections for an event
 *     tags: [Sections]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of sections
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.get('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>

  const event = await findEvent(eventId)
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const sections = await prisma.section.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
  })

  res.json(sections)
})

/**
 * @swagger
 * /api/events/{eventId}/sections:
 *   post:
 *     summary: Add a new section to an event
 *     tags: [Sections]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSection'
 *     responses:
 *       201:
 *         description: Created section
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.post('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>
  const { title, description } = req.body

  const event = await findEvent(eventId)
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const maxOrder = await prisma.section.aggregate({
    where: { eventId },
    _max: { order: true },
  })

  const section = await prisma.section.create({
    data: {
      title: title ?? '',
      description: description ?? '',
      order: (maxOrder._max.order ?? -1) + 1,
      fields: [],
      eventId,
    },
  })

  res.status(201).json(section)
})

/**
 * @swagger
 * /api/events/{eventId}/sections/{sectionId}:
 *   patch:
 *     summary: Update a section (title, description, order, fields)
 *     tags: [Sections]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sectionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSection'
 *     responses:
 *       200:
 *         description: Updated section
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Section'
 *       404:
 *         description: Not found
 */
router.patch('/:sectionId', async (req, res) => {
  const { eventId, sectionId } = req.params as Record<string, string>
  const { title, description, order, fields } = req.body

  const event = await findEvent(eventId)
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const existing = await prisma.section.findFirst({
    where: { id: sectionId, eventId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Section not found' })
    return
  }

  const section = await prisma.section.update({
    where: { id: sectionId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(order !== undefined && { order }),
      ...(fields !== undefined && { fields }),
    },
  })

  res.json(section)
})

/**
 * @swagger
 * /api/events/{eventId}/sections/reorder:
 *   put:
 *     summary: Reorder sections by providing an array of section IDs
 *     tags: [Sections]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReorderSections'
 *     responses:
 *       200:
 *         description: Reordered sections
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.put('/reorder', async (req, res) => {
  const { eventId } = req.params as Record<string, string>
  const { order } = req.body as { order: string[] }

  const event = await findEvent(eventId)
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.section.update({ where: { id }, data: { order: index } })
    )
  )

  const sections = await prisma.section.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
  })

  res.json(sections)
})

/**
 * @swagger
 * /api/events/{eventId}/sections/{sectionId}:
 *   delete:
 *     summary: Delete a section
 *     tags: [Sections]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sectionId
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
router.delete('/:sectionId', async (req, res) => {
  const { eventId, sectionId } = req.params as Record<string, string>

  const event = await findEvent(eventId)
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const existing = await prisma.section.findFirst({
    where: { id: sectionId, eventId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Section not found' })
    return
  }

  await prisma.section.delete({ where: { id: sectionId } })
  res.status(204).send()
})

export default router
