import { USER_ROLES, isActivistEmail, isPermissionApproverRole, normalizeEmail } from '@/config/roles.js'
import { usersRepository } from '@/modules/users/users.repository.js'

export async function getPermissionApproverEmails() {
  const users = await usersRepository.findMany({
    where: { role: USER_ROLES.permissionApprover },
    orderBy: { email: 'asc' },
    select: { email: true },
  })

  return users.map((user) => normalizeEmail(user.email)).filter(Boolean)
}

export async function isPermissionApprover(email?: string | null, role?: string | null) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || isActivistEmail(normalizedEmail)) return false
  if (isPermissionApproverRole(role)) return true

  const user = await usersRepository.findFirst({
    where: {
      email: normalizedEmail,
      role: USER_ROLES.permissionApprover,
    },
    select: { id: true },
  })

  return !!user
}
