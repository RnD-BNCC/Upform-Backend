import {
  eventRepository,
  responseProgressRepository,
  responseRepository,
} from '@/modules/responses/responses.repository.js'
import { syncEventFilesToConnectedDrive } from '@/modules/gallery/gallery-drive-sync.service.js'
import type { SubmitResponseBody } from '@/modules/response-progress/response-progress.types.js'
import { parseOptionalDate } from '@/utils/date.js'
import { sendSubmitConfirmationEmail } from '@/utils/submit-form-email.js'

const RESPONSE_STSRC = {
  available: 'A',
  deleted: 'D',
} as const

async function deleteMatchingProgress({
  eventId,
  progressId,
  respondentUuid,
}: {
  eventId: string
  progressId?: string | null
  respondentUuid?: string
}) {
  const deletedAt = new Date()

  if (progressId) {
    await responseProgressRepository.updateMany({
      where: { eventId, id: progressId, stsrc: { not: RESPONSE_STSRC.deleted } },
      data: { deletedAt, stsrc: RESPONSE_STSRC.deleted },
    })
    return
  }

  if (!respondentUuid) return

  await responseProgressRepository.updateMany({
    where: { eventId, respondentUuid, stsrc: { not: RESPONSE_STSRC.deleted } },
    data: { deletedAt, stsrc: RESPONSE_STSRC.deleted },
  })
}

export async function submitActiveEventResponse(eventId: string, body: SubmitResponseBody) {
  const event = await eventRepository.findFirst({
    where: { id: eventId, status: 'active', stsrc: { not: RESPONSE_STSRC.deleted } },
    include: { submitFormSetting: true },
  })
  if (!event) return null

  const response = await responseRepository.create({
    data: {
      answers: body.answers ?? {},
      completedAt: new Date(),
      currentSectionId: body.currentSectionId ?? null,
      currentSectionIndex: body.currentSectionIndex,
      deviceType: body.deviceType,
      eventId,
      progressPercent: body.progressPercent ?? 100,
      respondentUuid: body.respondentUuid,
      sectionHistory: body.sectionHistory ?? [],
      startedAt: parseOptionalDate(body.startedAt),
      stsrc: RESPONSE_STSRC.available,
      userAgent: body.userAgent,
    },
  })

  await deleteMatchingProgress({
    eventId,
    progressId: body.progressId,
    respondentUuid: body.respondentUuid,
  })

  return { event, response }
}

type SubmittedResponseResult = NonNullable<Awaited<ReturnType<typeof submitActiveEventResponse>>>

export function enqueueResponseSubmissionSideEffects({
  event,
  logScope,
  response,
}: {
  event: SubmittedResponseResult['event']
  logScope: string
  response: SubmittedResponseResult['response']
}) {
  sendSubmitConfirmationEmail(event, response).catch((error) =>
    console.error(`[${logScope}] submit confirmation email failed:`, error),
  )
  syncEventFilesToConnectedDrive(response.eventId, response.id).catch((error) =>
    console.error(`[${logScope}] gallery drive sync failed:`, error),
  )
}
