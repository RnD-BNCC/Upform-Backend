import type { Socket } from 'socket.io'
import {
  emitToRoom,
  emitToRoomExcept,
  getRoomSize,
  joinRoom,
  leaveRoom,
} from '@/services/socket.service.js'

export type PollParticipant = {
  avatarSeed?: string
  id: string
  name: string
  score: number
}

export type PollSocketData = {
  participantId?: string
  pollId?: string
}

export type PollSocket = Socket & {
  data: PollSocketData
}

export type SocketAck<T = unknown> = (response: T) => void

export type PollSocketError = {
  code: string
  message: string
}

type JoinParticipantPayload = {
  avatarSeed?: string
  name: string
  participantId: string
  pollId: string
}

const POLL_ROOM_PREFIX = 'poll:'

const pollParticipants = new Map<string, Map<string, PollParticipant>>()
const pollLeaderboardActive = new Map<string, boolean>()
const pollLeaderboardScores = new Map<string, PollParticipant[]>()

export function getPollRoom(pollId: string) {
  return `${POLL_ROOM_PREFIX}${pollId}`
}

export function getPollIdFromRoom(room: string) {
  return room.startsWith(POLL_ROOM_PREFIX) ? room.slice(POLL_ROOM_PREFIX.length) : null
}

export function getPollId(payload: unknown) {
  if (typeof payload === 'string') return payload.trim()
  if (payload && typeof payload === 'object' && 'pollId' in payload) {
    const pollId = (payload as { pollId?: unknown }).pollId
    return typeof pollId === 'string' ? pollId.trim() : ''
  }
  return ''
}

export function emitSocketError(socket: PollSocket, error: PollSocketError, ack?: SocketAck) {
  socket.emit('poll:error', error)
  ack?.({ ok: false, error })
}

export function emitQuestionError(socket: PollSocket, code: string, message: string) {
  socket.emit('question:error', { code, message })
}

export function emitToPoll(pollId: string, event: string, payload?: unknown) {
  emitToRoom(getPollRoom(pollId), event, payload)
}

export function emitToPollExcept(socket: PollSocket, pollId: string, event: string, payload?: unknown) {
  emitToRoomExcept(socket, getPollRoom(pollId), event, payload)
}

export function emitParticipantCount(pollId: string, overrideCount?: number) {
  emitToPoll(pollId, 'participant-count', overrideCount ?? getRoomSize(getPollRoom(pollId)))
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

export function broadcastParticipantList(pollId: string) {
  emitToPoll(pollId, 'participant-list', getParticipantList(pollId))
}

export function joinPollGroup(socket: PollSocket, pollId: string) {
  const room = getPollRoom(pollId)
  joinRoom(socket, room)
  socket.data.pollId = pollId
  emitParticipantCount(pollId)

  const payload = {
    participantCount: getRoomSize(room),
    pollId,
    room,
  }
  socket.emit('poll:joined', payload)

  return payload
}

function removeParticipant(pollId: string, participantId: string) {
  const participants = pollParticipants.get(pollId)
  if (!participants) return

  participants.delete(participantId)
  if (participants.size === 0) {
    pollParticipants.delete(pollId)
  }
}

export function removeSocketParticipant(socket: PollSocket, pollId: string) {
  const participantId = socket.data.participantId
  if (!participantId) return

  removeParticipant(pollId, participantId)
  broadcastParticipantList(pollId)

  if (socket.data.pollId === pollId) {
    delete socket.data.pollId
    delete socket.data.participantId
  }
}

export function leavePollGroup(socket: PollSocket, pollId: string, nextCount?: number) {
  leaveRoom(socket, getPollRoom(pollId))
  removeSocketParticipant(socket, pollId)
  emitParticipantCount(pollId, nextCount)
}

export function upsertParticipant(socket: PollSocket, payload: JoinParticipantPayload) {
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
  joinRoom(socket, getPollRoom(payload.pollId))
  emitParticipantCount(payload.pollId)
  broadcastParticipantList(payload.pollId)
  socket.emit('participant:joined', {
    participantId: payload.participantId,
    pollId: payload.pollId,
  })
}

export function hydrateLeaderboard(socket: PollSocket, pollId: string) {
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

export function showLeaderboard(pollId: string) {
  const scores = getPollScores(pollId)
  pollLeaderboardActive.set(pollId, true)
  pollLeaderboardScores.set(pollId, scores)
  emitToPoll(pollId, 'show-leaderboard', { scores })
}

export function hideLeaderboard(pollId: string) {
  pollLeaderboardActive.delete(pollId)
  pollLeaderboardScores.delete(pollId)
  emitToPoll(pollId, 'hide-leaderboard')
}

export function resetLeaderboard(pollId: string) {
  pollLeaderboardActive.delete(pollId)
  pollLeaderboardScores.delete(pollId)
}
