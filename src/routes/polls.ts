import { Router } from 'express'
import {
  createPoll,
  deletePoll,
  deletePollVotes,
  getPoll,
  listPollScores,
  listPolls,
  updatePoll,
} from '../controllers/polls.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

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
router.get('/', listPolls)

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
router.get('/:id', getPoll)

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
router.post('/', createPoll)

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
router.patch('/:id', updatePoll)

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
router.delete('/:id', deletePoll)

/**
 * @swagger
 * /api/polls/{id}/scores:
 *   get:
 *     summary: Get live poll scores from in-memory socket state
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
 *         description: Map of participantId to score
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: number
 *               example:
 *                 participant-uuid-1: 3
 *                 participant-uuid-2: 1
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/scores', listPollScores)

/**
 * @swagger
 * /api/polls/{id}/votes:
 *   delete:
 *     summary: Delete all votes for every slide in a poll
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
 *         description: All votes deleted
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id/votes', deletePollVotes)

export default router
