export type SectionParams = {
  eventId: string
  sectionId: string
}

export type CreateSectionBody = {
  title?: string
  description?: string
  pageType?: string
}

export type UpdateSectionBody = {
  title?: string
  description?: string
  order?: number
  fields?: unknown[]
  settings?: Record<string, unknown>
  pageType?: string
  logicX?: number
  logicY?: number
}

export type ReorderSectionsBody = {
  order: string[]
}
