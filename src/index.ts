import express from 'express'
import cors from 'cors'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './config/auth.js'
import { corsOptions } from './config/cors.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors(corsOptions))


app.use(express.json())

app.use(
  express.urlencoded({ extended: true })
)

app.all('/api/auth/{*splat}', toNodeHandler(auth))

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
})
