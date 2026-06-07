type FieldStsrc = 'A' | 'U' | 'D'

type FormFieldRecord = Record<string, unknown> & {
  id?: string
  label?: string
  stsrc?: FieldStsrc
  type?: string
}

const FIELD_STSRC = {
  available: 'A',
  updated: 'U',
  deleted: 'D',
} as const satisfies Record<string, FieldStsrc>

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFormFieldRecord(value: unknown): value is FormFieldRecord {
  return isObjectRecord(value)
}

function isFieldStsrc(value: unknown): value is FieldStsrc {
  return (
    value === FIELD_STSRC.available ||
    value === FIELD_STSRC.updated ||
    value === FIELD_STSRC.deleted
  )
}

function normalizeFieldStsrc(value: unknown): FieldStsrc {
  return isFieldStsrc(value) ? value : FIELD_STSRC.available
}

function isDeletedFormField(field: FormFieldRecord) {
  return normalizeFieldStsrc(field.stsrc) === FIELD_STSRC.deleted
}

export function getActiveFormFields(fields: unknown): FormFieldRecord[] {
  if (!Array.isArray(fields)) return []

  return fields
    .filter(isFormFieldRecord)
    .filter((field) => !isDeletedFormField(field))
}

function getClientFormFields(fields: unknown): FormFieldRecord[] {
  return getActiveFormFields(fields).map(withoutStsrc)
}

function getFieldId(field: FormFieldRecord) {
  return typeof field.id === 'string' && field.id.trim() ? field.id : null
}

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (!isObjectRecord(value)) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((normalized, key) => {
      const normalizedValue = normalizeJsonValue(value[key])
      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue
      }
      return normalized
    }, {})
}

function withoutStsrc(field: FormFieldRecord) {
  const { stsrc: _stsrc, ...fieldWithoutStsrc } = field
  return fieldWithoutStsrc
}

function hasFieldChanged(field: FormFieldRecord, existingField: FormFieldRecord) {
  return (
    JSON.stringify(normalizeJsonValue(withoutStsrc(field))) !==
    JSON.stringify(normalizeJsonValue(withoutStsrc(existingField)))
  )
}

function normalizeFieldForStorage(
  field: FormFieldRecord,
  existingField?: FormFieldRecord,
): FormFieldRecord {
  if (!existingField) {
    return {
      ...field,
      stsrc: FIELD_STSRC.available,
    }
  }

  const existingStsrc = normalizeFieldStsrc(existingField.stsrc)
  if (field.stsrc === FIELD_STSRC.deleted) {
    return {
      ...field,
      stsrc: FIELD_STSRC.deleted,
    }
  }

  if (existingStsrc === FIELD_STSRC.deleted && !isFieldStsrc(field.stsrc)) {
    return {
      ...field,
      stsrc: FIELD_STSRC.deleted,
    }
  }

  if (
    existingStsrc === FIELD_STSRC.updated ||
    hasFieldChanged(field, existingField)
  ) {
    return {
      ...field,
      stsrc: FIELD_STSRC.updated,
    }
  }

  return {
    ...field,
    stsrc: FIELD_STSRC.available,
  }
}

export function normalizeFieldsForStorage(
  fields: unknown[],
  existingFieldsValue: unknown,
): FormFieldRecord[] {
  const existingFields = Array.isArray(existingFieldsValue)
    ? existingFieldsValue.filter(isFormFieldRecord)
    : []
  const existingById = new Map(
    existingFields
      .map((field) => {
        const id = getFieldId(field)
        return id ? ([id, field] as const) : null
      })
      .filter((entry): entry is readonly [string, FormFieldRecord] => Boolean(entry)),
  )
  const nextIds = new Set<string>()
  const normalizedFields = fields.filter(isFormFieldRecord).map((field) => {
    const id = getFieldId(field)
    if (id) nextIds.add(id)
    return normalizeFieldForStorage(field, id ? existingById.get(id) : undefined)
  })

  const softDeletedFields = existingFields
    .filter((field) => {
      const id = getFieldId(field)
      return id && !nextIds.has(id)
    })
    .map((field) => ({
      ...field,
      stsrc: FIELD_STSRC.deleted,
    }))

  return [...normalizedFields, ...softDeletedFields]
}

export function withActiveSectionFields<T extends { fields: unknown }>(section: T): T {
  return {
    ...section,
    fields: getClientFormFields(section.fields),
  }
}

export function withActiveEventSections<T extends { sections: Array<{ fields: unknown }> }>(
  event: T,
): T {
  return {
    ...event,
    sections: event.sections.map((section) => withActiveSectionFields(section)),
  }
}
