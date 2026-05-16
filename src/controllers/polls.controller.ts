import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { getPollScores } from '../config/socket.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { AuthUser } from '../middlewares/auth.js'
import type { PollParams, CreatePollBody, UpdatePollBody } from '../types/polls.js'

const POLL_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
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
      prisma.poll.findMany({
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
      prisma.poll.count({ where }),
      prisma.poll.count({ where: { stsrc: { not: POLL_STSRC.deleted } } }),
      prisma.poll.count({ where: { stsrc: POLL_STSRC.deleted } }),
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
    const poll = await prisma.poll.findFirst({
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
    const { title } = req.body
    const userEmail = getAuthEmail(res)

    let code = generateCode()
    while (await prisma.poll.findUnique({ where: { code } })) {
      code = generateCode()
    }

    const poll = await prisma.poll.create({
      data: {
        title: title ?? '',
        code,
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
    const { title, status, currentSlide, settings } = req.body
    const userEmail = getAuthEmail(res)

    const existing = await prisma.poll.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const poll = await prisma.poll.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(status !== undefined && { status }),
        ...(currentSlide !== undefined && { currentSlide }),
        ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
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

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'update poll failed', error, res)
  }
}

export async function deletePoll(req: Request<PollParams>, res: Response) {
  try {
    const existing = await prisma.poll.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const userEmail = getAuthEmail(res)
    const deletedAt = new Date()
    await prisma.$transaction([
      prisma.poll.update({
        where: { id: req.params.id },
        data: {
          stsrc: POLL_STSRC.deleted,
          deletedAt,
          updatedBy: userEmail,
          deletedBy: userEmail,
        },
      }),
      prisma.pollSlide.updateMany({
        where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.pollVote.updateMany({
        where: {
          slide: { pollId: req.params.id },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.question.updateMany({
        where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.questionLike.updateMany({
        where: {
          question: { pollId: req.params.id },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
    ])
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll failed', error, res)
  }
}

export async function restorePoll(req: Request<PollParams>, res: Response) {
  try {
    const existing = await prisma.poll.findFirst({
      where: { id: req.params.id, stsrc: POLL_STSRC.deleted },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const poll = await prisma.$transaction(async (tx) => {
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

      return tx.poll.update({
        where: { id: req.params.id },
        data: {
          stsrc: POLL_STSRC.updated,
          deletedAt: null,
          deletedBy: null,
          updatedBy: getAuthEmail(res),
        },
        include: {
          slides: {
            where: { stsrc: { not: POLL_STSRC.deleted } },
            orderBy: { order: 'asc' },
          },
        },
      })
    })

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'restore poll failed', error, res)
  }
}

export async function listPollScores(req: Request<PollParams>, res: Response) {
  try {
    const existing = await prisma.poll.findFirst({
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

export async function deletePollVotes(req: Request<PollParams>, res: Response) {
  try {
    const existing = await prisma.poll.findFirst({
      where: { id: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const slides = await prisma.pollSlide.findMany({
      where: { pollId: req.params.id, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    const deletedAt = new Date()
    await prisma.$transaction([
      prisma.pollVote.updateMany({
        where: {
          slideId: { in: slides.map((slide) => slide.id) },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.poll.update({
        where: { id: req.params.id },
        data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
      }),
    ])
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll votes failed', error, res)
  }
}
