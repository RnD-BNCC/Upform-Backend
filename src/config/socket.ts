import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'

let io: Server | null = null

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    socket.on('join-poll', (pollId: string) => {
      socket.join(`poll:${pollId}`)
      const room = io!.sockets.adapter.rooms.get(`poll:${pollId}`)
      io!.to(`poll:${pollId}`).emit('participant-count', room?.size ?? 0)
    })

    socket.on('leave-poll', (pollId: string) => {
      socket.leave(`poll:${pollId}`)
      const room = io!.sockets.adapter.rooms.get(`poll:${pollId}`)
      io!.to(`poll:${pollId}`).emit('participant-count', room?.size ?? 0)
    })

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('poll:')) {
          const pollId = room.replace('poll:', '')
          socket.to(room).emit('participant-count',
            (io!.sockets.adapter.rooms.get(room)?.size ?? 1) - 1
          )
          void pollId
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
