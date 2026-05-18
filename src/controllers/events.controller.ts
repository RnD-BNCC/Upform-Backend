import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { handleControllerError } from '../utils/controller-error.js'
import { buildDuplicatedSections } from '../utils/form-clone.js'
import {
  normalizeFieldsForStorage,
  withActiveEventSections,
  withActiveSectionFields,
} from '../utils/form-fields.js'
import {
  FORM_ROLLBACK_TRANSACTION_OPTIONS,
  createFormAuditLog,
  getEventAuditSnapshot,
  listFormAuditLogs,
  restoreEventFromSnapshot,
} from '../services/form-audit.js'
import {
  SOFT_DELETE_TRANSACTION_OPTIONS,
  softDeleteEventById,
} from '../services/event-soft-delete.js'
import type { AuthUser } from '../middlewares/auth.js'
import type {
  EventParams,
  CreateEventBody,
  SaveBuilderEventBody,
  SaveBuilderSectionBody,
  UpdateEventBody,
} from '../types/events.js'

const EVENT_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
}

function getUniqueValues(values: Array<string | null | undefined> = []) {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ]
}

function buildSectionUpdateData(
  section: SaveBuilderSectionBody,
  existingFields: unknown,
): Prisma.SectionUpdateInput {
  return {
    ...(section.title !== undefined && { title: section.title }),
    ...(section.description !== undefined && { description: section.description }),
    ...(section.order !== undefined && { order: section.order }),
    ...(section.fields !== undefined && {
      fields: normalizeFieldsForStorage(section.fields, existingFields) as Prisma.InputJsonValue,
    }),
    ...(section.settings !== undefined && {
      settings: section.settings as Prisma.InputJsonValue,
    }),
    ...(section.pageType !== undefined && { pageType: section.pageType }),
    ...(section.logicX !== undefined && { logicX: section.logicX }),
    ...(section.logicY !== undefined && { logicY: section.logicY }),
  }
}

export async function listEvents(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
    const skip = (page - 1) * take
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const deleted = req.query.deleted === 'true'

    const where: Record<string, unknown> = {
      stsrc: deleted ? EVENT_STSRC.deleted : { not: EVENT_STSRC.deleted },
    }
    if (status && ['draft', 'active', 'closed'].includes(status)) {
      where.status = status
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const [events, total, totalEvents, activeEvents, deletedEvents, totalResponses] =
      await Promise.all([
        prisma.event.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            color: true,
            theme: true,
            image: true,
            stsrc: true,
            createdBy: true,
            updatedBy: true,
            deletedBy: true,
            createdAt: true,
            deletedAt: true,
            updatedAt: true,
            _count: {
              select: {
                responses: deleted
                  ? true
                  : { where: { stsrc: { not: EVENT_STSRC.deleted } } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
        }),
        prisma.event.count({ where }),
        prisma.event.count({ where: { stsrc: { not: EVENT_STSRC.deleted } } }),
        prisma.event.count({
          where: { status: 'active', stsrc: { not: EVENT_STSRC.deleted } },
        }),
        prisma.event.count({ where: { stsrc: EVENT_STSRC.deleted } }),
        prisma.response.count({ where: { stsrc: { not: EVENT_STSRC.deleted } } }),
      ])

    const data = events.map(({ _count, ...event }) => ({
      ...event,
      responseCount: _count.responses,
    }))

    const counts = {
      total: totalEvents,
      active: activeEvents,
      deleted: deletedEvents,
      totalResponses,
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
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, stsrc: { not: EVENT_STSRC.deleted } },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.json(withActiveEventSections(event))
  } catch (error) {
    handleControllerError('Events', 'get event failed', error, res)
  }
}

export async function createEvent(req: Request<object, unknown, CreateEventBody>, res: Response) {
  try {
    const { name, color, theme } = req.body
    const userEmail = getAuthEmail(res)

    const event = await prisma.event.create({
      data: {
        name: name ?? '',
        color: color ?? '#0054a5',
        theme: theme ?? 'light',
        stsrc: EVENT_STSRC.available,
        createdBy: userEmail,
        updatedBy: userEmail,
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

    res.status(201).json(withActiveEventSections(event))
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
    const userEmail = getAuthEmail(res)

    const existing = await prisma.event.findFirst({
      where: { id: req.params.id, stsrc: { not: EVENT_STSRC.deleted } },
    })

    if (!existing) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const event = await prisma.$transaction(async (tx) => {
      const beforeSnapshot = await getEventAuditSnapshot(tx, existing.id)
      const updated = await tx.event.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(status !== undefined && { status }),
          ...(color !== undefined && { color }),
          ...(image !== undefined && { image }),
          ...(theme !== undefined && { theme }),
          stsrc: EVENT_STSRC.updated,
          updatedBy: userEmail,
        },
      })
      const afterSnapshot = await getEventAuditSnapshot(tx, existing.id)
      await createFormAuditLog(tx, {
        action: 'form.update',
        actorEmail: userEmail,
        afterSnapshot,
        beforeSnapshot,
        eventId: existing.id,
        targetId: existing.id,
        targetType: 'event',
      })
      return updated
    })

    res.json(event)
  } catch (error) {
    handleControllerError('Events', 'update event failed', error, res)
  }
}

export async function duplicateEvent(req: Request<EventParams>, res: Response) {
  try {
    const userEmail = getAuthEmail(res)
    const source = await prisma.event.findFirst({
      where: { id: req.params.id, stsrc: { not: EVENT_STSRC.deleted } },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    if (!source) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const duplicated = await prisma.event.create({
      data: {
        color: source.color,
        description: source.description,
        image: source.image,
        name: `${source.name.trim() || 'Untitled Form'} (Copy)`,
        theme: source.theme,
        stsrc: EVENT_STSRC.available,
        createdBy: userEmail,
        updatedBy: userEmail,
        sections: {
          create: buildDuplicatedSections(source.sections),
        },
      },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    res.status(201).json(withActiveEventSections(duplicated))
  } catch (error) {
    handleControllerError('Events', 'duplicate event failed', error, res)
  }
}

export async function getEventQuestions(req: Request<EventParams>, res: Response) {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, stsrc: { not: EVENT_STSRC.deleted } },
      select: {
        id: true,
        name: true,
        sections: {
          orderBy: { order: 'asc' },
          select: {
            fields: true,
            id: true,
            order: true,
            title: true,
          },
        },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.json({
      ...event,
      sections: event.sections.map((section) => withActiveSectionFields(section)),
    })
  } catch (error) {
    handleControllerError('Events', 'get event questions failed', error, res)
  }
}

export async function saveBuilderEvent(
  req: Request<EventParams, unknown, SaveBuilderEventBody>,
  res: Response,
) {
  try {
    const eventId = req.params.id
    const { deletedSectionIds = [], event: eventPayload, sections = [] } = req.body
    const userEmail = getAuthEmail(res)

    const existingEvent = await prisma.event.findFirst({
      where: { id: eventId, stsrc: { not: EVENT_STSRC.deleted } },
      select: { id: true },
    })
    if (!existingEvent) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const sectionIds = getUniqueValues([
      ...deletedSectionIds,
      ...sections.map((section) => section.sectionId),
    ])
    const existingSections =
      sectionIds.length > 0
        ? await prisma.section.findMany({
            where: { eventId, id: { in: sectionIds } },
            select: { fields: true, id: true },
          })
        : []
    if (existingSections.length !== sectionIds.length) {
      res.status(404).json({ error: 'One or more sections were not found' })
      return
    }

    const deletedSectionSet = new Set(deletedSectionIds)
    const existingSectionById = new Map(
      existingSections.map((section) => [section.id, section]),
    )
    const sectionsToUpdate = sections.filter(
      (section) => !deletedSectionSet.has(section.sectionId),
    )
    const shouldTouchEvent =
      (eventPayload && Object.keys(eventPayload).length > 0) ||
      sectionsToUpdate.length > 0 ||
      deletedSectionIds.length > 0

    await prisma.$transaction(async (tx) => {
      const beforeSnapshot = await getEventAuditSnapshot(tx, eventId)

      if (shouldTouchEvent) {
        await tx.event.update({
          where: { id: eventId },
          data: {
            ...(eventPayload?.name !== undefined && { name: eventPayload.name }),
            ...(eventPayload?.color !== undefined && { color: eventPayload.color }),
            ...(eventPayload?.image !== undefined && { image: eventPayload.image }),
            ...(eventPayload?.theme !== undefined && { theme: eventPayload.theme }),
            stsrc: EVENT_STSRC.updated,
            updatedBy: userEmail,
          },
        })
      }

      if (deletedSectionIds.length > 0) {
        await tx.section.deleteMany({
          where: { eventId, id: { in: getUniqueValues(deletedSectionIds) } },
        })
      }

      for (const section of sectionsToUpdate) {
        const existingSection = existingSectionById.get(section.sectionId)
        if (!existingSection) continue
        const data = buildSectionUpdateData(section, existingSection.fields)
        if (Object.keys(data).length === 0) continue

        await tx.section.update({
          where: { id: section.sectionId },
          data,
        })
      }

      if (shouldTouchEvent) {
        const afterSnapshot = await getEventAuditSnapshot(tx, eventId)
        await createFormAuditLog(tx, {
          action: 'builder.save',
          actorEmail: userEmail,
          afterSnapshot,
          beforeSnapshot,
          eventId,
          targetId: eventId,
          targetType: 'event',
        })
      }
    })

    res.json({ ok: true })
  } catch (error) {
    handleControllerError('Events', 'save builder event failed', error, res)
  }
}

export async function deleteEvent(req: Request<EventParams>, res: Response) {
  try {
    const userEmail = getAuthEmail(res)
    const result = await prisma.$transaction(
      (tx) => softDeleteEventById(tx, req.params.id, userEmail),
      SOFT_DELETE_TRANSACTION_OPTIONS,
    )

    if (result !== 'deleted') {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.status(204).send()
  } catch (error) {
    handleControllerError('Events', 'delete event failed', error, res)
  }
}

export async function restoreEvent(req: Request<EventParams>, res: Response) {
  try {
    const existing = await prisma.event.findFirst({
      where: { id: req.params.id, stsrc: EVENT_STSRC.deleted },
      select: { deletedAt: true, id: true },
    })

    if (!existing) {
      res.status(404).json({ error: 'Deleted event not found' })
      return
    }

    const [event] = await prisma.$transaction([
      prisma.event.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          stsrc: EVENT_STSRC.updated,
          updatedBy: getAuthEmail(res),
        },
        include: {
          sections: { orderBy: { order: 'asc' } },
        },
      }),
      prisma.response.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, eventId: existing.id }
          : { id: '__never_restore_response_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: EVENT_STSRC.updated },
      }),
      prisma.responseProgress.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, eventId: existing.id }
          : { id: '__never_restore_progress_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: EVENT_STSRC.updated },
      }),
    ])

    res.json(withActiveEventSections(event))
  } catch (error) {
    handleControllerError('Events', 'restore event failed', error, res)
  }
}

export async function listEventAuditLogs(req: Request<EventParams>, res: Response) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const logs = await listFormAuditLogs(req.params.id)
    res.json(logs)
  } catch (error) {
    handleControllerError('Events', 'list audit logs failed', error, res)
  }
}

export async function rollbackEventAuditLog(
  req: Request<EventParams & { logId: string }>,
  res: Response,
) {
  try {
    const eventId = req.params.id
    const userEmail = getAuthEmail(res)

    const log = await prisma.formAuditLog.findFirst({
      where: { eventId, id: req.params.logId },
    })

    if (!log) {
      res.status(404).json({ error: 'Audit log not found' })
      return
    }

    const beforeRollbackSnapshot = await getEventAuditSnapshot(
      prisma as unknown as Prisma.TransactionClient,
      eventId,
    )

    await prisma.$transaction(
      async (tx) => {
      await restoreEventFromSnapshot(tx, eventId, log.beforeSnapshot, userEmail)

      await createFormAuditLog(tx, {
        action: 'form.rollback',
        actorEmail: userEmail,
        afterSnapshot: {
          eventId,
          restoredAt: new Date().toISOString(),
          restoredFromLogId: log.id,
        },
        beforeSnapshot: beforeRollbackSnapshot,
        eventId,
        targetId: log.id,
        targetType: 'auditLog',
      })
      },
      FORM_ROLLBACK_TRANSACTION_OPTIONS,
    )

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        responses: {
          where: { stsrc: { not: EVENT_STSRC.deleted } },
          orderBy: { submittedAt: 'desc' },
        },
        sections: { orderBy: { order: 'asc' } },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.json(withActiveEventSections(event))
  } catch (error) {
    handleControllerError('Events', 'rollback audit log failed', error, res)
  }
}
