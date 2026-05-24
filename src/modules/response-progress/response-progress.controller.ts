import { eventRepository, responseProgressRepository, unitOfWork } from '@/modules/response-progress/response-progress.repository.js'
import type { Request, Response } from 'express'
import { handleControllerError } from '@/utils/controller-error.js'
import type { SaveResponseProgressBody, ResponseProgressParams } from '@/modules/response-progress/response-progress.types.js'
import { createFormAuditLog } from '@/modules/events/form-audit.service.js'
import { buildResponseProgressData } from '@/modules/response-progress/response-progress.mapper.js'
import { getAuthEmail } from '@/utils/auth-context.js'
import { toPrismaJson } from '@/utils/prisma-json.js'

const RECORD_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

export async function listResponseProgress(
  req: Request<Pick<ResponseProgressParams, 'eventId'>>,
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
    const progress = await responseProgressRepository.findMany({
      where: {
        eventId,
        ...(includeDeleted ? {} : { stsrc: { not: RECORD_STSRC.deleted } }),
      },
      orderBy: { updatedAt: 'desc' },
    })

    res.json(progress)
  } catch (error) {
    handleControllerError('ResponseProgress', 'list response progress failed', error, res)
  }
}

export async function updateResponseProgress(
  req: Request<ResponseProgressParams, unknown, SaveResponseProgressBody>,
  res: Response,
) {
  try {
    const { eventId, progressId } = req.params

    const existing = await responseProgressRepository.findFirst({
      where: { id: progressId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    const progress = await unitOfWork.transaction(async (tx) => {
      const updated = await tx.responseProgress.update({
        where: { id: existing.id },
        data: { ...buildResponseProgressData(req.body), stsrc: RECORD_STSRC.updated },
      })

      await createFormAuditLog(tx, {
        action: 'responseProgress.update',
        actorEmail: getAuthEmail(res),
        afterSnapshot: toPrismaJson(updated),
        beforeSnapshot: toPrismaJson(existing),
        eventId,
        targetId: existing.id,
        targetType: 'responseProgress',
      })

      return updated
    })

    res.json(progress)
  } catch (error) {
    handleControllerError('ResponseProgress', 'update response progress failed', error, res)
  }
}

export async function deleteResponseProgress(
  req: Request<ResponseProgressParams>,
  res: Response,
) {
  try {
    const { eventId, progressId } = req.params

    const existing = await responseProgressRepository.findFirst({
      where: { id: progressId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    await unitOfWork.transaction(async (tx) => {
      const deleted = await tx.responseProgress.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })

      await createFormAuditLog(tx, {
        action: 'responseProgress.delete',
        actorEmail: getAuthEmail(res),
        afterSnapshot: toPrismaJson(deleted),
        beforeSnapshot: toPrismaJson(existing),
        eventId,
        targetId: existing.id,
        targetType: 'responseProgress',
      })
    })

    res.status(204).send()
  } catch (error) {
    handleControllerError('ResponseProgress', 'delete response progress failed', error, res)
  }
}
