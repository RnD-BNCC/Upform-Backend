import type { Request, Response, NextFunction } from 'express'
import { auth, isEmailAllowed } from '../config/auth.js'
import { fromNodeHeaders } from 'better-auth/node'

export interface AuthUser {
  id: string
  name: string
  email: string
  image?: string | null
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })

  if (!session?.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!isEmailAllowed(session.user.email)) {
    res.status(403).json({ error: 'Unauthorized email' })
    return
  }

  res.locals.user = session.user
  next()
}
