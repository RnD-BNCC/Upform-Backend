import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { AuthUser } from '../middlewares/auth.js'
import type {
  PollSlideParams,
  CreatePollSlideBody,
  UpdatePollSlideBody,
  ReorderPollSlidesBody,
} from '../types/poll-slides.js'

const POLL_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
}

export async function createPollSlide(
  req: Request<Pick<PollSlideParams, 'pollId'>, unknown, CreatePollSlideBody>,
  res: Response,
) {
  try {
    const { pollId } = req.params
    const { type, question, options, settings } = req.body

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const maxOrder = await prisma.pollSlide.aggregate({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      _max: { order: true },
    })

    const slide = await prisma.pollSlide.create({
      data: {
        pollId,
        type: type ?? 'multiple_choice',
        question: question ?? '',
        order: (maxOrder._max.order ?? -1) + 1,
        options: options ?? [],
        settings: (settings ?? {}) as Prisma.InputJsonValue,
        stsrc: POLL_STSRC.available,
      },
    })
    await prisma.poll.update({
      where: { id: pollId },
      data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
    })

    res.status(201).json(slide)
  } catch (error) {
    handleControllerError('Poll Slides', 'create slide failed', error, res)
  }
}

export async function updatePollSlide(
  req: Request<PollSlideParams, unknown, UpdatePollSlideBody>,
  res: Response,
) {
  try {
    const { pollId, slideId } = req.params
    const { type, question, options, settings, locked } = req.body

    const existing = await prisma.pollSlide.findFirst({
      where: {
        id: slideId,
        pollId,
        stsrc: { not: POLL_STSRC.deleted },
        poll: { stsrc: { not: POLL_STSRC.deleted } },
      },
    })
    if (!existing) {
      res.status(404).json({ error: 'Slide not found' })
      return
    }

    const slide = await prisma.pollSlide.update({
      where: { id: slideId },
      data: {
        ...(type !== undefined && { type }),
        ...(question !== undefined && { question }),
        ...(options !== undefined && { options }),
        ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
        ...(locked !== undefined && { locked }),
        stsrc: POLL_STSRC.updated,
      },
    })
    await prisma.poll.update({
      where: { id: pollId },
      data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
    })

    res.json(slide)
  } catch (error) {
    handleControllerError('Poll Slides', 'update slide failed', error, res)
  }
}

export async function deletePollSlide(req: Request<PollSlideParams>, res: Response) {
  try {
    const { pollId, slideId } = req.params

    const existing = await prisma.pollSlide.findFirst({
      where: {
        id: slideId,
        pollId,
        stsrc: { not: POLL_STSRC.deleted },
        poll: { stsrc: { not: POLL_STSRC.deleted } },
      },
    })
    if (!existing) {
      res.status(404).json({ error: 'Slide not found' })
      return
    }

    const deletedAt = new Date()
    await prisma.$transaction([
      prisma.pollSlide.update({
        where: { id: slideId },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.pollVote.updateMany({
        where: { slideId, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
      }),
    ])
    res.status(204).send()
  } catch (error) {
    handleControllerError('Poll Slides', 'delete slide failed', error, res)
  }
}

export async function reorderPollSlides(
  req: Request<Pick<PollSlideParams, 'pollId'>, unknown, ReorderPollSlidesBody>,
  res: Response,
) {
  try {
    const { pollId } = req.params
    const { order } = req.body

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const activeSlides = await prisma.pollSlide.findMany({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    const activeSlideIds = new Set(activeSlides.map((slide) => slide.id))
    const hasInvalidOrder =
      order.length !== activeSlideIds.size || order.some((id) => !activeSlideIds.has(id))
    if (hasInvalidOrder) {
      res.status(400).json({ error: 'Order must include every active slide only' })
      return
    }

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.pollSlide.update({ where: { id }, data: { order: index } }),
      ),
    )
    await prisma.poll.update({
      where: { id: pollId },
      data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
    })

    const slides = await prisma.pollSlide.findMany({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      orderBy: { order: 'asc' },
    })

    res.json(slides)
  } catch (error) {
    handleControllerError('Poll Slides', 'reorder slides failed', error, res)
  }
}
