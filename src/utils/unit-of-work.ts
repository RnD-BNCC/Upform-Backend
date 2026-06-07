import type { Prisma } from '../../generated/prisma/index.js'
import { prisma } from '@/config/prisma.js'

const transaction = prisma.$transaction.bind(prisma) as typeof prisma.$transaction

export const unitOfWork = {
  transaction,
  transactionClient: prisma as unknown as Prisma.TransactionClient,
}
