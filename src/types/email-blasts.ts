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

export type SubmitFormSettingsBody = {
  blocks?: unknown
  body?: string
  emailThemeValue?: string | null
  enabled?: boolean
  raffleEnabled?: boolean
  rafflePadding?: number
  rafflePrefix?: string
  raffleStart?: number
  raffleSuffix?: string
  recipientFieldId?: string
  subject?: string
}
