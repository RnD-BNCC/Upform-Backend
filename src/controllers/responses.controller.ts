import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { syncAndAppendRow } from '../config/google-sheets.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { ResponseParams, UpdateResponseBody } from '../types/responses.js'
import type { SubmitResponseBody } from '../types/response-progress.js'

export async function listResponses(
  req: Request<Pick<ResponseParams, 'eventId'>>,
  res: Response,
) {
  try {
    const { eventId } = req.params

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const responses = await prisma.response.findMany({
      where: { eventId },
      orderBy: { submittedAt: 'desc' },
    })

    res.json(responses)
  } catch (error) {
    handleControllerError('Responses', 'list responses failed', error, res)
  }
}

export async function submitResponse(
  req: Request<Pick<ResponseParams, 'eventId'>, unknown, SubmitResponseBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const {
      answers,
      currentSectionId,
      currentSectionIndex,
      deviceType,
      progressId,
      progressPercent,
      respondentUuid,
      sectionHistory,
      startedAt,
      userAgent,
    } = req.body

    const event = await prisma.event.findFirst({
      where: { id: eventId, status: 'active' },
      include: { sections: { orderBy: { order: 'asc' } } },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const response = await prisma.response.create({
      data: {
        eventId,
        answers: answers ?? {},
        completedAt: new Date(),
        currentSectionId: currentSectionId ?? null,
        currentSectionIndex,
        deviceType,
        progressPercent: progressPercent ?? 100,
        respondentUuid,
        sectionHistory: sectionHistory ?? [],
        startedAt: parseOptionalDate(startedAt),
        userAgent,
      },
    })

    if (progressId) {
      await prisma.responseProgress.deleteMany({
        where: { id: progressId, eventId },
      })
    } else if (respondentUuid) {
      await prisma.responseProgress.deleteMany({
        where: { eventId, respondentUuid },
      })
    }

    res.status(201).json(response)

    if (event.spreadsheetId && event.spreadsheetToken) {
      const allFields = event.sections.flatMap((section) => {
        const fields = section.fields as Array<{ id: string; label: string; type: string }>
        return fields.filter((field) => field.type !== 'title_block' && field.type !== 'image_block')
      })
      syncAndAppendRow(
        event.spreadsheetToken,
        event.spreadsheetId,
        allFields,
        answers as Record<string, string | string[]>,
        response.submittedAt.toISOString(),
      ).catch((error) => console.error('[Responses] spreadsheet sync+append failed:', error))
    }
  } catch (error) {
    handleControllerError('Responses', 'submit response failed', error, res)
  }
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function getResponse(req: Request<ResponseParams>, res: Response) {
  try {
    const { eventId, responseId } = req.params

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const response = await prisma.response.findFirst({
      where: { id: responseId, eventId },
    })
    if (!response) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    res.json(response)
  } catch (error) {
    handleControllerError('Responses', 'get response failed', error, res)
  }
}

export async function updateResponse(
  req: Request<ResponseParams, unknown, UpdateResponseBody>,
  res: Response,
) {
  try {
    const { eventId, responseId } = req.params
    const { answers } = req.body

    const existing = await prisma.response.findFirst({
      where: { id: responseId, eventId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    const response = await prisma.response.update({
      where: { id: existing.id },
      data: { answers: (answers ?? existing.answers) as Prisma.InputJsonValue },
    })

    res.json(response)
  } catch (error) {
    handleControllerError('Responses', 'update response failed', error, res)
  }
}

export async function deleteResponse(req: Request<ResponseParams>, res: Response) {
  try {
    const { eventId, responseId } = req.params

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await prisma.response.findFirst({
      where: { id: responseId, eventId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    await prisma.response.delete({ where: { id: responseId } })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Responses', 'delete response failed', error, res)
  }
}
