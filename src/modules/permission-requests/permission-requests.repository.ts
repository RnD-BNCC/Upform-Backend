import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const eventRepository = prisma.event
export const permissionRequestRepository = prisma.permissionRequest
export const pollRepository = prisma.poll
export { unitOfWork }
