import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { handleControllerError } from '../utils/controller-error.js'

type AnalyticsEventType = 'view' | 'start' | 'section_view' | 'finish'

type AnalyticsEventBody = {
  answers?: Record<string, string | string[]>
  currentSectionId?: string | null
  currentSectionIndex?: number
  deviceType?: string
  progressPercent?: number
  respondentUuid?: string
  sectionHistory?: number[]
  sessionUuid?: string
  type?: AnalyticsEventType
  userAgent?: string
}

type EventParams = {
  eventId: string
}

type PublicEventParams = {
  id: string
}

function getAnalyticsData(eventId: string, body: AnalyticsEventBody) {
  return {
    answers: (body.answers ?? {}) as Prisma.InputJsonValue,
    deviceType: body.deviceType,
    eventId,
    progressPercent: body.progressPercent,
    respondentUuid: body.respondentUuid,
    sectionHistory: (body.sectionHistory ?? []) as Prisma.InputJsonValue,
    sectionId: body.currentSectionId ?? null,
    sectionIndex: body.currentSectionIndex,
    sessionUuid: body.sessionUuid,
    type: body.type ?? 'view',
    userAgent: body.userAgent,
  }
}

export async function listEventAnalytics(req: Request<EventParams>, res: Response) {
  try {
    const { eventId } = req.params

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const analyticsEvents = await prisma.eventAnalyticsEvent.findMany({
      where: { eventId },
      orderBy: { occurredAt: 'asc' },
    })

    res.json(analyticsEvents)
  } catch (error) {
    handleControllerError('EventAnalytics', 'list analytics events failed', error, res)
  }
}

export async function trackPublicEventAnalytics(
  req: Request<PublicEventParams, unknown, AnalyticsEventBody>,
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

    const analyticsEvent = await prisma.eventAnalyticsEvent.create({
      data: getAnalyticsData(req.params.id, req.body),
    })

    res.status(201).json(analyticsEvent)
  } catch (error) {
    handleControllerError('EventAnalytics', 'track analytics event failed', error, res)
  }
}
