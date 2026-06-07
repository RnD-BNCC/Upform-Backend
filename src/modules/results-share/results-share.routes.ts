import { Router } from 'express'
import {
  getResultShare,
  getSharedResults,
  updateResultShare,
} from '@/modules/results-share/results-share.controller.js'
import { requireAuth } from '@/middlewares/auth.js'
import { PERMISSION_ACTIONS, requirePermission } from '@/middlewares/permission.js'

const router = Router()

router.get('/share/:token', getSharedResults)

router.get(
  '/events/:eventId/share',
  requireAuth,
  requirePermission(PERMISSION_ACTIONS.editForm, (req) => ({
    resourceId: String(req.params.eventId),
  })),
  getResultShare,
)

router.patch(
  '/events/:eventId/share',
  requireAuth,
  requirePermission(PERMISSION_ACTIONS.editForm, (req) => ({
    resourceId: String(req.params.eventId),
  })),
  updateResultShare,
)

export default router
