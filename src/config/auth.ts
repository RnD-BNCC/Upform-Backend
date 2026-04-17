import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { bearer } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

const getAllowedEmails = () =>
  (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export const auth = betterAuth({
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  plugins: [bearer()],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      accessType: "offline",
      prompt: "select_account consent",
      scope: [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    },
  },
  trustedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const allowed = getAllowedEmails()
          if (allowed.length === 0) return { data: session }
          const user = await prisma.user.findUnique({ where: { id: session.userId } })
          if (!allowed.includes(user?.email ?? '')) {
            throw new APIError('FORBIDDEN', { message: 'Unauthorized email' })
          }
          return { data: session }
        },
      },
    },
  },
})
