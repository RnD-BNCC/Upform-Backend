import { permissionRequestRepository } from '@/modules/permission-requests/permission-requests.repository.js'
import type { NextFunction, Request, Response } from 'express'
import type { AuthUser } from '@/middlewares/auth.js'
import { prisma } from '@/config/prisma.js'
import { isEmailAllowed } from '@/config/auth.js'
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

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? ''
}

function normalizeResourceType(resourceType: string) {
  return resourceType.trim().toLowerCase()
}

function isPublicResourceVisibility(value?: string | null) {
  return value?.trim().toLowerCase() === 'public'
}

function normalizeShareRole(value?: string | null) {
  return value?.trim().toLowerCase() === 'editor' ? 'editor' : 'viewer'
}

async function getResultShareRole(eventId: string, requesterEmail: string) {
  const share = await prisma.eventResultShare.findUnique({
    where: { eventId },
    select: {
      publicRole: true,
      visibility: true,
      members: {
        where: { email: normalizeEmail(requesterEmail) },
        select: { role: true },
        take: 1,
      },
    },
  })

  if (!share) return null
  if (isEmailAllowed(requesterEmail)) return 'editor'
  if (share.visibility === 'private') return null
  if (share.visibility === 'public') return normalizeShareRole(share.publicRole)

  const member = share.members[0]
  return member ? normalizeShareRole(member.role) : null
}

async function hasResultShareAccess({
  action,
  requesterEmail,
  resourceId,
}: {
  action: PermissionAction
  requesterEmail: string
  resourceId: string
}) {
  if (
    action !== PERMISSION_ACTIONS.viewResponses &&
    action !== PERMISSION_ACTIONS.editResponse &&
    action !== PERMISSION_ACTIONS.deleteResponse
  ) {
    return false
  }

  const role = await getResultShareRole(resourceId, requesterEmail)
  if (!role) return false
  if (action === PERMISSION_ACTIONS.viewResponses) return true
  return role === 'editor'
}

async function hasDirectResourceAccess({
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
  const normalizedEmail = normalizeEmail(requesterEmail)
  const normalizedType = normalizeResourceType(resourceType)

  if (!normalizedEmail || !resourceId) return false

  if (['event', 'form', 'gallery'].includes(normalizedType)) {
    const event = await prisma.event.findFirst({
      where: { id: resourceId, stsrc: { not: 'D' } },
      select: { createdBy: true, visibility: true },
    })
    if (!event) return false

    const isOwner = normalizeEmail(event.createdBy) === normalizedEmail
    if (isOwner) return true

    const resultShareAccess = await hasResultShareAccess({
      action,
      requesterEmail,
      resourceId,
    })
    if (resultShareAccess) return true

    if (normalizedType === 'gallery') {
      return (
        action === PERMISSION_ACTIONS.viewGallery &&
        isPublicResourceVisibility(event.visibility)
      )
    }

    return isPublicResourceVisibility(event.visibility)
  }

  if (normalizedType === 'poll') {
    const poll = await prisma.poll.findFirst({
      where: { id: resourceId, stsrc: { not: 'D' } },
      select: { createdBy: true, visibility: true },
    })
    if (!poll) return false

    return (
      normalizeEmail(poll.createdBy) === normalizedEmail ||
      isPublicResourceVisibility(poll.visibility)
    )
  }

  return false
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

export async function hasResourcePermission({
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
  const directAccess = await hasDirectResourceAccess({
    action,
    requesterEmail,
    resourceId,
    resourceType,
  })

  if (directAccess) return true

  return hasApprovedPermission({
    action,
    requesterEmail,
    resourceId,
    resourceType,
  })
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
    const allowed = await hasResourcePermission({
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
