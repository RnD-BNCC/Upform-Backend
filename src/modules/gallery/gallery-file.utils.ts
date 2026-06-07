import type { FileEntry, FormField } from '@/modules/gallery/gallery.types.js'

const TEXT_FIELD_TYPES = new Set([
  'email',
  'name',
  'paragraph',
  'short_answer',
  'short_text',
  'text',
])

export function extractGalleryFiles(value: unknown, fieldId: string, fieldLabel: string): FileEntry[] {
  if (!value) return []
  const fieldName = fieldLabel?.trim() || 'Untitled upload'

  const toEntry = (item: unknown): FileEntry | null => {
    if (typeof item === 'string' && item.includes('::')) {
      const separatorIndex = item.indexOf('::')
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename: item.slice(0, separatorIndex),
        url: item.slice(separatorIndex + 2),
      }
    }

    if (typeof item === 'string' && item.startsWith('http')) {
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename: decodeURIComponent(item.split('/').pop() ?? ''),
        url: item,
      }
    }

    if (typeof item === 'object' && item !== null && 'url' in item) {
      const file = item as Record<string, unknown>
      const url = String(file.url)
      return {
        fieldId,
        fieldLabel: fieldName,
        fieldName,
        filename:
          typeof file.filename === 'string'
            ? file.filename
            : decodeURIComponent(url.split('/').pop() ?? ''),
        url,
      }
    }

    return null
  }

  if (Array.isArray(value)) {
    return value.map(toEntry).filter(Boolean) as FileEntry[]
  }

  const entry = toEntry(value)
  return entry ? [entry] : []
}

export function extractRespondentLabel(
  answers: Record<string, unknown>,
  fields: FormField[],
) {
  for (const field of fields) {
    if (!TEXT_FIELD_TYPES.has(field.type)) continue
    const value = answers[field.id]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return 'Anonymous'
}
