export type ResponseParams = {
  eventId: string
  responseId: string
}

export type UpdateResponseBody = {
  answers?: Record<string, string | string[]>
}
