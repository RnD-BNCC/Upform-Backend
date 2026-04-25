import { Router } from 'express'
import { deleteQuestions, listQuestions } from '../controllers/questions.controller.js'

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
router.get('/', listQuestions)

/**
 * @swagger
 * /api/polls/{pollId}/questions:
 *   delete:
 *     summary: Delete all questions for a poll
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: All questions deleted
 */
router.delete('/', deleteQuestions)

export default router
