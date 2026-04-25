import { Router } from 'express'
import {
  deletePublicResponseProgress,
  getPublicEvent,
  savePublicResponseProgress,
  submitPublicResponse,
  updatePublicResponseProgress,
} from '../controllers/public.controller.js'

const router = Router()

/**
 * @swagger
 * /api/public/events/{id}:
 *   get:
 *     summary: Get a public event for form filling (active events only, no auth)
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public event with sections (status must be active)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Form not found or not accepting responses
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/events/:id', getPublicEvent)

/**
 * @swagger
 * /api/public/events/{id}/responses:
 *   post:
 *     summary: Submit a completed form response (no auth required)
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Response submitted. Cleans up any matching in-progress record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Response'
 *       404:
 *         description: Event not found or not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/events/:id/responses', submitPublicResponse)

/**
 * @swagger
 * /api/public/events/{id}/response-progress:
 *   post:
 *     summary: Save in-progress form answers (no auth, upsert by respondentUuid)
 *     description: |
 *       Creates a new progress record, or updates the existing one if a record with the same
 *       respondentUuid already exists for this event.
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Existing record updated (same respondentUuid found)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseProgress'
 *       201:
 *         description: New progress record created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseProgress'
 *       404:
 *         description: Event not found or not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/events/:id/response-progress', savePublicResponseProgress)

/**
 * @swagger
 * /api/public/events/{id}/response-progress/{progressId}:
 *   patch:
 *     summary: Update a saved in-progress response by ID (no auth)
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseProgress'
 *       404:
 *         description: Event not active or progress record not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/events/:id/response-progress/:progressId', updatePublicResponseProgress)

/**
 * @swagger
 * /api/public/events/{id}/response-progress/{progressId}:
 *   delete:
 *     summary: Delete a saved in-progress response (no auth)
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
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
 */
router.delete('/events/:id/response-progress/:progressId', deletePublicResponseProgress)

export default router
