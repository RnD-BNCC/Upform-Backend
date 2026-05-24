import type { Request, Response } from 'express'
import { isPermissionApprover } from '@/config/roles.js'
import type { AuthUser } from '@/middlewares/auth.js'
import { usersRepository } from '@/modules/users/users.repository.js'
import { normalizeInteger, normalizeString } from '@/utils/normalize.js'

function getUser(res: Response) {
  return res.locals.user as AuthUser
}

export async function searchUsers(req: Request, res: Response) {
  const user = getUser(res)
  if (!isPermissionApprover(user.email)) {
    res.status(403).json({ error: 'Permission approver access required' })
    return
  }

  const q = normalizeString(req.query.q).trim()
  const take = normalizeInteger(req.query.take, 20, 1, 50)
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  const users = await usersRepository.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { email: 'asc' }],
    take,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
    },
  })

  res.json({ data: users })
}
