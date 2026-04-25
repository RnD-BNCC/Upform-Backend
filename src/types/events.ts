export type EventParams = {
  id: string
}

export type CreateEventBody = {
  name?: string
  color?: string
  theme?: string
}

export type UpdateEventBody = {
  name?: string
  status?: string
  color?: string
  image?: string
  theme?: string
}
