import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const pollRepository = prisma.poll
export const questionLikeRepository = prisma.questionLike
export const questionRepository = prisma.question
export { unitOfWork }
