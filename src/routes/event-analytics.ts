import { Router } from 'express'
import { listEventAnalytics } from '../controllers/event-analytics.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /api/events/{eventId}/analytics:
 *   get:
 *     summary: List all analytics events for an event
 *     tags: [Analytics]
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
 *         description: List of analytics events sorted by occurredAt ascending
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EventAnalyticsEvent'
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
router.get('/', requireAuth, listEventAnalytics)

export default router
