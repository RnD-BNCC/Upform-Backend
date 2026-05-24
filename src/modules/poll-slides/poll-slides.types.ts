export type PollSlideParams = {
  pollId: string
  slideId: string
}

export type PollVoteParams = PollSlideParams & {
  voteId: string
}

export type CreatePollSlideBody = {
  type?: string
  question?: string
  options?: string[]
  settings?: Record<string, unknown>
}

export type UpdatePollSlideBody = {
  type?: string
  question?: string
  options?: string[]
  settings?: Record<string, unknown>
  locked?: boolean
}

export type ReorderPollSlidesBody = {
  order: string[]
}
