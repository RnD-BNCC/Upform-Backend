import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/controller-error.js'
import type { AuthUser } from '../middlewares/auth.js'
import {
  getPermissionApproverEmails,
  isPermissionApprover,
} from '../config/roles.js'
import {
  SOFT_DELETE_TRANSACTION_OPTIONS,
  softDeleteEventById,
} from '../services/event-soft-delete.js'

const VALID_ACTIONS = new Set([
  'responses.view',
  'responses.edit',
  'responses.delete',
  'forms.delete',
  'forms.rollback',
])

function getUser(res: Response) {
  return res.locals.user as AuthUser
}

function getPermissionExpiry() {
  const minutes = Math.max(
    5,
    Number.parseInt(process.env.PERMISSION_APPROVAL_TTL_MINUTES ?? '60', 10) || 60,
  )
  return new Date(Date.now() + minutes * 60 * 1000)
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
      ? prisma.event.findMany({
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
      ? prisma.poll.findMany({
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

    const requests = await prisma.permissionRequest.findMany({
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

    const existing = await prisma.permissionRequest.findFirst({
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

    const request = await prisma.permissionRequest.create({
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

    const existingRequest = await prisma.permissionRequest.findUnique({
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

    const request = await prisma.$transaction(
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

    const request = await prisma.permissionRequest.update({
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
