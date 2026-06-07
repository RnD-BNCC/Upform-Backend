import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const eventRepository = prisma.event
export const formAuditLogRepository = prisma.formAuditLog
export const responseProgressRepository = prisma.responseProgress
export const responseRepository = prisma.response
export const sectionRepository = prisma.section
export { unitOfWork }
