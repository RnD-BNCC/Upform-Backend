export type PollParams = {
  id: string
}

export type CreatePollBody = {
  title?: string
}

export type UpdatePollBody = {
  title?: string
  status?: string
  currentSlide?: number
  settings?: Record<string, unknown>
}
