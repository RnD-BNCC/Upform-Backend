import {
  pollRepository,
  pollSlideRepository,
  pollVoteRepository,
  questionLikeRepository,
  questionRepository,
  unitOfWork,
} from '@/modules/polls/polls.repository.js'
import {
  addScore,
  broadcastParticipantList,
  emitParticipantCount,
  emitQuestionError,
  emitSocketError,
  emitToPoll,
  emitToPollExcept,
  getPollId,
  getPollIdFromRoom,
  getPollRoom,
  getPollScores,
  hydrateLeaderboard,
  joinPollGroup,
  leavePollGroup,
  removeSocketParticipant,
  resetLeaderboard,
  resetScores,
  showLeaderboard,
  hideLeaderboard,
  upsertParticipant,
  type PollSocket,
  type SocketAck,
} from '@/modules/polls/poll-realtime.service.js'
import { aggregateResults } from '@/utils/poll-aggregation.js'
import { getIO, getRoomSize } from '@/services/socket.service.js'
import type { Server } from 'socket.io'

export { addScore, getPollScores, resetScores }

type PollSnapshot = {
  currentSlide: number
  id: string
  status: string
}

type JoinParticipantPayload = {
  avatarSeed?: string
  name: string
  participantId: string
  pollId: string
}

type BroadcastPollStatePayload = {
  currentSlide?: number
  pollId: string
  status?: string
}

type QuestionSubmitPayload = {
  authorId: string
  authorName: string
  pollId: string
  text: string
}

type QuestionLikePayload = {
  like: boolean
  pollId: string
  questionId: string
  userId: string
}

type QAHighlightPayload = {
  pollId: string
  question?: {
    createdAt: string
    isAnswered?: boolean
    likeCount?: number
    participantName: string
    text: string
    voteId?: string
  } | null
  slideId?: string
  voteId: string | null
}

const POLL_STSRC_DELETED = 'D'
const QUESTION_MAX_LENGTH = 200
const QUESTION_LIMIT_PER_AUTHOR = 5

async function getPollSnapshot(pollId: string) {
  return pollRepository.findFirst({
    where: { id: pollId, stsrc: { not: POLL_STSRC_DELETED } },
    select: { currentSlide: true, id: true, status: true },
  })
}

async function negotiatePollSession(
  socket: PollSocket,
  pollId: string,
  ack?: SocketAck,
): Promise<PollSnapshot | null> {
  if (!pollId) {
    emitSocketError(socket, {
      code: 'INVALID_POLL_ID',
      message: 'Poll ID is required.',
    }, ack)
    return null
  }

  try {
    const poll = await getPollSnapshot(pollId)
    if (!poll) {
      emitSocketError(socket, {
        code: 'POLL_NOT_FOUND',
        message: 'Poll not found.',
      }, ack)
      return null
    }

    const payload = {
      currentSlide: poll.currentSlide,
      pollId: poll.id,
      status: poll.status,
    }

    socket.emit('poll:negotiated', payload)
    socket.emit('slide-change', { currentSlide: poll.currentSlide })
    socket.emit('poll-state', { status: poll.status })
    ack?.({ ok: true, ...payload })

    return poll
  } catch (error) {
    console.error('[socket:negotiate-poll] Failed to negotiate poll session:', error)
    emitSocketError(socket, {
      code: 'NEGOTIATION_FAILED',
      message: 'Failed to negotiate poll session.',
    }, ack)
    return null
  }
}

async function clearPollQuestions(pollId: string) {
  const poll = await pollRepository.findFirst({
    where: { id: pollId, stsrc: { not: POLL_STSRC_DELETED } },
    select: { id: true },
  })
  if (!poll) return

  const deletedAt = new Date()
  await unitOfWork.transaction([
    questionLikeRepository.updateMany({
      where: {
        question: { pollId },
        stsrc: { not: POLL_STSRC_DELETED },
      },
      data: { deletedAt, stsrc: POLL_STSRC_DELETED },
    }),
    questionRepository.updateMany({
      where: { pollId, stsrc: { not: POLL_STSRC_DELETED } },
      data: { deletedAt, stsrc: POLL_STSRC_DELETED },
    }),
    pollVoteRepository.updateMany({
      where: {
        slide: { pollId, type: 'qa' },
        stsrc: { not: POLL_STSRC_DELETED },
      },
      data: { deletedAt, stsrc: POLL_STSRC_DELETED },
    }),
  ])
}

async function createQuestionPollVote(pollId: string, text: string, authorName: string, authorId: string) {
  const slide = await pollSlideRepository.findFirst({
    where: {
      pollId,
      type: 'qa',
      stsrc: { not: POLL_STSRC_DELETED },
      poll: { stsrc: { not: POLL_STSRC_DELETED } },
    },
  })

  if (!slide) return null

  const pollVote = await pollVoteRepository.create({
    data: {
      participantId: `${authorId}_qa_${Date.now()}`,
      slideId: slide.id,
      value: { participantName: authorName, text },
    },
  })

  const results = await aggregateResults('qa', slide.id)
  emitToPoll(pollId, 'vote-update', { results, slideId: slide.id })

  return pollVote.id
}

async function toggleQuestionLike({ like, questionId, userId }: QuestionLikePayload) {
  await unitOfWork.transaction(async (tx) => {
    const existing = await tx.questionLike.findUnique({
      where: { questionId_userId: { questionId, userId } },
    })

    if (like) {
      if (!existing) {
        await tx.questionLike.create({ data: { questionId, userId } })
        await tx.question.update({
          where: { id: questionId },
          data: { likeCount: { increment: 1 } },
        })
        return
      }

      if (existing.stsrc === POLL_STSRC_DELETED) {
        await tx.questionLike.update({
          where: { questionId_userId: { questionId, userId } },
          data: { deletedAt: null, stsrc: 'A' },
        })
        await tx.question.update({
          where: { id: questionId },
          data: { likeCount: { increment: 1 } },
        })
      }
      return
    }

    if (existing && existing.stsrc !== POLL_STSRC_DELETED) {
      await tx.questionLike.update({
        where: { questionId_userId: { questionId, userId } },
        data: { deletedAt: new Date(), stsrc: POLL_STSRC_DELETED },
      })
      await tx.question.update({
        where: { id: questionId },
        data: { likeCount: { decrement: 1 } },
      })
    }
  })
}

function registerPollNegotiationHandlers(socket: PollSocket) {
  socket.on('negotiate-poll', async (payload: unknown, ack?: SocketAck) => {
    await negotiatePollSession(socket, getPollId(payload), ack)
  })

  socket.on('join-poll', async (payload: unknown, ack?: SocketAck) => {
    const pollId = getPollId(payload)
    const poll = await negotiatePollSession(socket, pollId)
    if (!poll) return

    const joinPayload = joinPollGroup(socket, poll.id)
    hydrateLeaderboard(socket, poll.id)
    broadcastParticipantList(poll.id)
    ack?.({ ok: true, ...joinPayload })
  })

  socket.on('leave-poll', (payload: unknown) => {
    const pollId = getPollId(payload)
    if (!pollId) return
    leavePollGroup(socket, pollId)
  })
}

function registerParticipantHandlers(socket: PollSocket) {
  socket.on('join-participant', (payload: JoinParticipantPayload) => {
    if (!payload?.pollId || !payload.participantId || !payload.name) {
      emitSocketError(socket, {
        code: 'INVALID_PARTICIPANT',
        message: 'pollId, participantId, and name are required.',
      })
      return
    }

    upsertParticipant(socket, payload)
  })
}

function registerBroadcastHandlers(socket: PollSocket) {
  socket.on('broadcast-countdown', ({ count, pollId }: { count: number; pollId: string }) => {
    if (!pollId) return
    emitToPollExcept(socket, pollId, 'countdown', { count })
  })

  socket.on('broadcast-reveal-answer', ({ pollId }: { pollId: string }) => {
    if (!pollId) return
    emitToPollExcept(socket, pollId, 'reveal-answer')
  })

  socket.on('broadcast-poll-state', ({ currentSlide, pollId, status }: BroadcastPollStatePayload) => {
    if (!pollId) return
    if (status) emitToPollExcept(socket, pollId, 'poll-state', { status })
    if (currentSlide !== undefined) emitToPollExcept(socket, pollId, 'slide-change', { currentSlide })
  })

  socket.on('timer-start', ({ duration, pollId, startedAt }: { duration: number; pollId: string; startedAt: number }) => {
    if (!pollId) return
    emitToPollExcept(socket, pollId, 'timer-start', { duration, pollId, startedAt })
  })

  socket.on('timer-stop', ({ pollId }: { pollId: string }) => {
    if (!pollId) return
    emitToPollExcept(socket, pollId, 'timer-stop', { pollId })
  })

  socket.on('qa-highlight', ({ pollId, question, slideId, voteId }: QAHighlightPayload) => {
    if (!pollId) return
    emitToPoll(pollId, 'qa-highlight', { question: question ?? null, slideId, voteId })
  })
}

function registerLeaderboardHandlers(socket: PollSocket) {
  socket.on('request-scores', ({ pollId }: { pollId: string }) => {
    socket.emit('scores-update', { pollId, scores: getPollScores(pollId) })
  })

  socket.on('broadcast-leaderboard', ({ pollId }: { pollId: string }) => {
    showLeaderboard(pollId)
  })

  socket.on('hide-leaderboard', ({ pollId }: { pollId: string }) => {
    hideLeaderboard(pollId)
  })

  socket.on('reset-scores', async ({ pollId }: { pollId: string }) => {
    resetScores(pollId)
    resetLeaderboard(pollId)

    try {
      await clearPollQuestions(pollId)
    } catch (error) {
      console.error('[socket:reset-scores] Failed to clear questions:', error)
    }

    broadcastParticipantList(pollId)
    emitToPoll(pollId, 'reset-scores', { pollId })
    emitToPoll(pollId, 'scores-update', { pollId, scores: getPollScores(pollId) })
  })
}

function registerQuestionHandlers(socket: PollSocket) {
  socket.on('question:submit', async ({ authorId, authorName, pollId, text }: QuestionSubmitPayload) => {
    const trimmedText = text?.trim() ?? ''

    if (!trimmedText) {
      emitQuestionError(socket, 'VALIDATION_ERROR', 'Pertanyaan tidak boleh kosong.')
      return
    }

    if (trimmedText.length > QUESTION_MAX_LENGTH) {
      emitQuestionError(socket, 'VALIDATION_ERROR', 'Pertanyaan maksimal 200 karakter.')
      return
    }

    const poll = await pollRepository.findFirst({
      where: { id: pollId, stsrc: { not: POLL_STSRC_DELETED } },
      select: { id: true },
    })
    if (!poll) {
      emitQuestionError(socket, 'POLL_NOT_FOUND', 'Poll tidak ditemukan.')
      return
    }

    if (authorId) {
      const count = await questionRepository.count({
        where: { authorId, pollId, stsrc: { not: POLL_STSRC_DELETED } },
      })
      if (count >= QUESTION_LIMIT_PER_AUTHOR) {
        emitQuestionError(socket, 'LIMIT_EXCEEDED', 'Kamu sudah mencapai batas maksimal 5 pertanyaan.')
        return
      }
    }

    const question = await questionRepository.create({
      data: { authorId, authorName, pollId, text: trimmedText },
    })

    let pollVoteId: string | null = null
    try {
      pollVoteId = await createQuestionPollVote(pollId, trimmedText, authorName, authorId)
    } catch (error) {
      console.error('[socket:question:submit] Failed to create poll vote:', error)
    }

    emitToPoll(pollId, 'question:new', {
      authorName: question.authorName,
      createdAt: question.createdAt.toISOString(),
      id: question.id,
      likeCount: question.likeCount,
      pollVoteId,
      text: question.text,
    })
  })

  socket.on('question:like', async (payload: QuestionLikePayload) => {
    try {
      const existingQuestion = await questionRepository.findFirst({
        where: {
          id: payload.questionId,
          pollId: payload.pollId,
          poll: { stsrc: { not: POLL_STSRC_DELETED } },
          stsrc: { not: POLL_STSRC_DELETED },
        },
        select: { id: true },
      })
      if (!existingQuestion) return

      await toggleQuestionLike(payload)

      const [question, likes] = await Promise.all([
        questionRepository.findUnique({
          where: { id: payload.questionId },
          select: { likeCount: true },
        }),
        questionLikeRepository.findMany({
          where: { questionId: payload.questionId, stsrc: { not: POLL_STSRC_DELETED } },
          select: { userId: true },
        }),
      ])

      emitToPoll(payload.pollId, 'question:like_updated', {
        likedByIds: likes.map((like) => like.userId),
        likeCount: question?.likeCount ?? 0,
        questionId: payload.questionId,
      })
    } catch (error) {
      console.error('[socket:question:like] Error:', error)
    }
  })
}

function registerDisconnectHandlers(socket: PollSocket) {
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      const pollId = getPollIdFromRoom(room)
      if (!pollId) continue

      const nextCount = Math.max(0, getRoomSize(room) - 1)
      removeSocketParticipant(socket, pollId)
      socket.to(room).emit('participant-count', nextCount)
    }
  })
}

export function registerPollSocketGateway(server: Server) {
  server.on('connection', (socket) => {
    getIO()
    const pollSocket = socket as PollSocket
    registerPollNegotiationHandlers(pollSocket)
    registerParticipantHandlers(pollSocket)
    registerBroadcastHandlers(pollSocket)
    registerLeaderboardHandlers(pollSocket)
    registerQuestionHandlers(pollSocket)
    registerDisconnectHandlers(pollSocket)
  })
}
