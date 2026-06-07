import type { SaveResponseProgressBody } from '@/modules/response-progress/response-progress.types.js'
import { parseOptionalDate } from '@/utils/date.js'

export function buildResponseProgressData(body: SaveResponseProgressBody) {
  return {
    answers: body.answers ?? {},
    currentSectionId: body.currentSectionId ?? null,
    currentSectionIndex: body.currentSectionIndex,
    deviceType: body.deviceType,
    otherTexts: body.otherTexts ?? {},
    progressPercent: body.progressPercent,
    respondentUuid: body.respondentUuid,
    sectionHistory: body.sectionHistory ?? [],
    startedAt: parseOptionalDate(body.startedAt),
    userAgent: body.userAgent,
  }
}
