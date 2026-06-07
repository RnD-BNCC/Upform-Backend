import { Router } from 'express'
import {
  approvePermissionRequest,
  createPermissionGrant,
  createPermissionRequest,
  listPermissionGrants,
  reactivatePermissionGrant,
  revokePermissionGrant,
  getPermissionAccess,
  listPermissionRequests,
  rejectPermissionRequest,
} from '@/modules/permission-requests/permission-requests.controller.js'
import { requireAuth } from '@/middlewares/auth.js'

const router = Router()

router.use(requireAuth)
router.get('/access', getPermissionAccess)
router.get('/grants', listPermissionGrants)
router.post('/grants', createPermissionGrant)
router.post('/grants/:id/reactivate', reactivatePermissionGrant)
router.post('/grants/:id/revoke', revokePermissionGrant)
router.get('/', listPermissionRequests)
router.post('/', createPermissionRequest)
router.post('/:id/approve', approvePermissionRequest)
router.post('/:id/reject', rejectPermissionRequest)

export default router
