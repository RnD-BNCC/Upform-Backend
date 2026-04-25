import { Router } from 'express'
import {
  createPollSlide,
  deletePollSlide,
  reorderPollSlides,
  updatePollSlide,
} from '../controllers/poll-slides.controller.js'
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
router.post('/', createPollSlide)

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
router.patch('/:slideId', updatePollSlide)

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
router.delete('/:slideId', deletePollSlide)

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
router.put('/reorder', reorderPollSlides)

export default router
