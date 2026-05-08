import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

export const getAllowedEmails = () =>
  (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

export function isEmailAllowed(email?: string | null) {
  const allowed = getAllowedEmails()
  if (allowed.length === 0) return true
  return !!email && allowed.includes(email.trim().toLowerCase())
}

export const auth = betterAuth({
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  plugins: [bearer()],
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
