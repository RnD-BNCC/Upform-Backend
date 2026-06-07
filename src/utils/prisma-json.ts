import type { Prisma } from '../../generated/prisma/index.js'

export function toPrismaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
