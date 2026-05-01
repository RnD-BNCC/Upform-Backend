import { Router } from 'express'
import { fileUpload, uploadFile } from '../../controllers/upload.controller.js'

const router = Router()

/**
 * @swagger
 * /api/upload/file:
 *   post:
 *     summary: Upload any file (no auth required, max 1 GB)
 *     tags: [Upload]
 *     security: []
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
 *                 description: Any file type, max 1 GB
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
 *                   example: https://s3.bncc.net/bucket/files/550e8400-e29b-41d4-a716-446655440000.pdf
 *                 filename:
 *                   type: string
 *                   example: report.pdf
 *       400:
 *         description: No file provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', fileUpload.single('file'), uploadFile)

export default router
