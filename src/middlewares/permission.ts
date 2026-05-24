import { permissionRequestRepository } from '@/modules/permission-requests/permission-requests.repository.js'
import type { NextFunction, Request, Response } from 'express'
import type { AuthUser } from '@/middlewares/auth.js'
import { isPermissionApprover, USER_ROLES } from '@/config/roles.js'

export const PERMISSION_ACTIONS = {
  viewResponses: 'responses.view',
  editResponse: 'responses.edit',
  deleteResponse: 'responses.delete',
  editForm: 'forms.edit',
  deleteForm: 'forms.delete',
  rollbackForm: 'forms.rollback',
  editPoll: 'polls.edit',
  deletePoll: 'polls.delete',
  rollbackPoll: 'polls.rollback',
  viewGallery: 'gallery.view',
  manageGallery: 'gallery.manage',
  deleteGalleryFile: 'gallery.delete',
} as const

export type PermissionAction =
  (typeof PERMISSION_ACTIONS)[keyof typeof PERMISSION_ACTIONS]

function getRequestUser(res: Response) {
  return res.locals.user as AuthUser | undefined
}

function getExpiryThreshold() {
  return new Date()
}

export async function hasApprovedPermission({
  action,
  requesterEmail,
  resourceId,
  resourceType,
}: {
  action: PermissionAction
  requesterEmail: string
  resourceId: string
  resourceType: string
}) {
  const now = getExpiryThreshold()
  const request = await permissionRequestRepository.findFirst({
    where: {
      action,
      requesterEmail: requesterEmail.toLowerCase(),
      resourceId,
      resourceType,
      status: 'approved',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { approvedAt: 'desc' },
  })

  return !!request
}

export function requirePermission(
  action: PermissionAction,
  getResource: (req: Request) => { resourceId: string; resourceType?: string },
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getRequestUser(res)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (user.role !== USER_ROLES.activist || isPermissionApprover(user.email)) {
      next()
      return
    }

    const { resourceId, resourceType = 'event' } = getResource(req)
    const allowed = await hasApprovedPermission({
      action,
      requesterEmail: user.email,
      resourceId,
      resourceType,
    })

    if (allowed) {
      next()
      return
    }

    const existingRequest = await permissionRequestRepository.findFirst({
      where: {
        action,
        requesterEmail: user.email.toLowerCase(),
        resourceId,
        resourceType,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, status: true },
    })

    res.status(403).json({
      code: 'PERMISSION_REQUIRED',
      error: 'Permission approval required',
      action,
      resourceId,
      resourceType,
      request: existingRequest,
    })
  }
}
