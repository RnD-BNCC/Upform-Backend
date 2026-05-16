import type { Request, Response, NextFunction } from 'express'
import { auth, isEmailAllowed } from '../config/auth.js'
import { fromNodeHeaders } from 'better-auth/node'
import { prisma } from '../config/prisma.js'
import { getRoleForEmail, type UserRole } from '../config/roles.js'

export interface AuthUser {
  id: string
  name: string
  email: string
  image?: string | null
  role: UserRole
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

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  const role = (dbUser?.role as UserRole | undefined) ?? getRoleForEmail(session.user.email)

  res.locals.user = { ...session.user, role }
  next()
}
