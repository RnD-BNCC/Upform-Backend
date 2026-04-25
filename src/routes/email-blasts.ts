import { Router } from 'express'
import {
  createEmailBlast,
  deleteEmailBlast,
  getEmailComposerDraft,
  getEmailBlast,
  listEmailBlasts,
  saveEmailComposerDraft,
} from '../controllers/email-blasts.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

/**
 * @swagger
 * /api/email-blasts/events/{eventId}/draft:
 *   get:
 *     summary: Get email composer draft for an event
 *     tags: [Email Blasts]
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
 *         description: Draft object (null body if none exists yet)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailComposerDraft'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/events/:eventId/draft', getEmailComposerDraft)

/**
 * @swagger
 * /api/email-blasts/events/{eventId}/draft:
 *   put:
 *     summary: Save (upsert) email composer draft for an event
 *     tags: [Email Blasts]
 *     security:
 *       - BearerAuth: []
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
 *             $ref: '#/components/schemas/SaveEmailComposerDraft'
 *     responses:
 *       200:
 *         description: Saved draft
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailComposerDraft'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/events/:eventId/draft', saveEmailComposerDraft)

/**
 * @swagger
 * /api/email-blasts:
 *   post:
 *     summary: Create and queue an email blast
 *     tags: [Email Blasts]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, html, recipients]
 *             properties:
 *               eventId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional — links the blast to an event
 *               subject:
 *                 type: string
 *                 example: Welcome to the event!
 *               html:
 *                 type: string
 *                 description: Full HTML body of the email
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *                 description: Duplicate addresses are deduplicated automatically
 *                 example: ["alice@example.com", "bob@example.com"]
 *     responses:
 *       201:
 *         description: Blast created and jobs queued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailBlastDetail'
 *       400:
 *         description: Missing subject / html / recipients or empty recipient list
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
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', createEmailBlast)

/**
 * @swagger
 * /api/email-blasts:
 *   get:
 *     summary: List email blasts with pagination
 *     tags: [Email Blasts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by event
 *     responses:
 *       200:
 *         description: Paginated email blasts (summary — no html/recipients)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EmailBlast'
 *                 meta:
 *                   $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', listEmailBlasts)

/**
 * @swagger
 * /api/email-blasts/{id}:
 *   get:
 *     summary: Get email blast detail including per-recipient logs
 *     tags: [Email Blasts]
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
 *         description: Full blast with html, recipients, and logs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailBlastDetail'
 *       404:
 *         description: Blast not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', getEmailBlast)

/**
 * @swagger
 * /api/email-blasts/{id}:
 *   delete:
 *     summary: Cancel a blast — removes queued jobs and marks status as cancelled
 *     tags: [Email Blasts]
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
 *         description: Cancelled
 *       404:
 *         description: Blast not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', deleteEmailBlast)

export default router
