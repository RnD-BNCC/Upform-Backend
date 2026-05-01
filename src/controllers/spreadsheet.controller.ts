import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { appendAllRows, createSpreadsheet } from '../config/google-sheets.js'
import type { AuthUser } from '../middlewares/auth.js'
import { handleControllerError } from '../utils/controller-error.js'

export async function createEventSpreadsheet(req: Request, res: Response) {
  try {
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

    const allFields = event.sections.flatMap((section) => {
      const fields = section.fields as Array<{ id: string; label: string; type: string }>
      return fields.filter((field) => field.type !== 'title_block' && field.type !== 'image_block')
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
        existing.map((response) => ({
          answers: response.answers as Record<string, string | string[]>,
          submittedAt: response.submittedAt.toISOString(),
        })),
      ).catch((error) => console.error('[Spreadsheet] backfill failed:', error))
    }

    res.json({ spreadsheetId, spreadsheetUrl })
  } catch (error) {
    handleControllerError('Spreadsheet', 'create spreadsheet failed', error, res)
  }
}

export async function deleteEventSpreadsheet(req: Request, res: Response) {
  try {
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
  } catch (error) {
    handleControllerError('Spreadsheet', 'delete spreadsheet failed', error, res)
  }
}
