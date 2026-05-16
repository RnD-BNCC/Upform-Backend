import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/index.js'
import { getActiveFormFields, normalizeFieldsForStorage } from './form-fields.js'

type SectionCloneSource = {
  description: string
  fields: unknown
  id: string
  logicX: number | null
  logicY: number | null
  order: number
  pageType: string
  settings: unknown
  title: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function remapSectionIds(value: unknown, sectionIdMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return sectionIdMap.get(value) ?? value
  }

  if (Array.isArray(value)) {
    return value.map((item) => remapSectionIds(item, sectionIdMap))
  }

  if (!isObjectRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      remapSectionIds(item, sectionIdMap),
    ]),
  )
}

export function buildDuplicatedSections(sections: SectionCloneSource[]) {
  const orderedSections = [...sections].sort((left, right) => left.order - right.order)
  const sectionIdMap = new Map(orderedSections.map((section) => [section.id, randomUUID()]))

  return orderedSections.map((section, index) => {
    const fields = remapSectionIds(getActiveFormFields(section.fields), sectionIdMap)
    const settings = remapSectionIds(section.settings, sectionIdMap)

    return {
      description: section.description,
      fields: normalizeFieldsForStorage(
        Array.isArray(fields) ? fields : [],
        [],
      ) as Prisma.InputJsonValue,
      id: sectionIdMap.get(section.id),
      logicX: section.logicX,
      logicY: section.logicY,
      order: index,
      pageType: section.pageType,
      settings: (isObjectRecord(settings) ? settings : {}) as Prisma.InputJsonValue,
      title: section.title,
    }
  })
}
