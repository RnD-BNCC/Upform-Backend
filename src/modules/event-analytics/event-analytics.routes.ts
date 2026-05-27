import { Router } from 'express'
import {
  downloadEventAnalyticsReport,
  listEventAnalytics,
} from '@/modules/event-analytics/event-analytics.controller.js'
import { requireAuth } from '@/middlewares/auth.js'
import { PERMISSION_ACTIONS, requirePermission } from '@/middlewares/permission.js'

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
router.get(
  '/',
  requireAuth,
  requirePermission(PERMISSION_ACTIONS.viewResponses, (req) => ({
    resourceId: String(req.params.eventId),
  })),
  listEventAnalytics,
)

router.post(
  '/report.pdf',
  requireAuth,
  requirePermission(PERMISSION_ACTIONS.viewResponses, (req) => ({
    resourceId: String(req.params.eventId),
  })),
  downloadEventAnalyticsReport,
)

export default router
