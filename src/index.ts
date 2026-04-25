import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './config/auth.js'
import { corsOptions } from './config/cors.js'
import { swaggerSpec } from './config/swagger.js'
import { initSocket } from './config/socket.js'
import eventRoutes from './routes/events.js'
import sectionRoutes from './routes/sections.js'
import responseRoutes from './routes/responses.js'
import responseProgressRoutes from './routes/response-progress.js'
import publicRoutes from './routes/public.js'
import pollRoutes from './routes/polls.js'
import pollSlideRoutes from './routes/poll-slides.js'
import publicPollRoutes from './routes/public-polls.js'
import questionRoutes from './routes/questions.js'
import uploadRoutes from './routes/upload/index.js'
import spreadsheetRoutes from './routes/spreadsheet.js'
import emailBlastRoutes from './routes/email-blasts.js'
import galleryRoutes from './routes/gallery.js'
import { requestLogger } from './middlewares/logger.js'
import { startEmailWorker } from './workers/email.worker.js'

const app = express()
const server = createServer(app)
const PORT = process.env.PORT ?? 3001

initSocket(server)
startEmailWorker()

app.use(cors(corsOptions))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)

app.all('/api/auth/{*splat}', toNodeHandler(auth))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use('/api/events', eventRoutes)
app.use('/api/events/:eventId/sections', sectionRoutes)
app.use('/api/events/:eventId/responses', responseRoutes)
app.use('/api/events/:eventId/response-progress', responseProgressRoutes)
app.use('/api/events/:eventId/spreadsheet', spreadsheetRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/polls/:pollId/questions', questionRoutes)
app.use('/api/polls', pollRoutes)
app.use('/api/polls/:pollId/slides', pollSlideRoutes)
app.use('/api/public/polls', publicPollRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/email-blasts', emailBlastRoutes)
app.use('/api/gallery', galleryRoutes)

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? 'development',
  })
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`)
})
