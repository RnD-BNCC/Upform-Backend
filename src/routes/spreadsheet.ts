import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import { createSpreadsheet } from '../config/google-sheets.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

/**
 * @swagger
 * /api/events/{eventId}/spreadsheet:
 *   post:
 *     summary: Connect event to a new Google Sheet (creates sheet with form headers)
 *     tags: [Events]
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
 *         description: Spreadsheet connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spreadsheetId:
 *                   type: string
 *                 spreadsheetUrl:
 *                   type: string
 *       404:
 *         description: Event not found
 */
router.post('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { sections: { orderBy: { order: 'asc' } } },
  })

  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  if (event.spreadsheetId && event.spreadsheetUrl) {
    res.json({ spreadsheetId: event.spreadsheetId, spreadsheetUrl: event.spreadsheetUrl })
    return
  }

  const allFields = event.sections.flatMap((s) => {
    const fields = s.fields as Array<{ id: string; label: string; type: string }>
    return fields.filter((f) => f.type !== 'title_block' && f.type !== 'image_block')
  })

  const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(
    event.name || 'UpForm Responses',
    allFields,
  )

  await prisma.event.update({
    where: { id: eventId },
    data: { spreadsheetId, spreadsheetUrl },
  })

  res.json({ spreadsheetId, spreadsheetUrl })
})

/**
 * @swagger
 * /api/events/{eventId}/spreadsheet:
 *   delete:
 *     summary: Disconnect the Google Sheet from this event
 *     tags: [Events]
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
 *         description: Disconnected
 *       404:
 *         description: Event not found
 */
router.delete('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { spreadsheetId: null, spreadsheetUrl: null },
  })

  res.status(204).send()
})

export default router
