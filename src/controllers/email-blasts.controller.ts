import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { emailQueue } from '../queues/email.queue.js'
import { handleControllerError } from '../utils/controller-error.js'
import type {
  EmailBlastParams,
  EmailDraftParams,
  EmailDraftBody,
  CreateEmailBlastBody,
  SubmitFormSettingsBody,
} from '../types/email-blasts.js'

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

function normalizeBlocks(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeSubmitFormSettingsBody(body: SubmitFormSettingsBody) {
  return {
    blocks: normalizeBlocks(body.blocks),
    body: normalizeString(body.body),
    emailThemeValue:
      typeof body.emailThemeValue === 'string' && body.emailThemeValue.trim()
        ? body.emailThemeValue
        : null,
    enabled: body.enabled === true,
    raffleEnabled: body.raffleEnabled !== false,
    rafflePadding: normalizeInteger(body.rafflePadding, 4, 1, 10),
    rafflePrefix: normalizeString(body.rafflePrefix),
    raffleStart: normalizeInteger(body.raffleStart, 1, 0, 999999999),
    raffleSuffix: normalizeString(body.raffleSuffix),
    recipientFieldId: normalizeString(body.recipientFieldId),
    subject: normalizeString(body.subject),
  }
}

export async function getEmailComposerDraft(
  req: Request<EmailDraftParams>,
  res: Response,
) {
  try {
    const { eventId } = req.params

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const draft = await prisma.emailComposerDraft.findUnique({
      where: { eventId },
    })

    res.json(draft)
  } catch (error) {
    handleControllerError('Email Blasts', 'get email composer draft failed', error, res)
  }
}

export async function saveEmailComposerDraft(
  req: Request<EmailDraftParams, unknown, EmailDraftBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const body = req.body

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const emailStyle =
      body.emailStyle === 'basic' || body.emailStyle === 'formatted'
        ? body.emailStyle
        : 'formatted'
    const recipientMode = body.recipientMode === 'field' ? 'field' : 'manual'
    const blocks = Array.isArray(body.blocks) ? body.blocks : []

    const draft = await prisma.emailComposerDraft.upsert({
      where: { eventId },
      create: {
        blocks,
        emailStyle,
        emailThemeValue: body.emailThemeValue ?? null,
        eventId,
        excludedRecipients: normalizeStringArray(body.excludedRecipients),
        manualRecipients: normalizeStringArray(body.manualRecipients),
        recipientMode,
        selectedEmailFieldIds: normalizeStringArray(body.selectedEmailFieldIds),
        subject: body.subject ?? '',
      },
      update: {
        blocks,
        emailStyle,
        emailThemeValue: body.emailThemeValue ?? null,
        excludedRecipients: normalizeStringArray(body.excludedRecipients),
        manualRecipients: normalizeStringArray(body.manualRecipients),
        recipientMode,
        selectedEmailFieldIds: normalizeStringArray(body.selectedEmailFieldIds),
        subject: body.subject ?? '',
      },
    })

    res.json(draft)
  } catch (error) {
    handleControllerError('Email Blasts', 'save email composer draft failed', error, res)
  }
}

export async function getSubmitFormSettings(
  req: Request<EmailDraftParams>,
  res: Response,
) {
  try {
    const { eventId } = req.params

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const settings = await prisma.submitFormSetting.findUnique({
      where: { eventId },
    })

    res.json(settings)
  } catch (error) {
    handleControllerError('Email Blasts', 'get submit form settings failed', error, res)
  }
}

export async function saveSubmitFormSettings(
  req: Request<EmailDraftParams, unknown, SubmitFormSettingsBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })

    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const data = normalizeSubmitFormSettingsBody(req.body)
    const settings = await prisma.submitFormSetting.upsert({
      where: { eventId },
      create: {
        ...data,
        eventId,
      },
      update: data,
    })

    res.json(settings)
  } catch (error) {
    handleControllerError('Email Blasts', 'save submit form settings failed', error, res)
  }
}

export async function createEmailBlast(
  req: Request<object, unknown, CreateEmailBlastBody>,
  res: Response,
) {
  try {
    const { eventId, subject, html, recipients } = req.body

    if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'subject, html, and recipients are required' })
      return
    }

    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      })

      if (!event) {
        res.status(404).json({ error: 'Event not found' })
        return
      }
    }

    const unique = [
      ...new Set(
        recipients
          .map((recipient) => recipient.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]

    if (unique.length === 0) {
      res.status(400).json({ error: 'At least one recipient is required' })
      return
    }

    const blast = await prisma.$transaction(async (tx) => {
      const created = await tx.emailBlast.create({
        data: {
          eventId: eventId || null,
          subject,
          html,
          recipients: unique,
          totalCount: unique.length,
        },
      })

      await tx.emailLog.createMany({
        data: unique.map((recipient) => ({
          blastId: created.id,
          recipient,
          status: 'queued',
        })),
        skipDuplicates: true,
      })

      return created
    })

    const jobs = unique.map((recipient) => ({
      name: `send:${recipient}`,
      data: { blastId: blast.id, recipient, subject, html },
    }))

    await emailQueue.addBulk(jobs)

    res.status(201).json(blast)
  } catch (error) {
    handleControllerError('Email Blasts', 'create email blast failed', error, res)
  }
}

export async function listEmailBlasts(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const take = Math.min(100, Math.max(1, parseInt(req.query.take as string) || 20))
    const skip = (page - 1) * take
    const eventId =
      typeof req.query.eventId === 'string' && req.query.eventId.trim()
        ? req.query.eventId.trim()
        : undefined
    const where = eventId ? { eventId } : undefined

    const [blasts, total] = await Promise.all([
      prisma.emailBlast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          eventId: true,
          subject: true,
          status: true,
          sentCount: true,
          failedCount: true,
          totalCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.emailBlast.count({ where }),
    ])

    res.json({ data: blasts, meta: { page, take, total, totalPages: Math.ceil(total / take) } })
  } catch (error) {
    handleControllerError('Email Blasts', 'list email blasts failed', error, res)
  }
}

export async function getEmailBlast(req: Request<EmailBlastParams>, res: Response) {
  try {
    const blast = await prisma.emailBlast.findUnique({
      where: { id: req.params.id },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!blast) {
      res.status(404).json({ error: 'Blast not found' })
      return
    }

    res.json(blast)
  } catch (error) {
    handleControllerError('Email Blasts', 'get email blast failed', error, res)
  }
}

export async function deleteEmailBlast(req: Request<EmailBlastParams>, res: Response) {
  try {
    const blast = await prisma.emailBlast.findUnique({ where: { id: req.params.id } })

    if (!blast) {
      res.status(404).json({ error: 'Blast not found' })
      return
    }

    const waiting = await emailQueue.getWaiting()
    const delayed = await emailQueue.getDelayed()
    const toRemove = [...waiting, ...delayed].filter((job) => job.data.blastId === blast.id)
    await Promise.all(toRemove.map((job) => job.remove()))

    await prisma.emailBlast.update({
      where: { id: blast.id },
      data: { status: 'cancelled' },
    })

    res.status(204).send()
  } catch (error) {
    handleControllerError('Email Blasts', 'delete email blast failed', error, res)
  }
}
