import { mailer, SMTP_FROM } from '../config/mailer.js'
import { prisma } from '../config/prisma.js'

type SubmitFormSetting = {
  body: string
  enabled: boolean
  raffleEnabled: boolean
  rafflePadding: number
  rafflePrefix: string
  raffleStart: number
  raffleSuffix: string
  recipientFieldId: string
  subject: string
}

type SubmitEmailEvent = {
  id: string
  name: string
  submitFormSetting?: SubmitFormSetting | null
}

type SubmitEmailResponse = {
  answers: unknown
  eventId: string
  submittedAt: Date
}

const DEFAULT_SUBMIT_EMAIL_BODY =
  'Hi there,<br /><br />Thank you for submitting {{form_title}}.<br /><br />Your lottery number is {{raffle_number}}.'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getAnswersRecord(answers: unknown): Record<string, unknown> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {}
  return answers as Record<string, unknown>
}

function getAnswerStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap((item) => getAnswerStrings(item))
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }
  return []
}

function getRecipientEmail(answers: unknown, fieldId: string) {
  const answer = getAnswersRecord(answers)[fieldId]
  const candidates = getAnswerStrings(answer)
    .flatMap((item) => item.split(/[,\s]+/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  return candidates.find((candidate) => EMAIL_PATTERN.test(candidate)) ?? null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, '').trim()
}

function formatRaffleNumber(settings: SubmitFormSetting, submittedCount: number) {
  if (!settings.raffleEnabled) return ''

  const start = Math.max(0, Math.round(settings.raffleStart) || 0)
  const padding = Math.max(1, Math.min(10, Math.round(settings.rafflePadding) || 1))
  const number = String(start + Math.max(0, submittedCount - 1)).padStart(padding, '0')
  return `${settings.rafflePrefix}${number}${settings.raffleSuffix}`
}

function renderTemplate(template: string, tokens: Record<string, string>) {
  return template.replace(/{{\s*(form_title|raffle_number|submitted_at)\s*}}/g, (_, key) =>
    escapeHtml(tokens[key] ?? ''),
  )
}

export async function sendSubmitConfirmationEmail(
  event: SubmitEmailEvent,
  response: SubmitEmailResponse,
) {
  const settings = event.submitFormSetting
  if (!settings?.enabled || !settings.recipientFieldId) return

  const recipient = getRecipientEmail(response.answers, settings.recipientFieldId)
  if (!recipient) return

  const submittedCount = await prisma.response.count({
    where: { eventId: response.eventId, deletedAt: null },
  })
  const raffleNumber = formatRaffleNumber(settings, submittedCount)
  const submittedAt = response.submittedAt.toISOString()
  const tokens = {
    form_title: event.name || 'Form',
    raffle_number: raffleNumber,
    submitted_at: submittedAt,
  }

  const subjectTemplate = settings.subject || `Submission received: ${event.name || 'Form'}`
  const bodyTemplate = settings.body || DEFAULT_SUBMIT_EMAIL_BODY
  const subject = stripHtml(renderTemplate(subjectTemplate, tokens)) || 'Submission received'
  const html = renderTemplate(bodyTemplate, tokens)

  await mailer.sendMail({
    from: SMTP_FROM,
    html,
    subject,
    to: recipient,
  })
}
