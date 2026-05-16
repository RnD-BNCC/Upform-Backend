import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { handleControllerError } from '../utils/controller-error.js'
import { sendSubmitConfirmationEmail } from '../utils/submit-form-email.js'
import { syncEventFilesToConnectedDrive } from '../services/gallery-drive-sync.js'
import { createFormAuditLog } from '../services/form-audit.js'
import type { AuthUser } from '../middlewares/auth.js'
import type { ResponseParams, UpdateResponseBody } from '../types/responses.js'
import type { SubmitResponseBody } from '../types/response-progress.js'

const RECORD_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function listResponses(
  req: Request<Pick<ResponseParams, 'eventId'>>,
  res: Response,
) {
  try {
    const { eventId } = req.params

    const event = await prisma.event.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const includeDeleted = req.query.includeDeleted === 'true'
    const responses = await prisma.response.findMany({
      where: {
        eventId,
        ...(includeDeleted ? {} : { stsrc: { not: RECORD_STSRC.deleted } }),
      },
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
      where: { id: eventId, status: 'active', stsrc: { not: 'D' } },
      include: {
        sections: { orderBy: { order: 'asc' } },
        submitFormSetting: true,
      },
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
        stsrc: RECORD_STSRC.available,
        startedAt: parseOptionalDate(startedAt),
        userAgent,
      },
    })

    if (progressId) {
      await prisma.responseProgress.updateMany({
        where: { id: progressId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })
    } else if (respondentUuid) {
      await prisma.responseProgress.updateMany({
        where: { eventId, respondentUuid, stsrc: { not: RECORD_STSRC.deleted } },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })
    }

    res.status(201).json(response)

    sendSubmitConfirmationEmail(event, response).catch((error) =>
      console.error('[Responses] submit confirmation email failed:', error),
    )
    syncEventFilesToConnectedDrive(eventId, response.id).catch((error) =>
      console.error('[Responses] gallery drive sync failed:', error),
    )
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

    const event = await prisma.event.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const response = await prisma.response.findFirst({
      where: { id: responseId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
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
      where: { id: responseId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    const response = await prisma.$transaction(async (tx) => {
      const updated = await tx.response.update({
        where: { id: existing.id },
        data: {
          answers: (answers ?? existing.answers) as Prisma.InputJsonValue,
          stsrc: RECORD_STSRC.updated,
        },
      })

      await createFormAuditLog(tx, {
        action: 'response.update',
        actorEmail: getAuthEmail(res),
        afterSnapshot: asJson(updated),
        beforeSnapshot: asJson(existing),
        eventId,
        targetId: existing.id,
        targetType: 'response',
      })

      return updated
    })

    res.json(response)
    syncEventFilesToConnectedDrive(eventId, response.id).catch((error) =>
      console.error('[Responses] gallery drive sync failed:', error),
    )
  } catch (error) {
    handleControllerError('Responses', 'update response failed', error, res)
  }
}

export async function deleteResponse(req: Request<ResponseParams>, res: Response) {
  try {
    const { eventId, responseId } = req.params

    const event = await prisma.event.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await prisma.response.findFirst({
      where: { id: responseId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.response.update({
        where: { id: responseId },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })

      await createFormAuditLog(tx, {
        action: 'response.delete',
        actorEmail: getAuthEmail(res),
        afterSnapshot: asJson(deleted),
        beforeSnapshot: asJson(existing),
        eventId,
        targetId: existing.id,
        targetType: 'response',
      })
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Responses', 'delete response failed', error, res)
  }
}
