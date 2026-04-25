import { Router } from 'express'
import {
  deleteResponse,
  getResponse,
  listResponses,
  submitResponse,
  updateResponse,
} from '../controllers/responses.controller.js'
import { requireAuth } from '../middlewares/auth.js'

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
router.get('/', requireAuth, listResponses)

/**
 * @swagger
 * /api/events/{eventId}/responses:
 *   post:
 *     summary: Submit a form response (public - no auth required for active events)
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
router.post('/', submitResponse)

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
router.get('/:responseId', requireAuth, getResponse)

/**
 * @swagger
 * /api/events/{eventId}/responses/{responseId}:
 *   patch:
 *     summary: Update answers of a submitted response
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               answers:
 *                 type: object
 *                 additionalProperties:
 *                   oneOf:
 *                     - type: string
 *                     - type: array
 *                       items:
 *                         type: string
 *                 example:
 *                   field-id-1: updated answer
 *     responses:
 *       200:
 *         description: Updated response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Response'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Response not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:responseId', requireAuth, updateResponse)

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
router.delete('/:responseId', requireAuth, deleteResponse)

export default router
