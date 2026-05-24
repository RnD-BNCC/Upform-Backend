import {
  pollRepository,
  pollSlideRepository,
  pollVoteRepository,
  questionLikeRepository,
  questionRepository,
  unitOfWork,
} from '@/modules/polls/polls.repository.js'
import { aggregateResults } from '@/utils/poll-aggregation.js'
import type { Server, Socket } from 'socket.io'

type PollParticipant = {
  avatarSeed?: string
  id: string
  name: string
  score: number
}

type PollSocketData = {
  participantId?: string
  pollId?: string
}

type PollSocket = Socket & {
  data: PollSocketData
}

type PollSnapshot = {
  currentSlide: number
  id: string
  status: string
}

type SocketAck<T = unknown> = (response: T) => void

type PollSocketError = {
  code: string
  message: string
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

const POLL_ROOM_PREFIX = 'poll:'
const POLL_STSRC_DELETED = 'D'
const QUESTION_MAX_LENGTH = 200
const QUESTION_LIMIT_PER_AUTHOR = 5

const pollParticipants = new Map<string, Map<string, PollParticipant>>()
const pollLeaderboardActive = new Map<string, boolean>()
const pollLeaderboardScores = new Map<string, PollParticipant[]>()

let io: Server | null = null

function getSocketServer() {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

function getPollRoom(pollId: string) {
  return `${POLL_ROOM_PREFIX}${pollId}`
}

function getPollIdFromRoom(room: string) {
  return room.startsWith(POLL_ROOM_PREFIX) ? room.slice(POLL_ROOM_PREFIX.length) : null
}

function getPollId(payload: unknown) {
  if (typeof payload === 'string') return payload.trim()
  if (payload && typeof payload === 'object' && 'pollId' in payload) {
    const pollId = (payload as { pollId?: unknown }).pollId
    return typeof pollId === 'string' ? pollId.trim() : ''
  }
  return ''
}

function emitSocketError(socket: PollSocket, error: PollSocketError, ack?: SocketAck) {
  socket.emit('poll:error', error)
  ack?.({ ok: false, error })
}

function emitQuestionError(socket: PollSocket, code: string, message: string) {
  socket.emit('question:error', { code, message })
}

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

function getRoomSize(pollId: string) {
  return getSocketServer().sockets.adapter.rooms.get(getPollRoom(pollId))?.size ?? 0
}

function emitToPoll(pollId: string, event: string, payload?: unknown) {
  getSocketServer().to(getPollRoom(pollId)).emit(event, payload)
}

function emitParticipantCount(pollId: string, overrideCount?: number) {
  emitToPoll(pollId, 'participant-count', overrideCount ?? getRoomSize(pollId))
}

function getParticipantMap(pollId: string) {
  let participants = pollParticipants.get(pollId)
  if (!participants) {
    participants = new Map<string, PollParticipant>()
    pollParticipants.set(pollId, participants)
  }
  return participants
}

function getParticipantList(pollId: string) {
  return Array.from(pollParticipants.get(pollId)?.values() ?? [])
}

function broadcastParticipantList(pollId: string) {
  emitToPoll(pollId, 'participant-list', getParticipantList(pollId))
}

function joinPollGroup(socket: PollSocket, pollId: string) {
  socket.join(getPollRoom(pollId))
  socket.data.pollId = pollId
  emitParticipantCount(pollId)

  const payload = {
    participantCount: getRoomSize(pollId),
    pollId,
    room: getPollRoom(pollId),
  }
  socket.emit('poll:joined', payload)

  return payload
}

function leavePollGroup(socket: PollSocket, pollId: string, nextCount?: number) {
  socket.leave(getPollRoom(pollId))
  removeSocketParticipant(socket, pollId)
  emitParticipantCount(pollId, nextCount)
}

function upsertParticipant(socket: PollSocket, payload: JoinParticipantPayload) {
  const participants = getParticipantMap(payload.pollId)
  const existing = participants.get(payload.participantId)

  participants.set(payload.participantId, {
    avatarSeed: payload.avatarSeed,
    id: payload.participantId,
    name: payload.name,
    score: existing?.score ?? 0,
  })

  socket.data.participantId = payload.participantId
  socket.data.pollId = payload.pollId
  socket.join(getPollRoom(payload.pollId))
  emitParticipantCount(payload.pollId)
  broadcastParticipantList(payload.pollId)
  socket.emit('participant:joined', {
    participantId: payload.participantId,
    pollId: payload.pollId,
  })
}

function removeParticipant(pollId: string, participantId: string) {
  const participants = pollParticipants.get(pollId)
  if (!participants) return

  participants.delete(participantId)
  if (participants.size === 0) {
    pollParticipants.delete(pollId)
  }
}

function removeSocketParticipant(socket: PollSocket, pollId: string) {
  const participantId = socket.data.participantId
  if (!participantId) return

  removeParticipant(pollId, participantId)
  broadcastParticipantList(pollId)

  if (socket.data.pollId === pollId) {
    delete socket.data.pollId
    delete socket.data.participantId
  }
}

function hydrateLeaderboard(socket: PollSocket, pollId: string) {
  if (!pollLeaderboardActive.get(pollId)) return
  socket.emit('show-leaderboard', {
    scores: pollLeaderboardScores.get(pollId) ?? [],
  })
}

export function addScore(pollId: string, participantId: string, points: number) {
  const participant = pollParticipants.get(pollId)?.get(participantId)
  if (participant) participant.score += points
}

export function getPollScores(pollId: string) {
  return getParticipantList(pollId).sort((a, b) => b.score - a.score)
}

export function resetScores(pollId: string) {
  for (const participant of pollParticipants.get(pollId)?.values() ?? []) {
    participant.score = 0
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
    socket.to(getPollRoom(pollId)).emit('countdown', { count })
  })

  socket.on('broadcast-reveal-answer', ({ pollId }: { pollId: string }) => {
    if (!pollId) return
    socket.to(getPollRoom(pollId)).emit('reveal-answer')
  })

  socket.on('broadcast-poll-state', ({ currentSlide, pollId, status }: BroadcastPollStatePayload) => {
    if (!pollId) return
    const room = getPollRoom(pollId)
    if (status) socket.to(room).emit('poll-state', { status })
    if (currentSlide !== undefined) socket.to(room).emit('slide-change', { currentSlide })
  })

  socket.on('qa-highlight', ({ pollId, voteId }: { pollId: string; voteId: string | null }) => {
    if (!pollId) return
    emitToPoll(pollId, 'qa-highlight', { voteId })
  })
}

function registerLeaderboardHandlers(socket: PollSocket) {
  socket.on('request-scores', ({ pollId }: { pollId: string }) => {
    socket.emit('scores-update', { pollId, scores: getPollScores(pollId) })
  })

  socket.on('broadcast-leaderboard', ({ pollId }: { pollId: string }) => {
    const scores = getPollScores(pollId)
    pollLeaderboardActive.set(pollId, true)
    pollLeaderboardScores.set(pollId, scores)
    emitToPoll(pollId, 'show-leaderboard', { scores })
  })

  socket.on('hide-leaderboard', ({ pollId }: { pollId: string }) => {
    pollLeaderboardActive.delete(pollId)
    pollLeaderboardScores.delete(pollId)
    emitToPoll(pollId, 'hide-leaderboard')
  })

  socket.on('reset-scores', async ({ pollId }: { pollId: string }) => {
    resetScores(pollId)
    pollLeaderboardActive.delete(pollId)
    pollLeaderboardScores.delete(pollId)

    try {
      await clearPollQuestions(pollId)
    } catch (error) {
      console.error('[socket:reset-scores] Failed to clear questions:', error)
    }

    broadcastParticipantList(pollId)
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

      const nextCount = Math.max(0, (getSocketServer().sockets.adapter.rooms.get(room)?.size ?? 1) - 1)
      removeSocketParticipant(socket, pollId)
      socket.to(room).emit('participant-count', nextCount)
    }
  })
}

export function registerPollSocketGateway(server: Server) {
  io = server
  server.on('connection', (socket) => {
    const pollSocket = socket as PollSocket
    registerPollNegotiationHandlers(pollSocket)
    registerParticipantHandlers(pollSocket)
    registerBroadcastHandlers(pollSocket)
    registerLeaderboardHandlers(pollSocket)
    registerQuestionHandlers(pollSocket)
    registerDisconnectHandlers(pollSocket)
  })
}
