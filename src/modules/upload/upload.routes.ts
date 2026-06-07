import { Router } from 'express'
import imageRoutes from '@/modules/upload/upload-image.routes.js'
import fileRoutes from '@/modules/upload/upload-file.routes.js'

const router = Router()

// POST /api/upload - image upload (auth required, images only, 5MB)
router.use('/', imageRoutes)

// POST /api/upload/file - general file upload (no auth, any type, 1GB)
router.use('/file', fileRoutes)

export default router
