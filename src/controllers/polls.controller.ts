import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { getPollScores } from '../config/socket.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { PollParams, CreatePollBody, UpdatePollBody } from '../types/polls.js'

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000))
}

export async function listPolls(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(50, Math.max(1, parseInt(req.query.take as string) || 9))
    const skip = (page - 1) * take
    const search = req.query.search as string | undefined

    const where: Record<string, unknown> = {}
    if (search) {
      where.title = { contains: search, mode: 'insensitive' }
    }

    const [polls, total] = await Promise.all([
      prisma.poll.findMany({
        where,
        include: { slides: { orderBy: { order: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.poll.count({ where }),
    ])

    res.json({
      data: polls,
      meta: { page, take, total, totalPages: Math.ceil(total / take) },
    })
  } catch (error) {
    handleControllerError('Polls', 'list polls failed', error, res)
  }
}

export async function getPoll(req: Request<PollParams>, res: Response) {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { slides: { orderBy: { order: 'asc' } } },
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

    let code = generateCode()
    while (await prisma.poll.findUnique({ where: { code } })) {
      code = generateCode()
    }

    const poll = await prisma.poll.create({
      data: {
        title: title ?? '',
        code,
        slides: {
          create: {
            type: 'multiple_choice',
            question: '',
            order: 0,
            options: [],
          },
        },
      },
      include: { slides: { orderBy: { order: 'asc' } } },
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

    const existing = await prisma.poll.findUnique({ where: { id: req.params.id } })
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
      },
      include: { slides: { orderBy: { order: 'asc' } } },
    })

    res.json(poll)
  } catch (error) {
    handleControllerError('Polls', 'update poll failed', error, res)
  }
}

export async function deletePoll(req: Request<PollParams>, res: Response) {
  try {
    const existing = await prisma.poll.findUnique({ where: { id: req.params.id } })
    if (!existing) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    await prisma.poll.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll failed', error, res)
  }
}

export async function listPollScores(req: Request<PollParams>, res: Response) {
  try {
    const scores = getPollScores(req.params.id)
    res.json(scores)
  } catch (error) {
    handleControllerError('Polls', 'list poll scores failed', error, res)
  }
}

export async function deletePollVotes(req: Request<PollParams>, res: Response) {
  try {
    const slides = await prisma.pollSlide.findMany({
      where: { pollId: req.params.id },
      select: { id: true },
    })
    await prisma.pollVote.deleteMany({
      where: { slideId: { in: slides.map((slide) => slide.id) } },
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Polls', 'delete poll votes failed', error, res)
  }
}
