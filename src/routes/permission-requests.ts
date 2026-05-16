import { Router } from 'express'
import {
  approvePermissionRequest,
  createPermissionRequest,
  listPermissionRequests,
  rejectPermissionRequest,
} from '../controllers/permission-requests.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.use(requireAuth)
router.get('/', listPermissionRequests)
router.post('/', createPermissionRequest)
router.post('/:id/approve', approvePermissionRequest)
router.post('/:id/reject', rejectPermissionRequest)

export default router

