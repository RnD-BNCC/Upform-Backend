import { eventRepository, permissionRequestRepository, pollRepository, unitOfWork } from '@/modules/permission-requests/permission-requests.repository.js'
import type { Request, Response } from 'express'
import { handleControllerError } from '@/utils/controller-error.js'
import type { AuthUser } from '@/middlewares/auth.js'
import {
  getPermissionApproverEmails,
  isPermissionApprover,
  USER_ROLES,
} from '@/config/roles.js'
import {
  SOFT_DELETE_TRANSACTION_OPTIONS,
  softDeleteEventById,
} from '@/modules/events/event-soft-delete.service.js'
import { hasApprovedPermission, type PermissionAction } from '@/middlewares/permission.js'
import { normalizeInteger } from '@/utils/normalize.js'

const VALID_ACTIONS = new Set([
  'responses.view',
  'responses.edit',
  'responses.delete',
  'forms.edit',
  'forms.delete',
  'forms.rollback',
  'polls.edit',
  'polls.delete',
  'polls.rollback',
])

function getUser(res: Response) {
  return res.locals.user as AuthUser
}

function assertPermissionApprover(user: AuthUser, res: Response) {
  if (isPermissionApprover(user.email)) return true

  res.status(403).json({ error: 'Only permission approvers can manage access' })
  return false
}

function getPermissionExpiry() {
  const minutes = Math.max(
    5,
    Number.parseInt(process.env.PERMISSION_APPROVAL_TTL_MINUTES ?? '60', 10) || 60,
  )
  return new Date(Date.now() + minutes * 60 * 1000)
}

function normalizeRequesterEmail(email?: string) {
  return email?.trim().toLowerCase() ?? ''
}

function isValidPermissionAction(action?: string): action is PermissionAction {
  return !!action && VALID_ACTIONS.has(action)
}

async function enrichPermissionRequests<
  T extends { resourceId: string; resourceType: string },
>(requests: T[]) {
  const eventIds = Array.from(
    new Set(
      requests
        .filter((request) =>
          ['event', 'form'].includes(request.resourceType.toLowerCase()),
        )
        .map((request) => request.resourceId),
    ),
  )
  const pollIds = Array.from(
    new Set(
      requests
        .filter((request) => request.resourceType.toLowerCase() === 'poll')
        .map((request) => request.resourceId),
    ),
  )

  const [events, polls] = await Promise.all([
    eventIds.length
      ? eventRepository.findMany({
          where: { id: { in: eventIds } },
          select: {
            id: true,
            name: true,
            status: true,
            stsrc: true,
          },
        })
      : [],
    pollIds.length
      ? pollRepository.findMany({
          where: { id: { in: pollIds } },
          select: {
            id: true,
            title: true,
            status: true,
            stsrc: true,
          },
        })
      : [],
  ])

  const eventById = new Map(events.map((event) => [event.id, event]))
  const pollById = new Map(polls.map((poll) => [poll.id, poll]))

  return requests.map((request) => {
    const resourceType = request.resourceType.toLowerCase()

    if (resourceType === 'event' || resourceType === 'form') {
      const event = eventById.get(request.resourceId)
      return {
        ...request,
        resourceKind: 'Form',
        resourceName: event?.name?.trim() || 'Untitled form',
        resourceStatus: event
          ? event.stsrc === 'D'
            ? 'deleted'
            : event.status
          : 'not found',
      }
    }

    if (resourceType === 'poll') {
      const poll = pollById.get(request.resourceId)
      return {
        ...request,
        resourceKind: 'Poll',
        resourceName: poll?.title?.trim() || 'Untitled poll',
        resourceStatus: poll
          ? poll.stsrc === 'D'
            ? 'deleted'
            : poll.status
          : 'not found',
      }
    }

    return {
      ...request,
      resourceKind: request.resourceType,
      resourceName: null,
      resourceStatus: null,
    }
  })
}

export async function listPermissionRequests(req: Request, res: Response) {
  try {
    const user = getUser(res)
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : undefined
    const isApprover = isPermissionApprover(user.email)

    if (!isApprover) {
      res.status(403).json({
        approver: false,
        error: 'Only permission approvers can view permission requests',
      })
      return
    }

    const requests = await permissionRequestRepository.findMany({
      where: {
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const data = (await enrichPermissionRequests(requests)).sort((a, b) => {
      const rankA = a.status === 'pending' ? 0 : 1
      const rankB = b.status === 'pending' ? 0 : 1
      if (rankA !== rankB) return rankA - rankB
      return b.createdAt.getTime() - a.createdAt.getTime()
    })

    res.json({
      approver: isApprover,
      approverEmails: isApprover ? getPermissionApproverEmails() : [],
      data,
    })
  } catch (error) {
    handleControllerError('Permission Requests', 'list failed', error, res)
  }
}

export async function listPermissionGrants(
  req: Request<
    object,
    unknown,
    object,
    {
      page?: string
      requesterEmail?: string
      resourceId?: string
      resourceType?: string
      status?: string
      take?: string
    }
  >,
  res: Response,
) {
  try {
    const user = getUser(res)
    if (!assertPermissionApprover(user, res)) return

    const resourceId =
      typeof req.query.resourceId === 'string' && req.query.resourceId.trim()
        ? req.query.resourceId.trim()
        : undefined
    const requesterEmail =
      typeof req.query.requesterEmail === 'string' && req.query.requesterEmail.trim()
        ? req.query.requesterEmail.trim().toLowerCase()
        : undefined
    const resourceType =
      typeof req.query.resourceType === 'string' && req.query.resourceType.trim()
        ? req.query.resourceType.trim()
        : undefined
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : undefined
    const page = normalizeInteger(req.query.page, 1, 1, 10_000)
    const take = normalizeInteger(req.query.take, 10, 1, 50)
    const resourceTypeFilter =
      resourceType === 'event' || resourceType === 'form'
        ? { in: ['event', 'form'] }
        : resourceType
    const where = {
      ...(requesterEmail ? { requesterEmail: { contains: requesterEmail, mode: 'insensitive' as const } } : {}),
      ...(resourceId ? { resourceId: { contains: resourceId, mode: 'insensitive' as const } } : {}),
      ...(resourceType ? { resourceType: resourceTypeFilter } : {}),
      ...(status ? { status } : { status: { in: ['approved', 'rejected'] } }),
    }

    const [total, grants] = await Promise.all([
      permissionRequestRepository.count({ where }),
      permissionRequestRepository.findMany({
        where,
        orderBy: [
          { requesterEmail: 'asc' },
          { resourceType: 'asc' },
          { resourceId: 'asc' },
          { updatedAt: 'desc' },
        ],
        skip: (page - 1) * take,
        take,
      }),
    ])

    const data = (await enrichPermissionRequests(grants)).sort((a, b) => {
      const rankA = a.status === 'approved' ? 0 : 1
      const rankB = b.status === 'approved' ? 0 : 1
      if (rankA !== rankB) return rankA - rankB
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })

    res.json({
      approver: true,
      approverEmails: getPermissionApproverEmails(),
      data,
      meta: {
        page,
        take,
        total,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    })
  } catch (error) {
    handleControllerError('Permission Grants', 'list failed', error, res)
  }
}

export async function createPermissionGrant(
  req: Request<
    object,
    unknown,
    {
      action?: string
      reason?: string
      requesterEmail?: string
      resourceId?: string
      resourceType?: string
    }
  >,
  res: Response,
) {
  try {
    const user = getUser(res)
    if (!assertPermissionApprover(user, res)) return

    const action = req.body.action?.trim()
    const requesterEmail = normalizeRequesterEmail(req.body.requesterEmail)
    const resourceId = req.body.resourceId?.trim()
    const resourceType = req.body.resourceType?.trim() || 'event'
    const reason = req.body.reason?.trim() || 'Granted manually by admin'

    if (!isValidPermissionAction(action) || !requesterEmail || !resourceId) {
      res.status(400).json({ error: 'Invalid permission grant' })
      return
    }

    const existing = await permissionRequestRepository.findFirst({
      where: {
        action,
        requesterEmail,
        resourceId,
        resourceType,
      },
      orderBy: { updatedAt: 'desc' },
    })

    const data = {
      action,
      approvedAt: new Date(),
      approvedBy: user.email.toLowerCase(),
      expiresAt: null,
      reason,
      rejectedAt: null,
      rejectedBy: null,
      requesterEmail,
      resourceId,
      resourceType,
      status: 'approved',
      usedAt: null,
    }

    const grant = existing
      ? await permissionRequestRepository.update({
          where: { id: existing.id },
          data,
        })
      : await permissionRequestRepository.create({
          data: {
            ...data,
            requesterId: null,
          },
        })

    const [enriched] = await enrichPermissionRequests([grant])
    res.status(existing ? 200 : 201).json(enriched)
  } catch (error) {
    handleControllerError('Permission Grants', 'create failed', error, res)
  }
}

export async function revokePermissionGrant(req: Request<{ id: string }>, res: Response) {
  try {
    const user = getUser(res)
    if (!assertPermissionApprover(user, res)) return

    const existing = await permissionRequestRepository.findUnique({
      where: { id: req.params.id },
    })

    if (!existing) {
      res.status(404).json({ error: 'Permission grant not found' })
      return
    }

    const grant = await permissionRequestRepository.update({
      where: { id: existing.id },
      data: {
        approvedAt: null,
        approvedBy: null,
        expiresAt: null,
        rejectedAt: new Date(),
        rejectedBy: user.email.toLowerCase(),
        status: 'rejected',
      },
    })

    const [enriched] = await enrichPermissionRequests([grant])
    res.json(enriched)
  } catch (error) {
    handleControllerError('Permission Grants', 'revoke failed', error, res)
  }
}

export async function reactivatePermissionGrant(req: Request<{ id: string }>, res: Response) {
  try {
    const user = getUser(res)
    if (!assertPermissionApprover(user, res)) return

    const existing = await permissionRequestRepository.findUnique({
      where: { id: req.params.id },
    })

    if (!existing) {
      res.status(404).json({ error: 'Permission grant not found' })
      return
    }

    const grant = await permissionRequestRepository.update({
      where: { id: existing.id },
      data: {
        approvedAt: new Date(),
        approvedBy: user.email.toLowerCase(),
        expiresAt: null,
        rejectedAt: null,
        rejectedBy: null,
        status: 'approved',
        usedAt: null,
      },
    })

    const [enriched] = await enrichPermissionRequests([grant])
    res.json(enriched)
  } catch (error) {
    handleControllerError('Permission Grants', 'reactivate failed', error, res)
  }
}

export async function createPermissionRequest(
  req: Request<
    object,
    unknown,
    { action?: string; reason?: string; resourceId?: string; resourceType?: string }
  >,
  res: Response,
) {
  try {
    const user = getUser(res)
    const action = req.body.action?.trim()
    const resourceId = req.body.resourceId?.trim()
    const resourceType = req.body.resourceType?.trim() || 'event'
    const reason = req.body.reason?.trim() || null

    if (!action || !VALID_ACTIONS.has(action) || !resourceId) {
      res.status(400).json({ error: 'Invalid permission request' })
      return
    }

    const existing = await permissionRequestRepository.findFirst({
      where: {
        action,
        requesterEmail: user.email.toLowerCase(),
        resourceId,
        resourceType,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      res.status(200).json(existing)
      return
    }

    const request = await permissionRequestRepository.create({
      data: {
        action,
        reason,
        requesterEmail: user.email.toLowerCase(),
        requesterId: user.id,
        resourceId,
        resourceType,
      },
    })

    res.status(201).json(request)
  } catch (error) {
    handleControllerError('Permission Requests', 'create failed', error, res)
  }
}

export async function getPermissionAccess(
  req: Request<
    object,
    unknown,
    object,
    { action?: string; resourceId?: string; resourceType?: string }
  >,
  res: Response,
) {
  try {
    const user = getUser(res)
    const action = req.query.action?.trim()
    const resourceId = req.query.resourceId?.trim()
    const resourceType = req.query.resourceType?.trim() || 'event'

    if (!action || !VALID_ACTIONS.has(action) || !resourceId) {
      res.status(400).json({ error: 'Invalid permission access check' })
      return
    }

    if (user.role !== USER_ROLES.activist || isPermissionApprover(user.email)) {
      res.json({ allowed: true, pending: false, request: null })
      return
    }

    const allowed = await hasApprovedPermission({
      action: action as PermissionAction,
      requesterEmail: user.email,
      resourceId,
      resourceType,
    })

    const pendingRequest = allowed
      ? null
      : await permissionRequestRepository.findFirst({
          where: {
            action,
            requesterEmail: user.email.toLowerCase(),
            resourceId,
            resourceType,
            status: 'pending',
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, id: true, status: true },
        })

    res.json({
      allowed,
      pending: !!pendingRequest,
      request: pendingRequest,
    })
  } catch (error) {
    handleControllerError('Permission Requests', 'access check failed', error, res)
  }
}

export async function approvePermissionRequest(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const user = getUser(res)
    if (!isPermissionApprover(user.email)) {
      res.status(403).json({ error: 'Only permission approvers can approve requests' })
      return
    }

    const existingRequest = await permissionRequestRepository.findUnique({
      where: { id: req.params.id },
    })

    if (!existingRequest) {
      res.status(404).json({ error: 'Permission request not found' })
      return
    }

    const now = new Date()
    const approverEmail = user.email.toLowerCase()
    const shouldExecuteDelete =
      existingRequest.action === 'forms.delete' &&
      ['event', 'form'].includes(existingRequest.resourceType.toLowerCase())

    const request = await unitOfWork.transaction(
      async (tx) => {
        let usedAt: Date | null = null

        if (shouldExecuteDelete) {
          const deleteResult = await softDeleteEventById(
            tx,
            existingRequest.resourceId,
            existingRequest.requesterEmail,
          )

          if (deleteResult === 'not-found') {
            throw new Error('TARGET_FORM_NOT_FOUND')
          }

          usedAt = now
        }

        return tx.permissionRequest.update({
          where: { id: existingRequest.id },
          data: {
            approvedAt: now,
            approvedBy: approverEmail,
            expiresAt: getPermissionExpiry(),
            rejectedAt: null,
            rejectedBy: null,
            status: 'approved',
            usedAt,
          },
        })
      },
      shouldExecuteDelete ? SOFT_DELETE_TRANSACTION_OPTIONS : undefined,
    )

    res.json(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'TARGET_FORM_NOT_FOUND') {
      res.status(404).json({ error: 'Target form not found' })
      return
    }

    handleControllerError('Permission Requests', 'approve failed', error, res)
  }
}

export async function rejectPermissionRequest(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const user = getUser(res)
    if (!isPermissionApprover(user.email)) {
      res.status(403).json({ error: 'Only permission approvers can reject requests' })
      return
    }

    const request = await permissionRequestRepository.update({
      where: { id: req.params.id },
      data: {
        approvedAt: null,
        approvedBy: null,
        expiresAt: null,
        rejectedAt: new Date(),
        rejectedBy: user.email.toLowerCase(),
        status: 'rejected',
      },
    })

    res.json(request)
  } catch (error) {
    handleControllerError('Permission Requests', 'reject failed', error, res)
  }
}
