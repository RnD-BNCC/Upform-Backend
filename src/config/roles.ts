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

export function getAllowedEmails() {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
}

export function isActivistEmail(email?: string | null) {
  return ACTIVIST_EMAILS.includes(normalizeEmail(email) as (typeof ACTIVIST_EMAILS)[number])
}

export function isAllowedEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email)
  return !!normalizedEmail && getAllowedEmails().includes(normalizedEmail)
}

export function getRoleForEmail(email?: string | null): UserRole {
  if (isActivistEmail(email)) return USER_ROLES.activist
  if (isAllowedEmail(email)) return USER_ROLES.permissionApprover
  return USER_ROLES.admin
}

export function isPermissionApproverRole(role?: string | null) {
  return role === USER_ROLES.permissionApprover
}
