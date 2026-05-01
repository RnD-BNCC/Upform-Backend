import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { QuestionPollParams } from '../types/questions.js'

export async function listQuestions(req: Request<QuestionPollParams>, res: Response) {
  try {
    const { pollId } = req.params

    const rawQuestions = await prisma.question.findMany({
      where: { pollId },
      orderBy: { createdAt: 'asc' },
      include: { likes: { select: { userId: true } } },
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
    await prisma.question.deleteMany({ where: { pollId } })
    res.json({ success: true })
  } catch (error) {
    handleControllerError('Questions', 'delete questions failed', error, res)
  }
}
