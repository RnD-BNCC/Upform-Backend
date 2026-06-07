import type { Prisma } from '../../../generated/prisma/index.js'
import { pollAuditLogRepository, pollRepository } from '@/modules/polls/polls.repository.js'
import { toPrismaJson } from '@/utils/prisma-json.js'

const POLL_STSRC_DELETED = 'D'
const POLL_STSRC_UPDATED = 'U'

type PrismaTx = Prisma.TransactionClient

type CreatePollAuditLogInput = {
  action: string
  actorEmail?: string | null
  afterSnapshot?: unknown
  beforeSnapshot?: unknown
  pollId: string
  targetId?: string | null
  targetType: string
}

function parseDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

export async function getPollAuditSnapshot(pollId: string) {
  return pollRepository.findFirst({
    where: { id: pollId },
    include: {
      slides: {
        orderBy: { order: 'asc' },
      },
    },
  })
}

export async function createPollAuditLog(
  client: PrismaTx,
  input: CreatePollAuditLogInput,
) {
  return client.pollAuditLog.create({
    data: {
      action: input.action,
      actorEmail: input.actorEmail ?? null,
      afterSnapshot: (input.afterSnapshot ?? undefined) as Prisma.InputJsonValue,
      beforeSnapshot: (input.beforeSnapshot ?? undefined) as Prisma.InputJsonValue,
      pollId: input.pollId,
      targetId: input.targetId ?? null,
      targetType: input.targetType,
    },
  })
}

export async function restorePollFromSnapshot(
  tx: PrismaTx,
  pollId: string,
  snapshotValue: unknown,
  actorEmail?: string | null,
) {
  const snapshot = snapshotValue as {
    code?: string
    currentSlide?: number
    deletedAt?: string | null
    deletedBy?: string | null
    settings?: unknown
    slides?: Array<{
      deletedAt?: string | null
      id: string
      locked?: boolean
      options?: unknown
      order?: number
      question?: string
      settings?: unknown
      stsrc?: string
      type?: string
    }>
    status?: string
    stsrc?: string
    title?: string
  } | null

  if (!snapshot) {
    throw new Error('Rollback snapshot is empty')
  }

  await tx.poll.update({
    where: { id: pollId },
    data: {
      currentSlide: snapshot.currentSlide ?? 0,
      deletedAt: parseDate(snapshot.deletedAt),
      deletedBy: snapshot.deletedBy ?? null,
      settings: toPrismaJson(snapshot.settings ?? {}),
      status: snapshot.status ?? 'waiting',
      stsrc: snapshot.stsrc ?? POLL_STSRC_UPDATED,
      title: snapshot.title ?? '',
      updatedBy: actorEmail ?? null,
    },
  })

  const snapshotSlides = snapshot.slides ?? []
  const snapshotSlideIds = snapshotSlides.map((slide) => slide.id)
  await tx.pollSlide.updateMany({
    where: { pollId, id: { notIn: snapshotSlideIds } },
    data: { deletedAt: new Date(), stsrc: POLL_STSRC_DELETED },
  })

  for (const slide of snapshotSlides) {
    await tx.pollSlide.upsert({
      where: { id: slide.id },
      create: {
        id: slide.id,
        locked: slide.locked ?? false,
        options: toPrismaJson(slide.options ?? []),
        order: slide.order ?? 0,
        pollId,
        question: slide.question ?? '',
        settings: toPrismaJson(slide.settings ?? {}),
        stsrc: slide.stsrc ?? POLL_STSRC_UPDATED,
        type: slide.type ?? 'multiple_choice',
        deletedAt: parseDate(slide.deletedAt),
      },
      update: {
        locked: slide.locked ?? false,
        options: toPrismaJson(slide.options ?? []),
        order: slide.order ?? 0,
        question: slide.question ?? '',
        settings: toPrismaJson(slide.settings ?? {}),
        stsrc: slide.stsrc ?? POLL_STSRC_UPDATED,
        type: slide.type ?? 'multiple_choice',
        deletedAt: parseDate(slide.deletedAt),
      },
    })
  }
}

export async function listPollAuditLogs(pollId: string) {
  return pollAuditLogRepository.findMany({
    where: {
      pollId,
      poll: { stsrc: { not: POLL_STSRC_DELETED } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
