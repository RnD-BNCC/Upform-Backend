export function normalizeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function normalizeStringArray(value: unknown) {
  return normalizeArray(value).filter((item): item is string => typeof item === 'string')
}

export function normalizeBlocks(value: unknown) {
  return normalizeArray(value)
}

export function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}
