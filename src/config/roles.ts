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

export function getPermissionApproverEmails() {
  return (process.env.PERMISSION_APPROVER_EMAILS ?? '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter((email) => email.length > 0 && !isActivistEmail(email))
    .filter(Boolean)
}

export function isPermissionApprover(email?: string | null) {
  const normalizedEmail = normalizeEmail(email)
  return (
    normalizedEmail.length > 0 &&
    !isActivistEmail(normalizedEmail) &&
    getPermissionApproverEmails().includes(normalizedEmail)
  )
}
