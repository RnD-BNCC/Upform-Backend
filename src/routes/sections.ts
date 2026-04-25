import { Router } from 'express'
import {
  createSection,
  deleteSection,
  listSections,
  reorderSections,
  updateSection,
} from '../controllers/sections.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

/**
 * @swagger
 * /api/events/{eventId}/sections:
 *   get:
 *     summary: List all sections for an event
 *     tags: [Sections]
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
 *         description: List of sections
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.get('/', listSections)

/**
 * @swagger
 * /api/events/{eventId}/sections:
 *   post:
 *     summary: Add a new section to an event
 *     tags: [Sections]
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
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSection'
 *     responses:
 *       201:
 *         description: Created section
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.post('/', createSection)

/**
 * @swagger
 * /api/events/{eventId}/sections/{sectionId}:
 *   patch:
 *     summary: Update a section (title, description, order, fields)
 *     tags: [Sections]
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
 *         name: sectionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSection'
 *     responses:
 *       200:
 *         description: Updated section
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Section'
 *       404:
 *         description: Not found
 */
router.patch('/:sectionId', updateSection)

/**
 * @swagger
 * /api/events/{eventId}/sections/reorder:
 *   put:
 *     summary: Reorder sections by providing an array of section IDs
 *     tags: [Sections]
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
 *             $ref: '#/components/schemas/ReorderSections'
 *     responses:
 *       200:
 *         description: Reordered sections
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Section'
 *       404:
 *         description: Event not found
 */
router.put('/reorder', reorderSections)

/**
 * @swagger
 * /api/events/{eventId}/sections/{sectionId}:
 *   delete:
 *     summary: Delete a section
 *     tags: [Sections]
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
 *         name: sectionId
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
router.delete('/:sectionId', deleteSection)

export default router
