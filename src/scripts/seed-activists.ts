import 'dotenv/config'
import { hashPassword } from 'better-auth/crypto'
import { prisma } from '../config/prisma.js'
import { ACTIVIST_EMAILS, USER_ROLES } from '../config/roles.js'

const DEFAULT_PASSWORD = process.env.ACTIVIST_DEFAULT_PASSWORD?.trim()
const MIN_PASSWORD_LENGTH = 12
const SHOULD_RESET_PASSWORD = process.argv.includes('--reset-password')

function randomPassword() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%+=?'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function main() {
  if (SHOULD_RESET_PASSWORD && !DEFAULT_PASSWORD) {
    throw new Error(
      'ACTIVIST_DEFAULT_PASSWORD is required when using --reset-password.',
    )
  }

  if (DEFAULT_PASSWORD && DEFAULT_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ACTIVIST_DEFAULT_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    )
  }

  const rows: Array<{
    email: string
    password: string
    status: string
  }> = []

  for (const email of ACTIVIST_EMAILS) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    })

    const now = new Date()

    if (existingUser) {
      let status =
        existingUser.role === USER_ROLES.activist ? 'skipped' : 'role updated'

      if (existingUser.role !== USER_ROLES.activist) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            role: USER_ROLES.activist,
            updatedAt: now,
          },
        })
      }

      if (SHOULD_RESET_PASSWORD && DEFAULT_PASSWORD) {
        const passwordHash = await hashPassword(DEFAULT_PASSWORD)
        const credentialAccount = await prisma.account.findFirst({
          where: { providerId: 'credential', userId: existingUser.id },
          select: { id: true },
        })

        if (credentialAccount) {
          await prisma.account.update({
            where: { id: credentialAccount.id },
            data: {
              password: passwordHash,
              updatedAt: now,
            },
          })
        } else {
          await prisma.account.create({
            data: {
              accountId: existingUser.id,
              createdAt: now,
              id: crypto.randomUUID(),
              password: passwordHash,
              providerId: 'credential',
              updatedAt: now,
              userId: existingUser.id,
            },
          })
        }

        status =
          existingUser.role === USER_ROLES.activist
            ? 'password reset'
            : 'role + password reset'
      }

      rows.push({
        email,
        password:
          SHOULD_RESET_PASSWORD && DEFAULT_PASSWORD
            ? DEFAULT_PASSWORD
            : '(unchanged)',
        status,
      })
      continue
    }

    const password = DEFAULT_PASSWORD || randomPassword()
    const user = await prisma.user.create({
      data: {
        createdAt: now,
        email,
        emailVerified: true,
        id: crypto.randomUUID(),
        name: email.split('@')[0].toUpperCase(),
        role: USER_ROLES.activist,
        updatedAt: now,
      },
    })

    const passwordHash = await hashPassword(password)
    await prisma.account.create({
      data: {
        accountId: user.id,
        createdAt: now,
        id: crypto.randomUUID(),
        password: passwordHash,
        providerId: 'credential',
        updatedAt: now,
        userId: user.id,
      },
    })

    rows.push({ email, password, status: 'created' })
  }

  if (!DEFAULT_PASSWORD) {
    console.info(
      'ACTIVIST_DEFAULT_PASSWORD is not set. New activist accounts will get one-time random passwords.',
    )
  }

  console.table(rows)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
