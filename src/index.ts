import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './config/auth.js'
import { corsOptions } from './config/cors.js'
import { swaggerSpec } from './config/swagger.js'
import eventRoutes from './routes/events.js'
import sectionRoutes from './routes/sections.js'
import responseRoutes from './routes/responses.js'
import publicRoutes from './routes/public.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors(corsOptions))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.all('/api/auth/{*splat}', toNodeHandler(auth))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use('/api/events', eventRoutes)
app.use('/api/events/:eventId/sections', sectionRoutes)
app.use('/api/events/:eventId/responses', responseRoutes)
app.use('/api/public', publicRoutes)

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? 'development',
  })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`)
})
