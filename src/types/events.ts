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
  image?: string | null
  theme?: string
}

export type SaveBuilderSectionBody = {
  sectionId: string
  title?: string
  description?: string
  order?: number
  fields?: unknown[]
  settings?: Record<string, unknown>
  pageType?: string
  logicX?: number | null
  logicY?: number | null
}

export type SaveBuilderEventBody = {
  deletedSectionIds?: string[]
  event?: {
    name?: string
    color?: string
    image?: string | null
    theme?: string
  }
  sections?: SaveBuilderSectionBody[]
}
