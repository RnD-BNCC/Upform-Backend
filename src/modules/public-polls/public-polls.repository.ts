import { prisma } from '@/config/prisma.js'

export const pollRepository = prisma.poll
export const pollSlideRepository = prisma.pollSlide
export const pollVoteRepository = prisma.pollVote
