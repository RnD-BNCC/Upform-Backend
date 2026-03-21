import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { getIO, addScore } from '../config/socket.js'
import { aggregateResults } from '../utils/poll-aggregation.js'

const router = Router()

/**
 * @swagger
 * /api/public/polls/join/{code}:
 *   get:
 *     summary: Join a poll by code (no auth)
 *     tags: [Public Polls]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Poll info with slides
 *       404:
 *         description: Poll not found or ended
 */
router.get('/join/:code', async (req, res) => {
  const poll = await prisma.poll.findUnique({
    where: { code: req.params.code },
    include: { slides: { orderBy: { order: 'asc' } } },
  })

  if (!poll || poll.status === 'ended') {
    res.status(404).json({ error: 'Poll not found or has ended' })
    return
  }

  const sanitizedPoll = {
    ...poll,
    slides: poll.slides.map(slide => {
      const { correctAnswer, correctAnswers, ...safeSettings } = (slide.settings as Record<string, unknown>) ?? {}
      return { ...slide, settings: safeSettings }
    }),
  }
  res.json(sanitizedPoll)
})

/**
 * @swagger
 * /api/public/polls/{pollId}/slides/{slideId}/vote:
 *   post:
 *     summary: Submit a vote (no auth, upsert by participantId)
 *     tags: [Public Polls]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participantId, value]
 *             properties:
 *               participantId:
 *                 type: string
 *               value:
 *                 type: object
 *     responses:
 *       200:
 *         description: Vote recorded
 *       404:
 *         description: Slide not found or poll not active
 */
router.post('/:pollId/slides/:slideId/vote', async (req, res) => {
  const { pollId, slideId } = req.params
  const { participantId, value } = req.body

  if (!participantId || value === undefined) {
    res.status(400).json({ error: 'participantId and value are required' })
    return
  }

  const slide = await prisma.pollSlide.findFirst({
    where: { id: slideId, pollId, poll: { status: 'active' } },
  })
  if (!slide) {
    res.status(404).json({ error: 'Slide not found or poll not active' })
    return
  }

  if (slide.locked) {
    res.status(403).json({ error: 'Voting is locked for this slide' })
    return
  }

  const vote = await prisma.pollVote.upsert({
    where: { slideId_participantId: { slideId, participantId } },
    create: { slideId, participantId, value },
    update: { value },
  })

  const results = await aggregateResults(slide.type, slideId)
  const io = getIO()
  io.to(`poll:${pollId}`).emit('vote-update', { slideId, results })

  // Check correctness and award points for quiz slides
  const settings = (slide.settings as Record<string, unknown>) ?? {}
  const correctAnswer = settings.correctAnswer as string | undefined
  const correctAnswers = settings.correctAnswers as string[] | undefined
  const isQuizSlide = !!(correctAnswer || (correctAnswers && correctAnswers.length > 0))

  if (isQuizSlide) {
    let isCorrect = false
    if (slide.type === 'multiple_choice' && correctAnswer) {
      isCorrect = (value as { option?: string }).option === correctAnswer
    } else if (slide.type === 'open_ended' && correctAnswers && correctAnswers.length > 0) {
      const submitted = (value as { text?: string }).text?.trim().toLowerCase() ?? ''
      isCorrect = correctAnswers.some(a => a.trim().toLowerCase() === submitted)
    }

    let points = 0
    if (isCorrect) {
      const priorVotes = await prisma.pollVote.count({
        where: { slideId, createdAt: { lt: vote.createdAt } },
      })
      points = Math.max(100, 1000 - priorVotes * 100)
      addScore(pollId, participantId, points)
    }

    io.to(`poll:${pollId}`).emit('score-update', { participantId, points, isCorrect })
  }

  res.json({ ok: true })
})

/**
 * @swagger
 * /api/public/polls/{pollId}/slides/{slideId}/results:
 *   get:
 *     summary: Get aggregated results for a slide (no auth)
 *     tags: [Public Polls]
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
 *       200:
 *         description: Aggregated results
 *       404:
 *         description: Slide not found
 */
router.get('/:pollId/slides/:slideId/results', async (req, res) => {
  const { pollId, slideId } = req.params

  const slide = await prisma.pollSlide.findFirst({
    where: { id: slideId, pollId },
  })
  if (!slide) {
    res.status(404).json({ error: 'Slide not found' })
    return
  }

  const results = await aggregateResults(slide.type, slideId)
  res.json(results)
})

export default router
