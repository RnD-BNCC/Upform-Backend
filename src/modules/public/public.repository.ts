import { prisma } from '@/config/prisma.js'

export const eventRepository = prisma.event
export const responseProgressRepository = prisma.responseProgress
export const responseRepository = prisma.response
