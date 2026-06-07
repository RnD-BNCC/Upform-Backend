import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '@/config/prisma.js'
import {
  getAllowedEmails,
  getRoleForEmail,
  isActivistEmail,
  USER_ROLES,
  normalizeEmail,
} from '@/config/roles.js'
import { isPermissionApprover } from '@/modules/users/users.service.js'

export async function isEmailAllowed(email?: string | null) {
  const allowed = getAllowedEmails()
  const normalizedEmail = normalizeEmail(email)
  if (isActivistEmail(normalizedEmail)) return true
  if (await isPermissionApprover(normalizedEmail)) return true
  if (allowed.length === 0) return true
  return !!normalizedEmail && allowed.includes(normalizedEmail)
}

export const auth = betterAuth({
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  plugins: [bearer()],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      role: {
        type: [USER_ROLES.admin, USER_ROLES.activist, USER_ROLES.permissionApprover],
        required: false,
        defaultValue: USER_ROLES.admin,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: getRoleForEmail(user.email),
          },
        }),
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      accessType: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
  },
  trustedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
})
