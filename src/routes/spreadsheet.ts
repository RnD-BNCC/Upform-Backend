import { Router } from 'express'
import {
  createEventSpreadsheet,
  deleteEventSpreadsheet,
} from '../controllers/spreadsheet.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

/**
 * @swagger
 * /api/events/{eventId}/spreadsheet:
 *   post:
 *     summary: Create a Google Sheets spreadsheet for an event and backfill existing responses
 *     description: |
 *       Creates a new spreadsheet linked to the event via the authenticated user's Google OAuth token.
 *       If the event already has a spreadsheet linked, returns the existing IDs without creating a new one.
 *       Requires the user to have logged in with Google (refresh token must be present).
 *     tags: [Spreadsheet]
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
 *         description: Spreadsheet created (or already existed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spreadsheetId:
 *                   type: string
 *                   example: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
 *                 spreadsheetUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
 *       400:
 *         description: User does not have a Google refresh token — must re-login with Google
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
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', createEventSpreadsheet)

/**
 * @swagger
 * /api/events/{eventId}/spreadsheet:
 *   delete:
 *     summary: Unlink the Google Sheets spreadsheet from an event
 *     description: Clears spreadsheetId, spreadsheetUrl, and spreadsheetToken from the event. Does not delete the actual Google Sheets document.
 *     tags: [Spreadsheet]
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
 *       204:
 *         description: Unlinked successfully
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
router.delete('/', deleteEventSpreadsheet)

export default router
