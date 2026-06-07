export const ACTIVIST_EMAILS = [
  'prbncc@upform.id',
  'eeobncc@upform.id',
  'rndbncc@upform.id',
  'hrdbncc@upform.id',
  'lntbncc@upform.id',
] as const

export const USER_ROLES = {
  admin: 'admin',
  activist: 'activist',
  permissionApprover: 'permission_approver',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? ''
}

export function isActivistEmail(email?: string | null) {
  return ACTIVIST_EMAILS.includes(normalizeEmail(email) as (typeof ACTIVIST_EMAILS)[number])
}

export function getRoleForEmail(email?: string | null): UserRole {
  return isActivistEmail(email) ? USER_ROLES.activist : USER_ROLES.admin
}

export function isPermissionApproverRole(role?: string | null) {
  return role === USER_ROLES.permissionApprover
}
