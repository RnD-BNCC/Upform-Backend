export type SaveResponseProgressBody = {
  answers?: Record<string, string | string[]>
  currentSectionId?: string | null
  currentSectionIndex?: number
  deviceType?: string
  otherTexts?: Record<string, string>
  progressPercent?: number
  respondentUuid?: string
  sectionHistory?: number[]
  startedAt?: string
  userAgent?: string
}

export type SubmitResponseBody = SaveResponseProgressBody & {
  progressId?: string | null
}

export type ResponseProgressParams = {
  eventId: string
  progressId: string
}
