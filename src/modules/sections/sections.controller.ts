import { eventRepository, sectionRepository, unitOfWork } from '@/modules/sections/sections.repository.js'
import type { Request, Response } from 'express'
import type { Prisma } from '../../../generated/prisma/index.js'
import { handleControllerError } from '@/utils/controller-error.js'
import { normalizeFieldsForStorage, withActiveSectionFields } from '@/utils/form-fields.js'
import type {
  SectionParams,
  CreateSectionBody,
  UpdateSectionBody,
  ReorderSectionsBody,
} from '@/modules/sections/sections.types.js'

async function findEvent(eventId: string) {
  return eventRepository.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
}

export async function listSections(req: Request<Pick<SectionParams, 'eventId'>>, res: Response) {
  try {
    const { eventId } = req.params

    const event = await findEvent(eventId)
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const sections = await sectionRepository.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    })

    res.json(sections.map((section) => withActiveSectionFields(section)))
  } catch (error) {
    handleControllerError('Sections', 'list sections failed', error, res)
  }
}

export async function createSection(
  req: Request<Pick<SectionParams, 'eventId'>, unknown, CreateSectionBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const { title, description, pageType } = req.body

    const event = await findEvent(eventId)
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const maxOrder = await sectionRepository.aggregate({
      where: { eventId },
      _max: { order: true },
    })

    const section = await sectionRepository.create({
      data: {
        title: title ?? '',
        description: description ?? '',
        order: (maxOrder._max.order ?? -1) + 1,
        fields: [],
        pageType: pageType ?? 'page',
        eventId,
      },
    })

    res.status(201).json(withActiveSectionFields(section))
  } catch (error) {
    handleControllerError('Sections', 'create section failed', error, res)
  }
}

export async function updateSection(
  req: Request<SectionParams, unknown, UpdateSectionBody>,
  res: Response,
) {
  try {
    const { eventId, sectionId } = req.params
    const { title, description, order, fields, pageType, settings, logicX, logicY } = req.body

    const event = await findEvent(eventId)
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await sectionRepository.findFirst({
      where: { id: sectionId, eventId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Section not found' })
      return
    }

    const section = await sectionRepository.update({
      where: { id: sectionId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
        ...(fields !== undefined && {
          fields: normalizeFieldsForStorage(fields, existing.fields) as Prisma.InputJsonValue,
        }),
        ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
        ...(pageType !== undefined && { pageType }),
        ...(logicX !== undefined && { logicX }),
        ...(logicY !== undefined && { logicY }),
      },
    })

    res.json(withActiveSectionFields(section))
  } catch (error) {
    handleControllerError('Sections', 'update section failed', error, res)
  }
}

export async function reorderSections(
  req: Request<Pick<SectionParams, 'eventId'>, unknown, ReorderSectionsBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const { order } = req.body

    const event = await findEvent(eventId)
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    await unitOfWork.transaction(
      order.map((id, index) =>
        sectionRepository.update({ where: { id }, data: { order: index } }),
      ),
    )

    const sections = await sectionRepository.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    })

    res.json(sections.map((section) => withActiveSectionFields(section)))
  } catch (error) {
    handleControllerError('Sections', 'reorder sections failed', error, res)
  }
}

export async function deleteSection(req: Request<SectionParams>, res: Response) {
  try {
    const { eventId, sectionId } = req.params

    const event = await findEvent(eventId)
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const existing = await sectionRepository.findFirst({
      where: { id: sectionId, eventId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Section not found' })
      return
    }

    await sectionRepository.delete({ where: { id: sectionId } })
    res.status(204).send()
  } catch (error) {
    handleControllerError('Sections', 'delete section failed', error, res)
  }
}
