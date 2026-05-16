import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { SaveResponseProgressBody, ResponseProgressParams } from '../types/response-progress.js'
import { createFormAuditLog } from '../services/form-audit.js'
import type { AuthUser } from '../middlewares/auth.js'
import type { Prisma } from '../../generated/prisma/index.js'

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

function parseOptionalDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function getProgressData(body: SaveResponseProgressBody) {
  return {
    answers: body.answers ?? {},
    currentSectionId: body.currentSectionId ?? null,
    currentSectionIndex: body.currentSectionIndex,
    deviceType: body.deviceType,
    otherTexts: body.otherTexts ?? {},
    progressPercent: body.progressPercent,
    respondentUuid: body.respondentUuid,
    sectionHistory: body.sectionHistory ?? [],
    startedAt: parseOptionalDate(body.startedAt),
    userAgent: body.userAgent,
  }
}

export async function listResponseProgress(
  req: Request<Pick<ResponseProgressParams, 'eventId'>>,
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
    const progress = await prisma.responseProgress.findMany({
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

    const existing = await prisma.responseProgress.findFirst({
      where: { id: progressId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    const progress = await prisma.$transaction(async (tx) => {
      const updated = await tx.responseProgress.update({
        where: { id: existing.id },
        data: { ...getProgressData(req.body), stsrc: RECORD_STSRC.updated },
      })

      await createFormAuditLog(tx, {
        action: 'responseProgress.update',
        actorEmail: getAuthEmail(res),
        afterSnapshot: asJson(updated),
        beforeSnapshot: asJson(existing),
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

    const existing = await prisma.responseProgress.findFirst({
      where: { id: progressId, eventId, stsrc: { not: RECORD_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.responseProgress.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
      })

      await createFormAuditLog(tx, {
        action: 'responseProgress.delete',
        actorEmail: getAuthEmail(res),
        afterSnapshot: asJson(deleted),
        beforeSnapshot: asJson(existing),
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
