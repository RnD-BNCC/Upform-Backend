import { Router } from 'express'
import { requireAuth } from '@/middlewares/auth.js'
import { searchUsers } from '@/modules/users/users.controller.js'

const router = Router()

router.use(requireAuth)
router.get('/search', searchUsers)

export default router
