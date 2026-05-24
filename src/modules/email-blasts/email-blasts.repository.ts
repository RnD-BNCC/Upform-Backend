import { prisma } from '@/config/prisma.js'
import { unitOfWork } from '@/utils/unit-of-work.js'

export const emailBlastRepository = prisma.emailBlast
export const emailComposerDraftRepository = prisma.emailComposerDraft
export const emailLogRepository = prisma.emailLog
export const eventRepository = prisma.event
export const submitFormSettingRepository = prisma.submitFormSetting
export { unitOfWork }
