import type { Server as HttpServer } from 'http'
import {
  addScore as addPollScore,
  getPollScores as getPollGatewayScores,
  registerPollSocketGateway,
  resetScores as resetPollGatewayScores,
} from '@/modules/polls/poll-socket.gateway.js'
import { Server } from 'socket.io'

let io: Server | null = null

function getSocketServer() {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

export function addScore(pollId: string, participantId: string, points: number) {
  addPollScore(pollId, participantId, points)
}

export function getPollScores(pollId: string) {
  return getPollGatewayScores(pollId)
}

export function resetScores(pollId: string) {
  resetPollGatewayScores(pollId)
}

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      methods: ['GET', 'POST'],
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    },
  })

  registerPollSocketGateway(io)

  return io
}

export function getIO(): Server {
  return getSocketServer()
}
