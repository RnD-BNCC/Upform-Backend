import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { SaveResponseProgressBody, ResponseProgressParams } from '../types/response-progress.js'

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

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const progress = await prisma.responseProgress.findMany({
      where: { eventId },
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
      where: { id: progressId, eventId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    const progress = await prisma.responseProgress.update({
      where: { id: existing.id },
      data: getProgressData(req.body),
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

    await prisma.responseProgress.deleteMany({
      where: { id: progressId, eventId },
    })

    res.status(204).send()
  } catch (error) {
    handleControllerError('ResponseProgress', 'delete response progress failed', error, res)
  }
}
