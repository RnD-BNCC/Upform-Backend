import type { CorsOptions } from 'cors'

export const corsOptions: CorsOptions = {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}
