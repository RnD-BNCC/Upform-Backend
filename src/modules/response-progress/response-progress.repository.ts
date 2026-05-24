import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const eventRepository = prisma.event
export const responseProgressRepository = prisma.responseProgress
export { unitOfWork }
