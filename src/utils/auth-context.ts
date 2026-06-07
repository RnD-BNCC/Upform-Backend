import type { AuthUser } from '@/middlewares/auth.js'
import type { Response } from 'express'

export function getAuthEmail(res: Response) {
  return (res.locals.user as AuthUser | undefined)?.email ?? null
}
