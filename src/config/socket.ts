import type { Server as HttpServer } from 'http'
import {
  addScore as addPollScore,
  getPollScores as getPollGatewayScores,
  registerPollSocketGateway,
  resetScores as resetPollGatewayScores,
} from '@/modules/polls/poll-socket.gateway.js'
import { getIO, initSocketServer } from '@/services/socket.service.js'

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
  return initSocketServer(httpServer, [registerPollSocketGateway])
}

export { getIO }
