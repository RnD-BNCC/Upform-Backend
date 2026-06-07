import { Router } from 'express'
import { requireAuth } from '@/middlewares/auth.js'
import { searchUsers, updateUserRole } from '@/modules/users/users.controller.js'

const router = Router()

router.use(requireAuth)
router.get('/search', searchUsers)
router.patch('/:id/role', updateUserRole)

export default router
