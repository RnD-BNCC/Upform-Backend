import { eventRepository, responseProgressRepository } from '@/modules/public/public.repository.js'
import type { Request, Response } from 'express'
import { handleControllerError } from '@/utils/controller-error.js'
import { withActiveEventSections } from '@/utils/form-fields.js'
import { buildResponseProgressData } from '@/modules/response-progress/response-progress.mapper.js'
import {
  enqueueResponseSubmissionSideEffects,
  submitActiveEventResponse,
} from '@/modules/responses/response-submission.service.js'
import type {
  SaveResponseProgressBody,
  SubmitResponseBody,
  ResponseProgressParams,
} from '@/modules/response-progress/response-progress.types.js'

const RECORD_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const

type PublicEventParams = {
  id: string
}

type PublicProgressParams = PublicEventParams & {
  progressId: string
}

export async function getPublicEvent(req: Request<PublicEventParams>, res: Response) {
  try {
    const event = await eventRepository.findFirst({
      where: { id: req.params.id, status: 'active', stsrc: { not: 'D' } },
      include: {
        sections: { orderBy: { order: 'asc' } },
      },
    })

    if (!event) {
      res.status(404).json({ error: 'Form not found or not accepting responses' })
      return
    }

    res.json(withActiveEventSections(event))
  } catch (error) {
    handleControllerError('Public', 'get public event failed', error, res)
  }
}

export async function submitPublicResponse(
  req: Request<PublicEventParams, unknown, SubmitResponseBody>,
  res: Response,
) {
  try {
    const result = await submitActiveEventResponse(req.params.id, req.body)
    if (!result) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    res.status(201).json(result.response)
    enqueueResponseSubmissionSideEffects({ ...result, logScope: 'Public' })
  } catch (error) {
    handleControllerError('Public', 'submit public response failed', error, res)
  }
}

export async function savePublicResponseProgress(
  req: Request<PublicEventParams, unknown, SaveResponseProgressBody>,
  res: Response,
) {
  try {
    const event = await eventRepository.findFirst({
      where: { id: req.params.id, status: 'active', stsrc: { not: 'D' } },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const progressData = buildResponseProgressData(req.body)
    const existing = progressData.respondentUuid
      ? await responseProgressRepository.findFirst({
          where: {
            eventId: req.params.id,
            respondentUuid: progressData.respondentUuid,
            stsrc: { not: RECORD_STSRC.deleted },
          },
        })
      : null

    const progress = existing
      ? await responseProgressRepository.update({
          where: { id: existing.id },
          data: { ...progressData, stsrc: RECORD_STSRC.updated },
        })
      : await responseProgressRepository.create({
          data: {
            ...progressData,
            eventId: req.params.id,
            stsrc: RECORD_STSRC.available,
          },
        })

    res.status(existing ? 200 : 201).json(progress)
  } catch (error) {
    handleControllerError('Public', 'save public response progress failed', error, res)
  }
}

export async function updatePublicResponseProgress(
  req: Request<PublicProgressParams, unknown, SaveResponseProgressBody>,
  res: Response,
) {
  try {
    const event = await eventRepository.findFirst({
      where: { id: req.params.id, status: 'active', stsrc: { not: 'D' } },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const existing = await responseProgressRepository.findFirst({
      where: {
        id: req.params.progressId,
        eventId: req.params.id,
        stsrc: { not: RECORD_STSRC.deleted },
      },
    })
    if (!existing) {
      res.status(404).json({ error: 'Response progress not found' })
      return
    }

    const progress = await responseProgressRepository.update({
      where: { id: existing.id },
      data: { ...buildResponseProgressData(req.body), stsrc: RECORD_STSRC.updated },
    })

    res.json(progress)
  } catch (error) {
    handleControllerError('Public', 'update public response progress failed', error, res)
  }
}

export async function deletePublicResponseProgress(
  req: Request<PublicProgressParams>,
  res: Response,
) {
  try {
    await responseProgressRepository.updateMany({
      where: {
        id: req.params.progressId,
        eventId: req.params.id,
        stsrc: { not: RECORD_STSRC.deleted },
      },
      data: { deletedAt: new Date(), stsrc: RECORD_STSRC.deleted },
    })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Public', 'delete public response progress failed', error, res)
  }
}
