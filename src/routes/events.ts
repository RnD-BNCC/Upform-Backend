import { Router } from 'express'
import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  getEvent,
  getEventQuestions,
  listEventAuditLogs,
  listEvents,
  restoreEvent,
  rollbackEventAuditLog,
  saveBuilderEvent,
  updateEvent,
} from '../controllers/events.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { PERMISSION_ACTIONS, requirePermission } from '../middlewares/permission.js'

const router = Router()
router.use(requireAuth)

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: List events with pagination, filtering, and search
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 9
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, closed]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by event name
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: When true, list soft-deleted events only
 *     responses:
 *       200:
 *         description: Paginated list of events with counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     take:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 counts:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     totalResponses:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', listEvents)

/**
 * @swagger
 * /api/events/{id}/duplicate:
 *   post:
 *     summary: Duplicate a form with its sections and fields
 *     tags: [Events]
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
 *       201:
 *         description: Duplicated event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 */
router.post('/:id/duplicate', duplicateEvent)

/**
 * @swagger
 * /api/events/{id}/restore:
 *   post:
 *     summary: Restore a soft-deleted form and its form-deleted responses
 *     tags: [Events]
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
 *         description: Restored event
 *       404:
 *         description: Deleted event not found
 */
router.post('/:id/restore', restoreEvent)

/**
 * @swagger
 * /api/events/{id}/questions:
 *   get:
 *     summary: Get lightweight question data for importing questions
 *     tags: [Events]
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
 *         description: Event sections with active fields only
 *       404:
 *         description: Not found
 */
router.get('/:id/questions', getEventQuestions)

/**
 * @swagger
 * /api/events/{id}/builder:
 *   patch:
 *     summary: Batch-save builder changes for an event
 *     tags: [Events]
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
 *         description: Builder changes saved
 *       404:
 *         description: Event or section not found
 */
router.patch('/:id/builder', saveBuilderEvent)

router.get('/:id/audit-logs', listEventAuditLogs)
router.post(
  '/:id/audit-logs/:logId/rollback',
  requirePermission(PERMISSION_ACTIONS.rollbackForm, (req) => ({
    resourceId: String(req.params.id),
  })),
  rollbackEventAuditLog,
)

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Get a single event with sections and responses
 *     tags: [Events]
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
 *         description: Event detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', getEvent)

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEvent'
 *     responses:
 *       201:
 *         description: Created event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 */
router.post('/', createEvent)

/**
 * @swagger
 * /api/events/{id}:
 *   patch:
 *     summary: Update an event
 *     tags: [Events]
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
 *             $ref: '#/components/schemas/UpdateEvent'
 *     responses:
 *       200:
 *         description: Updated event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 */
router.patch('/:id', updateEvent)

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Soft-delete an event and hide its responses
 *     tags: [Events]
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
 *         description: Soft-deleted
 *       404:
 *         description: Not found
 */
router.delete(
  '/:id',
  requirePermission(PERMISSION_ACTIONS.deleteForm, (req) => ({
    resourceId: String(req.params.id),
  })),
  deleteEvent,
)

export default router
