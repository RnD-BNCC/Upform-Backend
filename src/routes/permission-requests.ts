import { Router } from 'express'
import {
  approvePermissionRequest,
  createPermissionRequest,
  getPermissionAccess,
  listPermissionRequests,
  rejectPermissionRequest,
} from '../controllers/permission-requests.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.use(requireAuth)
router.get('/access', getPermissionAccess)
router.get('/', listPermissionRequests)
router.post('/', createPermissionRequest)
router.post('/:id/approve', approvePermissionRequest)
router.post('/:id/reject', rejectPermissionRequest)

export default router
