import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import { syncAndAppendRow } from '../config/google-sheets.js'

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /api/events/{eventId}/responses:
 *   get:
 *     summary: List all responses for an event
 *     tags: [Responses]
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
 *         description: List of responses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Response'
 *       404:
 *         description: Event not found
 */
router.get('/', requireAuth, async (req, res) => {
  const { eventId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  })
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const responses = await prisma.response.findMany({
    where: { eventId },
    orderBy: { submittedAt: 'desc' },
  })

  res.json(responses)
})

/**
 * @swagger
 * /api/events/{eventId}/responses:
 *   post:
 *     summary: Submit a form response (public — no auth required for active events)
 *     tags: [Responses]
 *     security: []
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
 *             $ref: '#/components/schemas/SubmitResponse'
 *     responses:
 *       201:
 *         description: Submitted response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Response'
 *       404:
 *         description: Event not found or not active
 */
router.post('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>
  const { answers } = req.body

  const event = await prisma.event.findFirst({
    where: { id: eventId, status: 'active' },
    include: { sections: { orderBy: { order: 'asc' } } },
  })
  if (!event) {
    res.status(404).json({ error: 'Event not found or not active' })
    return
  }

  const response = await prisma.response.create({
    data: {
      eventId,
      answers: answers ?? {},
    },
  })

  res.status(201).json(response)

  if (event.spreadsheetId && event.spreadsheetToken) {
    const allFields = event.sections.flatMap((s) => {
      const fields = s.fields as Array<{ id: string; label: string; type: string }>
      return fields.filter((f) => f.type !== 'title_block' && f.type !== 'image_block')
    })
    syncAndAppendRow(
      event.spreadsheetToken,
      event.spreadsheetId,
      allFields,
      answers as Record<string, string | string[]>,
      response.submittedAt.toISOString(),
    ).catch((err) => console.error('[spreadsheet sync+append]', err))
  }
})

/**
 * @swagger
 * /api/events/{eventId}/responses/{responseId}:
 *   get:
 *     summary: Get a single response
 *     tags: [Responses]
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
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Response detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Response'
 *       404:
 *         description: Not found
 */
router.get('/:responseId', requireAuth, async (req, res) => {
  const { eventId, responseId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  })
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const response = await prisma.response.findFirst({
    where: { id: responseId, eventId },
  })
  if (!response) {
    res.status(404).json({ error: 'Response not found' })
    return
  }

  res.json(response)
})

/**
 * @swagger
 * /api/events/{eventId}/responses/{responseId}:
 *   delete:
 *     summary: Delete a response
 *     tags: [Responses]
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
 *         name: responseId
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
router.delete('/:responseId', requireAuth, async (req, res) => {
  const { eventId, responseId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  })
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const existing = await prisma.response.findFirst({
    where: { id: responseId, eventId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Response not found' })
    return
  }

  await prisma.response.delete({ where: { id: responseId } })
  res.status(204).send()
})

export default router
