import type { Prisma } from '../../../generated/prisma/index.js'
import { createFormAuditLog, getEventAuditSnapshot } from '@/modules/events/form-audit.service.js'
import { toPrismaJson } from '@/utils/prisma-json.js'

type PrismaTx = Prisma.TransactionClient
export const SOFT_DELETE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const

const EVENT_STSRC = {
  deleted: 'D',
} as const

export async function softDeleteEventById(
  tx: PrismaTx,
  eventId: string,
  actorEmail?: string | null,
) {
  const existing = await tx.event.findUnique({
    where: { id: eventId },
    select: { id: true, stsrc: true },
  })

  if (!existing) return 'not-found'
  if (existing.stsrc === EVENT_STSRC.deleted) return 'already-deleted'

  const deletedAt = new Date()
  const beforeSnapshot = await getEventAuditSnapshot(tx, existing.id)

  await tx.event.update({
    where: { id: existing.id },
    data: {
      deletedAt,
      deletedBy: actorEmail ?? null,
      stsrc: EVENT_STSRC.deleted,
      updatedBy: actorEmail ?? null,
    },
  })
  const responses = await tx.response.updateMany({
    where: { eventId: existing.id, stsrc: { not: EVENT_STSRC.deleted } },
    data: { deletedAt, stsrc: EVENT_STSRC.deleted },
  })
  const responseProgresses = await tx.responseProgress.updateMany({
    where: { eventId: existing.id, stsrc: { not: EVENT_STSRC.deleted } },
    data: { deletedAt, stsrc: EVENT_STSRC.deleted },
  })

  await createFormAuditLog(tx, {
    action: 'form.delete',
    actorEmail,
    afterSnapshot: toPrismaJson({
      deletedAt,
      deletedBy: actorEmail ?? null,
      id: existing.id,
      responseProgressCount: responseProgresses.count,
      responseCount: responses.count,
      stsrc: EVENT_STSRC.deleted,
    }),
    beforeSnapshot,
    eventId: existing.id,
    targetId: existing.id,
    targetType: 'event',
  })

  return 'deleted'
}
