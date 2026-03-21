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

    socket.on('reset-scores', ({ pollId }: { pollId: string }) => {
      resetScores(pollId)
      pollLeaderboardActive.delete(pollId)
      pollLeaderboardScores.delete(pollId)
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
