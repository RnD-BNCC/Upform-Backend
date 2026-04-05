import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middlewares/auth.js'
import type { AuthUser } from '../middlewares/auth.js'
import { createSpreadsheet, appendAllRows } from '../config/google-sheets.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

router.post('/', async (req, res) => {
  const user = res.locals.user as AuthUser
  const { eventId } = req.params as Record<string, string>

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'google' },
    select: { refreshToken: true },
  })

  if (!account?.refreshToken) {
    res.status(400).json({ error: 'Missing Google Sheets permission. Please re-login.' })
    return
  }

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
    account.refreshToken,
    event.name || 'UpForm Responses',
    allFields,
  )

  await prisma.event.update({
    where: { id: eventId },
    data: { spreadsheetId, spreadsheetUrl, spreadsheetToken: account.refreshToken },
  })

  const existing = await prisma.response.findMany({
    where: { eventId },
    orderBy: { submittedAt: 'asc' },
    select: { answers: true, submittedAt: true },
  })

  if (existing.length > 0) {
    appendAllRows(
      account.refreshToken,
      spreadsheetId,
      allFields,
      existing.map((r) => ({
        answers: r.answers as Record<string, string | string[]>,
        submittedAt: r.submittedAt.toISOString(),
      })),
    ).catch((err) => console.error('[spreadsheet backfill]', err))
  }

  res.json({ spreadsheetId, spreadsheetUrl })
})

router.delete('/', async (req, res) => {
  const { eventId } = req.params as Record<string, string>

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { spreadsheetId: null, spreadsheetUrl: null, spreadsheetToken: null },
  })

  res.status(204).send()
})

export default router
