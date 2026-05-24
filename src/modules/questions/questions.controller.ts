import { pollRepository, questionRepository, questionLikeRepository, unitOfWork } from '@/modules/questions/questions.repository.js'
import type { Request, Response } from 'express'
import { handleControllerError } from '@/utils/controller-error.js'
import { getAuthEmail } from '@/utils/auth-context.js'
import type { QuestionPollParams } from '@/modules/questions/questions.types.js'

const POLL_STSRC = {
  updated: 'U',
  deleted: 'D',
} as const

export async function listQuestions(req: Request<QuestionPollParams>, res: Response) {
  try {
    const { pollId } = req.params

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const rawQuestions = await questionRepository.findMany({
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

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC.deleted } },
      select: { id: true },
    })
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }

    const deletedAt = new Date()
    await unitOfWork.transaction([
      questionRepository.updateMany({
        where: { pollId, stsrc: { not: POLL_STSRC.deleted } },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      questionLikeRepository.updateMany({
        where: {
          question: { pollId },
          stsrc: { not: POLL_STSRC.deleted },
        },
        data: { deletedAt, stsrc: POLL_STSRC.deleted },
      }),
      pollRepository.update({
        where: { id: pollId },
        data: { stsrc: POLL_STSRC.updated, updatedBy: getAuthEmail(res) },
      }),
    ])
    res.json({ success: true })
  } catch (error) {
    handleControllerError('Questions', 'delete questions failed', error, res)
  }
}
