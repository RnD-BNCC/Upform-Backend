import { formAuditLogRepository } from '@/modules/events/events.repository.js'
import type { Prisma } from '../../../generated/prisma/index.js'
import { toPrismaJson } from '@/utils/prisma-json.js'

type PrismaTx = Prisma.TransactionClient
export const FORM_ROLLBACK_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const

const BATCH_SIZE = 500

function parseDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function chunkArray<T>(items: T[], size = BATCH_SIZE) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function groupSnapshotRecords(
  records: Array<{ deletedAt?: string | null; id: string; stsrc?: string }> = [],
) {
  const groups = new Map<
    string,
    { deletedAt: Date | null; ids: string[]; stsrc: string }
  >()

  for (const record of records) {
    const deletedAt = parseDate(record.deletedAt)
    const stsrc = record.stsrc ?? 'A'
    const key = `${stsrc}:${deletedAt?.toISOString() ?? 'null'}`
    const group = groups.get(key) ?? { deletedAt, ids: [], stsrc }
    group.ids.push(record.id)
    groups.set(key, group)
  }

  return Array.from(groups.values())
}

export async function getEventAuditSnapshot(tx: PrismaTx, eventId: string) {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: {
      responseProgresses: {
        select: { deletedAt: true, id: true, stsrc: true },
      },
      responses: {
        select: { deletedAt: true, id: true, stsrc: true },
      },
      sections: { orderBy: { order: 'asc' } },
    },
  })

  return event ? toPrismaJson(event) : null
}

export async function createFormAuditLog(
  tx: PrismaTx,
  data: {
    action: string
    actorEmail?: string | null
    afterSnapshot?: Prisma.InputJsonValue | null
    beforeSnapshot?: Prisma.InputJsonValue | null
    eventId: string
    targetId?: string | null
    targetType: string
  },
) {
  return tx.formAuditLog.create({
    data: {
      action: data.action,
      actorEmail: data.actorEmail ?? null,
      afterSnapshot: data.afterSnapshot ?? undefined,
      beforeSnapshot: data.beforeSnapshot ?? undefined,
      eventId: data.eventId,
      targetId: data.targetId ?? null,
      targetType: data.targetType,
    },
  })
}

export async function restoreEventFromSnapshot(
  tx: PrismaTx,
  eventId: string,
  snapshotValue: unknown,
  actorEmail?: string | null,
) {
  const snapshot = snapshotValue as {
    color?: string
    deletedAt?: string | null
    deletedBy?: string | null
    description?: string
    image?: string | null
    name?: string
    responseProgresses?: Array<{ deletedAt?: string | null; id: string; stsrc?: string }>
    responses?: Array<{ deletedAt?: string | null; id: string; stsrc?: string }>
    sections?: Array<{
      description?: string
      fields?: unknown
      id: string
      logicX?: number | null
      logicY?: number | null
      order?: number
      pageType?: string
      settings?: unknown
      title?: string
    }>
    status?: string
    stsrc?: string
    theme?: string
  } | null

  if (!snapshot) {
    throw new Error('Rollback snapshot is empty')
  }

  await tx.event.update({
    where: { id: eventId },
    data: {
      color: snapshot.color ?? '#0054a5',
      deletedAt: parseDate(snapshot.deletedAt),
      deletedBy: snapshot.deletedBy ?? null,
      description: snapshot.description ?? '',
      image: snapshot.image ?? null,
      name: snapshot.name ?? '',
      status: snapshot.status ?? 'draft',
      stsrc: snapshot.stsrc ?? 'U',
      theme: snapshot.theme ?? 'light',
      updatedBy: actorEmail ?? null,
    },
  })

  const snapshotSections = snapshot.sections ?? []
  const snapshotSectionIds = snapshotSections.map((section) => section.id)
  await tx.section.deleteMany({
    where: { eventId, id: { notIn: snapshotSectionIds } },
  })

  for (const section of snapshotSections) {
    await tx.section.upsert({
      where: { id: section.id },
      create: {
        description: section.description ?? '',
        eventId,
        fields: toPrismaJson(section.fields ?? []),
        id: section.id,
        logicX: section.logicX ?? null,
        logicY: section.logicY ?? null,
        order: section.order ?? 0,
        pageType: section.pageType ?? 'page',
        settings: toPrismaJson(section.settings ?? {}),
        title: section.title ?? '',
      },
      update: {
        description: section.description ?? '',
        fields: toPrismaJson(section.fields ?? []),
        logicX: section.logicX ?? null,
        logicY: section.logicY ?? null,
        order: section.order ?? 0,
        pageType: section.pageType ?? 'page',
        settings: toPrismaJson(section.settings ?? {}),
        title: section.title ?? '',
      },
    })
  }

  for (const group of groupSnapshotRecords(snapshot.responses)) {
    for (const ids of chunkArray(group.ids)) {
      await tx.response.updateMany({
        where: { eventId, id: { in: ids } },
        data: {
          deletedAt: group.deletedAt,
          stsrc: group.stsrc,
        },
      })
    }
  }

  for (const group of groupSnapshotRecords(snapshot.responseProgresses)) {
    for (const ids of chunkArray(group.ids)) {
      await tx.responseProgress.updateMany({
        where: { eventId, id: { in: ids } },
        data: {
          deletedAt: group.deletedAt,
          stsrc: group.stsrc,
        },
      })
    }
  }
}

export async function listFormAuditLogs(eventId: string) {
  return formAuditLogRepository.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
