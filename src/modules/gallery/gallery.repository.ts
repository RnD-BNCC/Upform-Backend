import { prisma } from '@/config/prisma.js'

export const accountRepository = prisma.account
export const eventRepository = prisma.event
export const galleryDriveConnectionRepository = prisma.galleryDriveConnection
export const galleryShareRepository = prisma.galleryShare
export const responseRepository = prisma.response
export const userRepository = prisma.user
