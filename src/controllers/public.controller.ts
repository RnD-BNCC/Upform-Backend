import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import { sendSubmitConfirmationEmail } from '../utils/submit-form-email.js'
import type {
  SaveResponseProgressBody,
  SubmitResponseBody,
  ResponseProgressParams,
} from '../types/response-progress.js'

type PublicEventParams = {
  id: string
}

type PublicProgressParams = PublicEventParams & {
  progressId: string
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

export async function getPublicEvent(req: Request<PublicEventParams>, res: Response) {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, status: 'active' },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Form not found or not accepting responses' })
      return
    }

    res.json(event)
  } catch (error) {
    handleControllerError('Public', 'get public event failed', error, res)
  }
}

export async function submitPublicResponse(
  req: Request<PublicEventParams, unknown, SubmitResponseBody>,
  res: Response,
) {
  try {
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
      where: { id: req.params.id, status: 'active' },
      include: { submitFormSetting: true },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const response = await prisma.response.create({
      data: {
        eventId: req.params.id,
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
        where: { id: progressId, eventId: req.params.id },
      })
    } else if (respondentUuid) {
      await prisma.responseProgress.deleteMany({
        where: { eventId: req.params.id, respondentUuid },
      })
    }

    res.status(201).json(response)

    sendSubmitConfirmationEmail(event, response).catch((error) =>
      console.error('[Public] submit confirmation email failed:', error),
    )
  } catch (error) {
    handleControllerError('Public', 'submit public response failed', error, res)
  }
}

export async function savePublicResponseProgress(
  req: Request<PublicEventParams, unknown, SaveResponseProgressBody>,
  res: Response,
) {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, status: 'active' },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const progressData = getProgressData(req.body)
    const existing = progressData.respondentUuid
      ? await prisma.responseProgress.findFirst({
          where: {
            deletedAt: null,
            eventId: req.params.id,
            respondentUuid: progressData.respondentUuid,
          },
        })
      : null

    const progress = existing
      ? await prisma.responseProgress.update({
          where: { id: existing.id },
          data: progressData,
        })
      : await prisma.responseProgress.create({
          data: {
            ...progressData,
            eventId: req.params.id,
          },
        })

    res.status(existing ? 200 : 201).json(progress)
  } catch (error) {
    handleControllerError('Public', 'save public response progress failed', error, res)
  }
}

export async function updatePublicResponseProgress(
  req: Request<PublicProgressParams, unknown, SaveResponseProgressBody>,
  res: Response,
) {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, status: 'active' },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const existing = await prisma.responseProgress.findFirst({
      where: { id: req.params.progressId, eventId: req.params.id, deletedAt: null },
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
    handleControllerError('Public', 'update public response progress failed', error, res)
  }
}

export async function deletePublicResponseProgress(
  req: Request<PublicProgressParams>,
  res: Response,
) {
  try {
    await prisma.responseProgress.deleteMany({
      where: { id: req.params.progressId, eventId: req.params.id },
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Public', 'delete public response progress failed', error, res)
  }
}
