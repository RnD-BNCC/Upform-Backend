import type { Response } from 'express'

export function handleControllerError(
  scope: string,
  action: string,
  error: unknown,
  res: Response,
) {
  console.error(`[${scope}] ${action}:`, error)

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' })
  }
}
