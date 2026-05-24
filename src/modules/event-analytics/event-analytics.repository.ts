import { prisma } from '@/config/prisma.js'

export const eventAnalyticsEventRepository = prisma.eventAnalyticsEvent
export const eventRepository = prisma.event
