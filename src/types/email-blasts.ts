export type EmailBlastParams = {
  id: string
}

export type EmailDraftParams = {
  eventId: string
}

export type EmailDraftBody = {
  blocks?: unknown
  emailStyle?: string
  emailThemeValue?: string | null
  excludedRecipients?: string[]
  manualRecipients?: string[]
  recipientMode?: string
  selectedEmailFieldIds?: string[]
  subject?: string
}

export type CreateEmailBlastBody = {
  eventId?: string
  subject?: string
  html?: string
  recipients?: string[]
}
