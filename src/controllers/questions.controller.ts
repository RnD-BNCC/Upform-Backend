import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { AuthUser } from '../middlewares/auth.js'
import type { QuestionPollParams } from '../types/questions.js'

const POLL_STSRC = {
  updated: 'U',
  deleted: 'D',
} as const

function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
}

export async function listQuestions(req: Request<QuestionPollParams>, res: Response) {
  try {
    const { pollId } = req.params

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const rawQuestions = await prisma.question.findMany({
      where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
      orderBy: { createdAt: 'asc' },
      include: {
        likes: {
          where: { stsrc: { not: POLL_STSRC.deleted } },
          select: { userId: true },
        },
      },
    })

    const questions = rawQuestions.map((question) => ({
      id: question.id,
      text: question.text,
      authorName: question.authorName,
      authorId: question.authorId,
      likeCount: question.likeCount,
      createdAt: question.createdAt.toISOString(),
      likedByIds: question.likes.map((like) => like.userId),
    }))

    res.json({ questions })
  } catch (error) {
    handleControllerError('Questions', 'list questions failed', error, res)
  }
}

export async function deleteQuestions(req: Request<QuestionPollParams>, res: Response) {
  try {
    const { pollId } = req.params

    const poll = await prisma.poll.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const deletedAt = new Date()
    await prisma.$transaction([
      prisma.question.updateMany({
        where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.questionLike.updateMany({
        where: {
          question: { pollId },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      prisma.poll.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
      }),
    ])
    res.json({ success: true })
  } catch (error) {
    handleControllerError('Questions', 'delete questions failed', error, res)
  }
}
