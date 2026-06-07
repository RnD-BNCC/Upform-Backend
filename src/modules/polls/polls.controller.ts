import { pollAuditLogRepository, pollRepository, pollSlideRepository, pollVoteRepository, questionRepository, questionLikeRepository, unitOfWork } from '@/modules/polls/polls.repository.js'
import type { Request, Response } from 'express'
import type { Prisma } from '../../../generated/prisma/index.js'
import { getPollScores } from '@/config/socket.js'
import { handleControllerError } from '@/utils/controller-error.js'
import { getAuthEmail } from '@/utils/auth-context.js'
import type { PollParams, CreatePollBody, UpdatePollBody } from '@/modules/polls/polls.types.js'
import {
  createPollAuditLog,
  getPollAuditSnapshot,
  listPollAuditLogs,
  restorePollFromSnapshot,
} from '@/modules/polls/poll-audit.service.js'

const POLL_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

const RESOURCE_VISIBILITIES = new Set(['private', 'public'])

function normalizeResourceVisibility(value?: string | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized && RESOURCE_VISIBILITIES.has(normalized) ? normalized : 'private'
}

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000))
}

export async function listPolls(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
    const skip = (page - 1) * take
    const search = req.query.search as string | undefined
    const deleted = req.query.deleted === 'true'

    const where: Record<string, unknown> = {
      stsrc: deleted ? POLL_STSRC.deleted : { not: POLL_STSRC.deleted },
    }
    if (search) {
      where.title = { contains: search, mode: 'insensitive' }
    }

    const [polls, total, totalPolls, deletedPolls] = await Promise.all([
      pollRepository.findMany({
        where,
        include: {
          slides: {
            where: { stsrc: { not: POLL_STSRC.deleted } },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      pollRepository.count({ where }),
      pollRepository.count({ where: { stsrc: { not: POLL_STSRC.deleted } } }),
      pollRepository.count({ where: { stsrc: POLL_STSRC.deleted } }),
    ])

    res.json({
      data: polls,
      meta: { page, take, total, totalPages: Math.ceil(total / take) },
      counts: {
        total: totalPolls,
        deleted: deletedPolls,
      },
    })
  } catch (error) {
    handleControllerError('Polls', 'list polls failed', error, res)
  }
}

export async function getPoll(req: Request<PollParams>, res: Response) {
  try {
    const poll = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      include: {
        slides: {
          where: { stsrc: { not: POLL_STSRC.deleted } },
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'get poll failed', error, res)
  }
}

export async function createPoll(
  req: Request<object, unknown, CreatePollBody>,
  res: Response,
) {
  try {
    const { title, visibility } = req.body
    const userEmail = getAuthEmail(res)

    let code = generateCode()
    while (await pollRepository.findUnique({ where: { code } })) {
      code = generateCode()
    }

    const poll = await unitOfWork.transaction(async (tx) => {
      const created = await tx.poll.create({
        data: {
          title: title ?? '',
          code,
          visibility: normalizeResourceVisibility(visibility),
          stsrc: POLL_STSRC.available,
          createdBy: userEmail,
          updatedBy: userEmail,
          slides: {
            create: {
              type: 'multiple_choice',
              question: '',
              order: 0,
              options: [],
            },
          },
        },
        include: {
          slides: {
            where: { stsrc: { not: POLL_STSRC.deleted } },
            orderBy: { order: 'asc' },
          },
        },
      })
      await createPollAuditLog(tx, {
        action: 'poll.created',
        actorEmail: userEmail,
        afterSnapshot: created,
        pollId: created.id,
        targetId: created.id,
        targetType: 'poll',
      })
      return created
    })

    res.status(201).json(poll)
  } catch (error) {
    handleControllerError('Polls', 'create poll failed', error, res)
  }
}

export async function updatePoll(
  req: Request<PollParams, unknown, UpdatePollBody>,
  res: Response,
) {
  try {
    const { title, status, currentSlide, settings, visibility } = req.body
    const userEmail = getAuthEmail(res)

    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const beforeSnapshot = await getPollAuditSnapshot(existing.id)
    const poll = await unitOfWork.transaction(async (tx) => {
      const updated = await tx.poll.update({
        where: { id: req.params.id },
        data: {
          ...(title !== undefined && { title }),
          ...(status !== undefined && { status }),
          ...(currentSlide !== undefined && { currentSlide }),
          ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
          ...(visibility !== undefined && {
            visibility: normalizeResourceVisibility(visibility),
          }),
          stsrc: POLL_STSRC.updated,
          updatedBy: userEmail,
        },
        include: {
          slides: {
            where: { stsrc: { not: POLL_STSRC.deleted } },
            orderBy: { order: 'asc' },
          },
        },
      })
      await createPollAuditLog(tx, {
        action: 'poll.updated',
        actorEmail: userEmail,
        afterSnapshot: updated,
        beforeSnapshot,
        pollId: existing.id,
        targetId: existing.id,
        targetType: 'poll',
      })
      return updated
    })

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'update poll failed', error, res)
  }
}

export async function deletePoll(req: Request<PollParams>, res: Response) {
  try {
    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(existing.id)
    const deletedAt = new Date()
    await unitOfWork.transaction(async (tx) => {
      const deleted = await tx.poll.update({
        where: { id: req.params.id },
        data: {
          stsrc: POLL_STSRC.deleted,
          deletedAt,
          updatedBy: userEmail,
          deletedBy: userEmail,
        },
      })
      await tx.pollSlide.updateMany({
        where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await tx.pollVote.updateMany({
        where: {
          slide: { pollId: req.params.id },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await tx.question.updateMany({
        where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await tx.questionLike.updateMany({
        where: {
          question: { pollId: req.params.id },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await createPollAuditLog(tx, {
        action: 'poll.deleted',
        actorEmail: userEmail,
        afterSnapshot: deleted,
        beforeSnapshot,
        pollId: existing.id,
        targetId: existing.id,
        targetType: 'poll',
      })
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll failed', error, res)
  }
}

export async function restorePoll(req: Request<PollParams>, res: Response) {
  try {
    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: POLL_STSRC.deleted },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(existing.id)
    const poll = await unitOfWork.transaction(async (tx) => {
      await tx.pollSlide.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, pollId: existing.id }
          : { id: '__never_restore_slide_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: POLL_STSRC.updated },
      })
      await tx.pollVote.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, slide: { pollId: existing.id } }
          : { id: '__never_restore_vote_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: POLL_STSRC.updated },
      })
      await tx.question.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, pollId: existing.id }
          : { id: '__never_restore_question_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: POLL_STSRC.updated },
      })
      await tx.questionLike.updateMany({
        where: existing.deletedAt
          ? { deletedAt: existing.deletedAt, question: { pollId: existing.id } }
          : { id: '__never_restore_like_without_delete_timestamp__' },
        data: { deletedAt: null, stsrc: POLL_STSRC.updated },
      })

      const restored = await tx.poll.update({
        where: { id: req.params.id },
        data: {
          stsrc: POLL_STSRC.updated,
          deletedAt: null,
          deletedBy: null,
          updatedBy: userEmail,
        },
        include: {
          slides: {
            where: { stsrc: { not: POLL_STSRC.deleted } },
            orderBy: { order: 'asc' },
          },
        },
      })
      await createPollAuditLog(tx, {
        action: 'poll.restored',
        actorEmail: userEmail,
        afterSnapshot: restored,
        beforeSnapshot,
        pollId: existing.id,
        targetId: existing.id,
        targetType: 'poll',
      })
      return restored
    })

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'restore poll failed', error, res)
  }
}

export async function listPollScores(req: Request<PollParams>, res: Response) {
  try {
    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const scores = getPollScores(req.params.id)
    res.json(scores)
  } catch (error) {
    handleControllerError('Polls', 'list poll scores failed', error, res)
  }
}

export async function listPollAuditLogEntries(req: Request<PollParams>, res: Response) {
  try {
    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const logs = await listPollAuditLogs(req.params.id)
    res.json(logs)
  } catch (error) {
    handleControllerError('Polls', 'list audit logs failed', error, res)
  }
}

export async function rollbackPollAuditLog(
  req: Request<PollParams & { logId: string }>,
  res: Response,
) {
  try {
    const pollId = req.params.id
    const userEmail = getAuthEmail(res)

    const log = await pollAuditLogRepository.findFirst({
      where: { id: req.params.logId, pollId },
    })

    if (!log) {
      res.status(404).json({ error: 'Audit log not found' })
      return
    }

    if (!log.beforeSnapshot) {
      res.status(400).json({ error: 'Audit log does not have a rollback snapshot' })
      return
    }

    const beforeRollbackSnapshot = await getPollAuditSnapshot(pollId)

    await unitOfWork.transaction(async (tx) => {
      await restorePollFromSnapshot(tx, pollId, log.beforeSnapshot, userEmail)
      await createPollAuditLog(tx, {
        action: 'poll.rollback',
        actorEmail: userEmail,
        afterSnapshot: {
          pollId,
          restoredAt: new Date().toISOString(),
          restoredFromLogId: log.id,
        },
        beforeSnapshot: beforeRollbackSnapshot,
        pollId,
        targetId: log.id,
        targetType: 'auditLog',
      })
    })

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
      include: {
        slides: {
          where: { stsrc: { not: POLL_STSRC.deleted } },
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'rollback audit log failed', error, res)
  }
}

export async function deletePollVotes(req: Request<PollParams>, res: Response) {
  try {
    const existing = await pollRepository.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const slides = await pollSlideRepository.findMany({
      where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    const deletedAt = new Date()
    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(existing.id)
    await unitOfWork.transaction(async (tx) => {
      await tx.pollVote.updateMany({
        where: {
          slideId: { in: slides.map((slide) => slide.id) },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      const poll = await tx.poll.update({
        where: { id: req.params.id },
        data: { stsrc: POLL_STSRC.updated, updatedBy: userEmail },
      })
      await createPollAuditLog(tx, {
        action: 'poll.votes_cleared',
        actorEmail: userEmail,
        afterSnapshot: poll,
        beforeSnapshot,
        pollId: existing.id,
        targetId: existing.id,
        targetType: 'poll',
      })
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll votes failed', error, res)
  }
}
