import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const pollRepository = prisma.poll
export const pollAuditLogRepository = prisma.pollAuditLog
export const pollSlideRepository = prisma.pollSlide
export const pollVoteRepository = prisma.pollVote
export const questionRepository = prisma.question
export const questionLikeRepository = prisma.questionLike
export { unitOfWork }
