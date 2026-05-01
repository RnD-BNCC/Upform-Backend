import { Router } from 'express'
import {
  deleteResponseProgress,
  listResponseProgress,
  updateResponseProgress,
} from '../controllers/response-progress.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /api/events/{eventId}/response-progress:
 *   get:
 *     summary: List all in-progress (unsaved) responses for an event
 *     tags: [Response Progress]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted progress records
 *     responses:
 *       200:
 *         description: List of in-progress responses, sorted by most recently updated
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResponseProgress'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, listResponseProgress)

/**
 * @swagger
 * /api/events/{eventId}/response-progress/{progressId}:
 *   patch:
 *     summary: Update an in-progress response
 *     tags: [Response Progress]
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
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveResponseProgressBody'
 *     responses:
 *       200:
 *         description: Updated in-progress response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseProgress'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Response progress not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:progressId', requireAuth, updateResponseProgress)

/**
 * @swagger
 * /api/events/{eventId}/response-progress/{progressId}:
 *   delete:
 *     summary: Delete an in-progress response
 *     tags: [Response Progress]
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
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:progressId', requireAuth, deleteResponseProgress)

export default router
