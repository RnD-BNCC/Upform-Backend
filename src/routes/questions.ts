import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /api/polls/{pollId}/questions:
 *   get:
 *     summary: Get all questions for a poll
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of questions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       text:
 *                         type: string
 *                       authorName:
 *                         type: string
 *                       authorId:
 *                         type: string
 *                         nullable: true
 *                       likeCount:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       likedByIds:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/', async (req: import('express').Request<{ pollId: string }>, res) => {
  const { pollId } = req.params

  const rawQuestions = await prisma.question.findMany({
    where: { pollId },
    orderBy: { createdAt: 'asc' },
    include: { likes: { select: { userId: true } } },
  })

  const questions = rawQuestions.map(q => ({
    id: q.id,
    text: q.text,
    authorName: q.authorName,
    authorId: q.authorId,
    likeCount: q.likeCount,
    createdAt: q.createdAt.toISOString(),
    likedByIds: q.likes.map(l => l.userId),
  }))

  res.json({ questions })
})

export default router
