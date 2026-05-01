import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { EventParams, CreateEventBody, UpdateEventBody } from '../types/events.js'

export async function listEvents(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
    const skip = (page - 1) * take
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined

    const where: Record<string, unknown> = {}
    if (status && ['draft', 'active', 'closed'].includes(status)) {
      where.status = status
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const [events, total, allEvents] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          sections: { orderBy: { order: 'asc' } },
          _count: { select: { responses: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.event.count({ where }),
      prisma.event.findMany({
        select: { status: true, _count: { select: { responses: true } } },
      }),
    ])

    const data = events.map(({ _count, ...event }) => ({
      ...event,
      responseCount: _count.responses,
    }))

    const counts = {
      total: allEvents.length,
      active: allEvents.filter((event) => event.status === 'active').length,
      totalResponses: allEvents.reduce((sum, event) => sum + event._count.responses, 0),
    }

    res.json({
      data,
      meta: { page, take, total, totalPages: Math.ceil(total / take) },
      counts,
    })
  } catch (error) {
    handleControllerError('Events', 'list events failed', error, res)
  }
}

export async function getEvent(req: Request<EventParams>, res: Response) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        sections: { orderBy: { order: 'asc' } },
        responses: { orderBy: { submittedAt: 'desc' } },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.json(event)
  } catch (error) {
    handleControllerError('Events', 'get event failed', error, res)
  }
}

export async function createEvent(req: Request<object, unknown, CreateEventBody>, res: Response) {
  try {
    const { name, color, theme } = req.body

    const event = await prisma.event.create({
      data: {
        name: name ?? '',
        color: color ?? '#0054a5',
        theme: theme ?? 'light',
        sections: {
          create: [
            { title: 'Cover', pageType: 'cover', order: 0, fields: [] },
            { title: 'Page', pageType: 'page', order: 1, fields: [] },
            { title: 'Ending', pageType: 'ending', order: 2, fields: [] },
          ],
        },
      },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    res.status(201).json(event)
  } catch (error) {
    handleControllerError('Events', 'create event failed', error, res)
  }
}

export async function updateEvent(
  req: Request<EventParams, unknown, UpdateEventBody>,
  res: Response,
) {
  try {
    const { name, status, color, image, theme } = req.body

    const existing = await prisma.event.findUnique({
      where: { id: req.params.id },
    })

    if (!existing) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(status !== undefined && { status }),
        ...(color !== undefined && { color }),
        ...(image !== undefined && { image }),
        ...(theme !== undefined && { theme }),
      },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    res.json(event)
  } catch (error) {
    handleControllerError('Events', 'update event failed', error, res)
  }
}

export async function deleteEvent(req: Request<EventParams>, res: Response) {
  try {
    const existing = await prisma.event.findUnique({
      where: { id: req.params.id },
    })

    if (!existing) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    await prisma.event.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Events', 'delete event failed', error, res)
  }
}
