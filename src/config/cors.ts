import type { CorsOptions } from 'cors'

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

export const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
}
