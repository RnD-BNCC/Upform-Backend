import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { prisma } from './prisma.js'

let io: Server | null = null

const pollParticipants = new Map<string, Map<string, { id: string; name: string; avatarSeed?: string; score: number }>>()
const pollLeaderboardActive = new Map<string, boolean>()
const pollLeaderboardScores = new Map<string, Array<{ id: string; name: string; avatarSeed?: string; score: number }>>()

function broadcastParticipantList(pollId: string) {
  const map = pollParticipants.get(pollId)
  const list = map ? Array.from(map.values()) : []
  io?.to(`poll:${pollId}`).emit('participant-list', list)
}

export function addScore(pollId: string, participantId: string, points: number) {
  const map = pollParticipants.get(pollId)
  if (!map) return
  const p = map.get(participantId)
  if (p) p.score += points
}

export function getPollScores(pollId: string): Array<{ id: string; name: string; avatarSeed?: string; score: number }> {
  const map = pollParticipants.get(pollId)
  if (!map) return []
  return Array.from(map.values())
    .filter(p => p.score > 0 || true)
    .sort((a, b) => b.score - a.score)
}

export function resetScores(pollId: string) {
  const map = pollParticipants.get(pollId)
  if (!map) return
  for (const [, p] of map) p.score = 0
}

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    socket.on('join-poll', async (pollId: string) => {
      socket.join(`poll:${pollId}`)
      const room = io!.sockets.adapter.rooms.get(`poll:${pollId}`)
      io!.to(`poll:${pollId}`).emit('participant-count', room?.size ?? 0)

      try {
        const poll = await prisma.poll.findUnique({ where: { id: pollId } })
        if (poll) {
          socket.emit('slide-change', { currentSlide: poll.currentSlide })
          socket.emit('poll-state', { status: poll.status })
        }
      } catch (error) {
        console.error('[socket:join-poll] Failed to fetch poll state:', error)
      }

      if (pollLeaderboardActive.get(pollId)) {
        const scores = pollLeaderboardScores.get(pollId) ?? []
        socket.emit('show-leaderboard', { scores })
      }

      broadcastParticipantList(pollId)
    })

    socket.on('join-participant', ({ pollId, participantId, name, avatarSeed }: { pollId: string; participantId: string; name: string; avatarSeed?: string }) => {
      if (!pollParticipants.has(pollId)) {
        pollParticipants.set(pollId, new Map())
      }
      pollParticipants.get(pollId)!.set(participantId, { id: participantId, name, avatarSeed, score: 0 })
      socket.data.participantId = participantId
      socket.data.pollId = pollId
      broadcastParticipantList(pollId)
    })

    socket.on('broadcast-countdown', ({ pollId, count }: { pollId: string; count: number }) => {
      socket.to(`poll:${pollId}`).emit('countdown', { count })
    })

    socket.on('broadcast-poll-state', ({ pollId, status, currentSlide }: { pollId: string; status?: string; currentSlide?: number }) => {
      if (status) socket.to(`poll:${pollId}`).emit('poll-state', { status })
      if (currentSlide !== undefined) socket.to(`poll:${pollId}`).emit('slide-change', { currentSlide })
    })

    socket.on('request-scores', ({ pollId }: { pollId: string }) => {
      const scores = getPollScores(pollId)
      socket.emit('scores-update', { pollId, scores })
    })

    socket.on('broadcast-leaderboard', ({ pollId }: { pollId: string }) => {
      const scores = getPollScores(pollId)
      pollLeaderboardActive.set(pollId, true)
      pollLeaderboardScores.set(pollId, scores)
      io?.to(`poll:${pollId}`).emit('show-leaderboard', { scores })
    })

    socket.on('hide-leaderboard', ({ pollId }: { pollId: string }) => {
      pollLeaderboardActive.delete(pollId)
      pollLeaderboardScores.delete(pollId)
    })

    socket.on('qa-highlight', ({ pollId, voteId }: { pollId: string; voteId: string | null }) => {
      io?.to(`poll:${pollId}`).emit('qa-highlight', { voteId })
    })

    socket.on('reset-scores', ({ pollId }: { pollId: string }) => {
      resetScores(pollId)
      pollLeaderboardActive.delete(pollId)
      pollLeaderboardScores.delete(pollId)
    })

    socket.on('question:submit', async ({ pollId, text, authorName, authorId }: { pollId: string; text: string; authorName: string; authorId: string }) => {
      // Validasi text
      if (!text || text.trim().length === 0) {
        socket.emit('question:error', { code: 'VALIDATION_ERROR', message: 'Pertanyaan tidak boleh kosong.' })
        return
      }
      if (text.length > 200) {
        socket.emit('question:error', { code: 'VALIDATION_ERROR', message: 'Pertanyaan maksimal 200 karakter.' })
        return
      }

      // Validasi limit: max 5 pertanyaan per authorId per pollId
      if (authorId) {
        const count = await prisma.question.count({ where: { pollId, authorId } })
        if (count >= 5) {
          socket.emit('question:error', { code: 'LIMIT_EXCEEDED', message: 'Kamu sudah mencapai batas maksimal 5 pertanyaan.' })
          return
        }
      }

      const question = await prisma.question.create({
        data: { pollId, text: text.trim(), authorName, authorId },
      })

      io?.to(`poll:${pollId}`).emit('question:new', {
        id: question.id,
        text: question.text,
        authorName: question.authorName,
        likeCount: question.likeCount,
        createdAt: question.createdAt.toISOString(),
      })
    })

    socket.on('question:like', async ({ pollId, questionId, userId, like }: { pollId: string; questionId: string; userId: string; like: boolean }) => {
      try {
        await prisma.$transaction(async (tx) => {
          if (like) {
            await tx.questionLike.upsert({
              where: { questionId_userId: { questionId, userId } },
              create: { questionId, userId },
              update: {},
            })
            await tx.question.update({
              where: { id: questionId },
              data: { likeCount: { increment: 1 } },
            })
          } else {
            const existing = await tx.questionLike.findUnique({
              where: { questionId_userId: { questionId, userId } },
            })
            if (existing) {
              await tx.questionLike.delete({ where: { questionId_userId: { questionId, userId } } })
              await tx.question.update({
                where: { id: questionId },
                data: { likeCount: { decrement: 1 } },
              })
            }
          }
        })

        const [question, likes] = await Promise.all([
          prisma.question.findUnique({ where: { id: questionId }, select: { likeCount: true } }),
          prisma.questionLike.findMany({ where: { questionId }, select: { userId: true } }),
        ])

        io?.to(`poll:${pollId}`).emit('question:like_updated', {
          questionId,
          likeCount: question?.likeCount ?? 0,
          likedByIds: likes.map(l => l.userId),
        })
      } catch (error) {
        console.error('[socket:question:like] Error:', error)
      }
    })

    socket.on('leave-poll', (pollId: string) => {
      socket.leave(`poll:${pollId}`)
      const room = io!.sockets.adapter.rooms.get(`poll:${pollId}`)
      io!.to(`poll:${pollId}`).emit('participant-count', room?.size ?? 0)

      const { participantId } = socket.data
      if (participantId && pollParticipants.has(pollId)) {
        pollParticipants.get(pollId)!.delete(participantId)
        broadcastParticipantList(pollId)
        if (pollParticipants.get(pollId)!.size === 0) {
          pollParticipants.delete(pollId)
        }
      }
    })

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('poll:')) {
          const pollId = room.replace('poll:', '')
          socket.to(room).emit('participant-count',
            (io!.sockets.adapter.rooms.get(room)?.size ?? 1) - 1
          )

          const { participantId } = socket.data
          if (participantId && pollParticipants.has(pollId)) {
            pollParticipants.get(pollId)!.delete(participantId)
            broadcastParticipantList(pollId)
            if (pollParticipants.get(pollId)!.size === 0) {
              pollParticipants.delete(pollId)
            }
          }
        }
      }
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}
