import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'

let io: Server | null = null

type SocketGateway = (server: Server) => void

function getSocketServer() {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

export function initSocketServer(httpServer: HttpServer, gateways: SocketGateway[] = []) {
  io = new Server(httpServer, {
    cors: {
      methods: ['GET', 'POST'],
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    },
  })

  for (const gateway of gateways) gateway(io)

  return io
}

export function getIO() {
  return getSocketServer()
}

export function getRoomSize(room: string) {
  return getSocketServer().sockets.adapter.rooms.get(room)?.size ?? 0
}

export function emitToRoom(room: string, event: string, payload?: unknown) {
  getSocketServer().to(room).emit(event, payload)
}

export function emitToRoomExcept(socket: Socket, room: string, event: string, payload?: unknown) {
  socket.to(room).emit(event, payload)
}

export function joinRoom(socket: Socket, room: string) {
  socket.join(room)
}

export function leaveRoom(socket: Socket, room: string) {
  socket.leave(room)
}
