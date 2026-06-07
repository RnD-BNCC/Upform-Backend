import { eventRepository, responseRepository, unitOfWork } from '@/modules/responses/responses.repository.js'
import type { Request, Response } from 'express'
import type { Prisma } from '../../../generated/prisma/index.js'
import { handleControllerError } from '@/utils/controller-error.js'
import { createFormAuditLog } from '@/modules/events/form-audit.service.js'
import { syncEventFilesToConnectedDrive } from '@/modules/gallery/gallery-drive-sync.service.js'
import { getAuthEmail } from '@/utils/auth-context.js'
import { toPrismaJson } from '@/utils/prisma-json.js'
import {
  enqueueResponseSubmissionSideEffects,
  submitActiveEventResponse,
} from '@/modules/responses/response-submission.service.js'
import type { ResponseParams, UpdateResponseBody } from '@/modules/responses/responses.types.js'
import type { SubmitResponseBody } from '@/modules/response-progress/response-progress.types.js'

const RECORD_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

export async function listResponses(
  req: Request<Pick<ResponseParams, 'eventId'>>,
  res: Response,
) {
  try {
    const { eventId } = req.params

    const event = await eventRepository.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const includeDeleted = req.query.includeDeleted === 'true'
    const responses = await responseRepository.findMany({
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
    const result = await submitActiveEventResponse(eventId, req.body)
    if (!result) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    res.status(201).json(result.response)
    enqueueResponseSubmissionSideEffects({ ...result, logScope: 'Responses' })
  } catch (error) {
    handleControllerError('Responses', 'submit response failed', error, res)
  }
}

export async function getResponse(req: Request<ResponseParams>, res: Response) {
  try {
    const { eventId, responseId } = req.params

    const event = await eventRepository.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const response = await responseRepository.findFirst({
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

    const existing = await responseRepository.findFirst({
      where: { id: responseId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    const response = await unitOfWork.transaction(async (tx) => {
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
        afterSnapshot: toPrismaJson(updated),
        beforeSnapshot: toPrismaJson(existing),
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

    const event = await eventRepository.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await responseRepository.findFirst({
      where: { id: responseId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response not found' })
      return
    }

    await unitOfWork.transaction(async (tx) => {
      const deleted = await tx.response.update({
        where: { id: responseId },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })

      await createFormAuditLog(tx, {
        action: 'response.delete',
        actorEmail: getAuthEmail(res),
        afterSnapshot: toPrismaJson(deleted),
        beforeSnapshot: toPrismaJson(existing),
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
