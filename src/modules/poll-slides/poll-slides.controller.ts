import { pollRepository, pollSlideRepository, pollVoteRepository, unitOfWork } from '@/modules/poll-slides/poll-slides.repository.js'
import type { Request, Response } from 'express'
import type { Prisma } from '../../../generated/prisma/index.js'
import { handleControllerError } from '@/utils/controller-error.js'
import { getAuthEmail } from '@/utils/auth-context.js'
import { createPollAuditLog, getPollAuditSnapshot } from '@/modules/polls/poll-audit.service.js'
import type {
  PollSlideParams,
  CreatePollSlideBody,
  UpdatePollSlideBody,
  ReorderPollSlidesBody,
} from '@/modules/poll-slides/poll-slides.types.js'

const POLL_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

export async function createPollSlide(
  req: Request<Pick<PollSlideParams, 'pollId'>, unknown, CreatePollSlideBody>,
  res: Response,
) {
  try {
    const { pollId } = req.params
    const { type, question, options, settings } = req.body

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const maxOrder = await pollSlideRepository.aggregate({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      _max: { order: true },
    })

    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(pollId)
    const slide = await unitOfWork.transaction(async (tx) => {
      const created = await tx.pollSlide.create({
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
      await tx.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: userEmail },
      })
      await createPollAuditLog(tx, {
        action: 'slide.created',
        actorEmail: userEmail,
        afterSnapshot: created,
        beforeSnapshot,
        pollId,
        targetId: created.id,
        targetType: 'slide',
      })
      return created
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

    const existing = await pollSlideRepository.findFirst({
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

    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(pollId)
    const slide = await unitOfWork.transaction(async (tx) => {
      const updated = await tx.pollSlide.update({
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
      await tx.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: userEmail },
      })
      await createPollAuditLog(tx, {
        action: 'slide.updated',
        actorEmail: userEmail,
        afterSnapshot: updated,
        beforeSnapshot,
        pollId,
        targetId: updated.id,
        targetType: 'slide',
      })
      return updated
    })

    res.json(slide)
  } catch (error) {
    handleControllerError('Poll Slides', 'update slide failed', error, res)
  }
}

export async function deletePollSlide(req: Request<PollSlideParams>, res: Response) {
  try {
    const { pollId, slideId } = req.params

    const existing = await pollSlideRepository.findFirst({
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
    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(pollId)
    await unitOfWork.transaction(async (tx) => {
      const deleted = await tx.pollSlide.update({
        where: { id: slideId },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await tx.pollVote.updateMany({
        where: { slideId, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      })
      await tx.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: userEmail },
      })
      await createPollAuditLog(tx, {
        action: 'slide.deleted',
        actorEmail: userEmail,
        afterSnapshot: deleted,
        beforeSnapshot,
        pollId,
        targetId: deleted.id,
        targetType: 'slide',
      })
    })
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

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const activeSlides = await pollSlideRepository.findMany({
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

    const userEmail = getAuthEmail(res)
    const beforeSnapshot = await getPollAuditSnapshot(pollId)
    await unitOfWork.transaction(async (tx) => {
      await Promise.all(
        order.map((id, index) =>
          tx.pollSlide.update({ where: { id }, data: { order: index } }),
        ),
      )
      const updated = await tx.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: userEmail },
      })
      await createPollAuditLog(tx, {
        action: 'slides.reordered',
        actorEmail: userEmail,
        afterSnapshot: updated,
        beforeSnapshot,
        pollId,
        targetId: pollId,
        targetType: 'poll',
      })
    })

    const slides = await pollSlideRepository.findMany({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      orderBy: { order: 'asc' },
    })

    res.json(slides)
  } catch (error) {
    handleControllerError('Poll Slides', 'reorder slides failed', error, res)
  }
}
