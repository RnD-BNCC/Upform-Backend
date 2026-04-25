import { Router } from 'express'
import { imageUpload, uploadImage } from '../../controllers/upload.controller.js'
import { requireAuth } from '../../middlewares/auth.js'

const router = Router()

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload an image (auth required, max 5 MB)
 *     tags: [Upload]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file — png, jpg, gif, svg, webp, avif, heic, heif — max 5 MB
 *     responses:
 *       200:
 *         description: Upload successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   example: https://s3.bncc.net/bucket/slides/550e8400-e29b-41d4-a716-446655440000.png
 *       400:
 *         description: No file provided or unsupported file type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, imageUpload.single('file'), uploadImage)

export default router
