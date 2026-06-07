import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '@/config/auth.js'
import { corsOptions } from '@/config/cors.js'
import { swaggerSpec } from '@/config/swagger.js'
import { initSocket } from '@/config/socket.js'
import eventRoutes from '@/modules/events/events.routes.js'
import sectionRoutes from '@/modules/sections/sections.routes.js'
import responseRoutes from '@/modules/responses/responses.routes.js'
import responseProgressRoutes from '@/modules/response-progress/response-progress.routes.js'
import eventAnalyticsRoutes from '@/modules/event-analytics/event-analytics.routes.js'
import publicRoutes from '@/modules/public/public.routes.js'
import pollRoutes from '@/modules/polls/polls.routes.js'
import pollSlideRoutes from '@/modules/poll-slides/poll-slides.routes.js'
import publicPollRoutes from '@/modules/public-polls/public-polls.routes.js'
import questionRoutes from '@/modules/questions/questions.routes.js'
import uploadRoutes from '@/modules/upload/upload.routes.js'
import emailBlastRoutes from '@/modules/email-blasts/email-blasts.routes.js'
import galleryRoutes from '@/modules/gallery/gallery.routes.js'
import resultsShareRoutes from '@/modules/results-share/results-share.routes.js'
import permissionRequestRoutes from '@/modules/permission-requests/permission-requests.routes.js'
import userRoutes from '@/modules/users/users.routes.js'
import { requestLogger } from '@/middlewares/logger.js'
import { startEmailWorker } from '@/workers/email.worker.js'

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
app.use('/api/events/:eventId/analytics', eventAnalyticsRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/polls/:pollId/questions', questionRoutes)
app.use('/api/polls', pollRoutes)
app.use('/api/polls/:pollId/slides', pollSlideRoutes)
app.use('/api/public/polls', publicPollRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/email-blasts', emailBlastRoutes)
app.use('/api/gallery', galleryRoutes)
app.use('/api/results', resultsShareRoutes)
app.use('/api/permission-requests', permissionRequestRoutes)
app.use('/api/users', userRoutes)

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
