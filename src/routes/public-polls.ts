import { Router } from 'express'
import {
  getPollSlideResults,
  joinPollByCode,
  submitPollVote,
  togglePollVoteAnswer,
} from '../controllers/public-polls.controller.js'

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
router.get('/join/:code', joinPollByCode)

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
router.post('/:pollId/slides/:slideId/vote', submitPollVote)

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
router.get('/:pollId/slides/:slideId/results', getPollSlideResults)

/**
 * @swagger
 * /api/public/polls/{pollId}/slides/{slideId}/votes/{voteId}/answer:
 *   patch:
 *     summary: Toggle mark-as-answered on a Q&A vote
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
 *       - in: path
 *         name: voteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Vote updated
 *       404:
 *         description: Vote not found
 */
router.patch('/:pollId/slides/:slideId/votes/:voteId/answer', togglePollVoteAnswer)

export default router
