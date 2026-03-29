import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

/**
 * @swagger
 * /api/polls/{pollId}/slides:
 *   post:
 *     summary: Add a slide to a poll
 *     tags: [Poll Slides]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
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
 *               type:
 *                 type: string
 *                 enum: [word_cloud, multiple_choice, open_ended, ranking, scales]
 *               question:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *               settings:
 *                 type: object
 *     responses:
 *       201:
 *         description: Created slide
 *       404:
 *         description: Poll not found
 */
router.post('/', async (req, res) => {
  const { pollId } = req.params as Record<string, string>
  const { type, question, options, settings } = req.body

  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) {
    res.status(404).json({ error: 'Poll not found' })
    return
  }

  const maxOrder = await prisma.pollSlide.aggregate({
    where: { pollId },
    _max: { order: true },
  })

  const slide = await prisma.pollSlide.create({
    data: {
      pollId,
      type: type ?? 'multiple_choice',
      question: question ?? '',
      order: (maxOrder._max.order ?? -1) + 1,
      options: options ?? [],
      settings: settings ?? {},
    },
  })

  res.status(201).json(slide)
})

/**
 * @swagger
 * /api/polls/{pollId}/slides/{slideId}:
 *   patch:
 *     summary: Update a slide
 *     tags: [Poll Slides]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: slideId
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
 *               type:
 *                 type: string
 *               question:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *               settings:
 *                 type: object
 *               locked:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated slide
 *       404:
 *         description: Not found
 */
router.patch('/:slideId', async (req, res) => {
  const { pollId, slideId } = req.params as Record<string, string>
  const { type, question, options, settings, locked } = req.body

  const existing = await prisma.pollSlide.findFirst({
    where: { id: slideId, pollId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Slide not found' })
    return
  }

  const slide = await prisma.pollSlide.update({
    where: { id: slideId },
    data: {
      ...(type !== undefined && { type }),
      ...(question !== undefined && { question }),
      ...(options !== undefined && { options }),
      ...(settings !== undefined && { settings }),
      ...(locked !== undefined && { locked }),
    },
  })

  res.json(slide)
})

/**
 * @swagger
 * /api/polls/{pollId}/slides/{slideId}:
 *   delete:
 *     summary: Delete a slide
 *     tags: [Poll Slides]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: slideId
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
router.delete('/:slideId', async (req, res) => {
  const { pollId, slideId } = req.params as Record<string, string>

  const existing = await prisma.pollSlide.findFirst({
    where: { id: slideId, pollId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Slide not found' })
    return
  }

  await prisma.pollSlide.delete({ where: { id: slideId } })
  res.status(204).send()
})

/**
 * @swagger
 * /api/polls/{pollId}/slides/reorder:
 *   put:
 *     summary: Reorder slides
 *     tags: [Poll Slides]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order]
 *             properties:
 *               order:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Reordered slides
 */
router.put('/reorder', async (req, res) => {
  const { pollId } = req.params as Record<string, string>
  const { order } = req.body as { order: string[] }

  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) {
    res.status(404).json({ error: 'Poll not found' })
    return
  }

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.pollSlide.update({ where: { id }, data: { order: index } })
    )
  )

  const slides = await prisma.pollSlide.findMany({
    where: { pollId },
    orderBy: { order: 'asc' },
  })

  res.json(slides)
})

export default router
