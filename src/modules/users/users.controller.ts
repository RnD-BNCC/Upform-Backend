import type { Request, Response } from 'express'
import { USER_ROLES, type UserRole } from '@/config/roles.js'
import { isPermissionApprover } from '@/modules/users/users.service.js'
import type { AuthUser } from '@/middlewares/auth.js'
import { usersRepository } from '@/modules/users/users.repository.js'
import { normalizeInteger, normalizeString } from '@/utils/normalize.js'

const MANAGEABLE_ROLES = new Set<UserRole>([
  USER_ROLES.admin,
  USER_ROLES.activist,
  USER_ROLES.permissionApprover,
])

function getUser(res: Response) {
  return res.locals.user as AuthUser
}

export async function searchUsers(req: Request, res: Response) {
  const user = getUser(res)
  if (!(await isPermissionApprover(user.email, user.role))) {
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

export async function updateUserRole(
  req: Request<{ id: string }, unknown, { role?: string }>,
  res: Response,
) {
  const user = getUser(res)
  if (!(await isPermissionApprover(user.email, user.role))) {
    res.status(403).json({ error: 'Permission approver access required' })
    return
  }

  const role = req.body.role as UserRole | undefined
  if (!role || !MANAGEABLE_ROLES.has(role)) {
    res.status(400).json({ error: 'Invalid role' })
    return
  }

  const target = await usersRepository.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, name: true, image: true, role: true },
  })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const updatedUser = await usersRepository.update({
    where: { id: target.id },
    data: { role, updatedAt: new Date() },
    select: { id: true, email: true, name: true, image: true, role: true },
  })

  res.json(updatedUser)
}
