import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { addScore, getIO } from '../config/socket.js'
import { aggregateResults } from '../utils/poll-aggregation.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { PollCodeParams, CorrectArea } from '../types/public-polls.js'
import type { PollSlideParams, PollVoteParams } from '../types/poll-slides.js'

export async function joinPollByCode(req: Request<PollCodeParams>, res: Response) {
  try {
    const poll = await prisma.poll.findUnique({
      where: { code: req.params.code },
      include: { slides: { orderBy: { order: 'asc' } } },
    })

    if (!poll || poll.status === 'ended') {
      res.status(404).json({ error: 'Poll not found or has ended' })
      return
    }

    const sanitizedPoll = {
      ...poll,
      slides: poll.slides.map((slide) => {
        const { correctAnswer, correctAnswers, correctNumber, ...safeSettings } =
          (slide.settings as Record<string, unknown>) ?? {}
        return { ...slide, settings: safeSettings }
      }),
    }

    res.json(sanitizedPoll)
  } catch (error) {
    handleControllerError('Public Polls', 'join poll failed', error, res)
  }
}

export async function submitPollVote(req: Request<PollSlideParams>, res: Response) {
  try {
    const { pollId, slideId } = req.params
    const { participantId, value } = req.body

    if (!participantId || value === undefined) {
      res.status(400).json({ error: 'participantId and value are required' })
      return
    }

    const slide = await prisma.pollSlide.findFirst({
      where: { id: slideId, pollId, poll: { status: 'active' } },
    })
    if (!slide) {
      res.status(404).json({ error: 'Slide not found or poll not active' })
      return
    }

    if (slide.locked) {
      res.status(403).json({ error: 'Voting is locked for this slide' })
      return
    }

    let vote
    if (slide.type === 'qa') {
      const uniqueParticipantId = `${participantId}_${Date.now()}`
      vote = await prisma.pollVote.create({
        data: { slideId, participantId: uniqueParticipantId, value },
      })
    } else {
      vote = await prisma.pollVote.upsert({
        where: { slideId_participantId: { slideId, participantId } },
        create: { slideId, participantId, value },
        update: { value },
      })
    }

    const results = await aggregateResults(slide.type, slideId)
    const io = getIO()
    io.to(`poll:${pollId}`).emit('vote-update', { slideId, results })

    const settings = (slide.settings as Record<string, unknown>) ?? {}
    const correctAnswer = settings.correctAnswer as string | undefined
    const correctAnswers = settings.correctAnswers as string[] | undefined
    const correctNumber = settings.correctNumber as number | undefined
    const correctArea = settings.correctArea as CorrectArea | undefined
    const quizTypes = ['multiple_choice', 'word_cloud', 'guess_number']
    const isQuizSlide =
      (
        quizTypes.includes(slide.type) &&
        !!(correctAnswer || (correctAnswers && correctAnswers.length > 0) || correctNumber !== undefined)
      ) ||
      (slide.type === 'pin_on_image' && !!correctArea)

    if (isQuizSlide) {
      let isCorrect = false
      if (slide.type === 'multiple_choice' && correctAnswer) {
        isCorrect = (value as { option?: string }).option === correctAnswer
      } else if (slide.type === 'word_cloud' && correctAnswers && correctAnswers.length > 0) {
        const submitted = (value as { word?: string }).word?.trim().toLowerCase() ?? ''
        isCorrect = correctAnswers.some((answer) => answer.trim().toLowerCase() === submitted)
      } else if (slide.type === 'guess_number' && correctNumber !== undefined) {
        isCorrect = Number((value as { value?: number }).value) === correctNumber
      } else if (slide.type === 'pin_on_image' && correctArea) {
        const pin = value as { x?: number; y?: number }
        const px = pin.x ?? 0
        const py = pin.y ?? 0
        isCorrect =
          px >= correctArea.x &&
          px <= correctArea.x + correctArea.width &&
          py >= correctArea.y &&
          py <= correctArea.y + correctArea.height
      }

      let points = 0
      if (isCorrect) {
        let priorVotes = 0
        if (slide.type === 'multiple_choice' && correctAnswer) {
          priorVotes = await prisma.pollVote.count({
            where: {
              slideId,
              createdAt: { lt: vote.createdAt },
              value: { path: ['option'], equals: correctAnswer },
            },
          })
        } else if (slide.type === 'word_cloud' && correctAnswers) {
          const prior = await prisma.pollVote.findMany({
            where: { slideId, createdAt: { lt: vote.createdAt } },
            select: { value: true },
          })
          priorVotes = prior.filter((priorVote) => {
            const word = (priorVote.value as { word?: string }).word?.trim().toLowerCase() ?? ''
            return correctAnswers.some((answer) => answer.trim().toLowerCase() === word)
          }).length
        } else if (slide.type === 'guess_number' && correctNumber !== undefined) {
          priorVotes = await prisma.pollVote.count({
            where: {
              slideId,
              createdAt: { lt: vote.createdAt },
              value: { path: ['value'], equals: correctNumber },
            },
          })
        } else if (slide.type === 'pin_on_image' && correctArea) {
          const prior = await prisma.pollVote.findMany({
            where: { slideId, createdAt: { lt: vote.createdAt } },
            select: { value: true },
          })
          priorVotes = prior.filter((priorVote) => {
            const pin = priorVote.value as { x?: number; y?: number }
            const px = pin.x ?? 0
            const py = pin.y ?? 0
            return (
              px >= correctArea.x &&
              px <= correctArea.x + correctArea.width &&
              py >= correctArea.y &&
              py <= correctArea.y + correctArea.height
            )
          }).length
        }

        points = Math.max(100, 1000 - priorVotes * 100)
        addScore(pollId, participantId, points)
      }

      io.to(`poll:${pollId}`).emit('score-update', { participantId, points, isCorrect })
    }

    res.json({ ok: true })
  } catch (error) {
    handleControllerError('Public Polls', 'submit vote failed', error, res)
  }
}

export async function getPollSlideResults(req: Request<PollSlideParams>, res: Response) {
  try {
    const { pollId, slideId } = req.params

    const slide = await prisma.pollSlide.findFirst({
      where: { id: slideId, pollId },
    })
    if (!slide) {
      res.status(404).json({ error: 'Slide not found' })
      return
    }

    const results = await aggregateResults(slide.type, slideId)
    res.json(results)
  } catch (error) {
    handleControllerError('Public Polls', 'get slide results failed', error, res)
  }
}

export async function togglePollVoteAnswer(req: Request<PollVoteParams>, res: Response) {
  try {
    const { pollId, slideId, voteId } = req.params

    const vote = await prisma.pollVote.findFirst({
      where: { id: voteId, slideId },
    })
    if (!vote) {
      res.status(404).json({ error: 'Vote not found' })
      return
    }

    const updated = await prisma.pollVote.update({
      where: { id: voteId },
      data: { isAnswered: !vote.isAnswered },
    })

    const results = await aggregateResults('qa', slideId)
    const io = getIO()
    io.to(`poll:${pollId}`).emit('vote-update', { slideId, results })

    res.json({ ok: true, isAnswered: updated.isAnswered })
  } catch (error) {
    handleControllerError('Public Polls', 'toggle vote answer failed', error, res)
  }
}
