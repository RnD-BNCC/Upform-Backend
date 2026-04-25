import { Router } from 'express'
import {
  deleteGalleryFile,
  listGalleryFiles,
  listGalleryMedia,
} from '../controllers/gallery.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

/**
 * @swagger
 * /api/gallery/files:
 *   get:
 *     summary: List file-upload responses grouped by event
 *     tags: [Gallery]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated events containing file-upload responses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalFiles:
 *                   type: integer
 *                   description: Total number of uploaded files across all events
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [draft, active, closed]
 *                       fileCount:
 *                         type: integer
 *                       responses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               format: uuid
 *                             submittedAt:
 *                               type: string
 *                               format: date-time
 *                             respondentLabel:
 *                               type: string
 *                               description: First text-field answer or "Anonymous"
 *                             files:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   fieldId:
 *                                     type: string
 *                                   fieldLabel:
 *                                     type: string
 *                                   url:
 *                                     type: string
 *                                     format: uri
 *                                   filename:
 *                                     type: string
 *                 meta:
 *                   $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/files', listGalleryFiles)

/**
 * @swagger
 * /api/gallery/media:
 *   get:
 *     summary: List all uploaded images directly from the S3 slides/ prefix
 *     tags: [Gallery]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 21
 *     responses:
 *       200:
 *         description: Paginated media items sorted by last modified (newest first)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GalleryMediaItem'
 *                 meta:
 *                   $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/media', listGalleryMedia)

/**
 * @swagger
 * /api/gallery/file:
 *   delete:
 *     summary: Delete a file from S3 by its URL
 *     tags: [Gallery]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: Full S3 URL of the file to delete
 *                 example: https://s3.bncc.net/bucket/slides/550e8400-e29b-41d4-a716-446655440000.png
 *     responses:
 *       200:
 *         description: Deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing URL or URL does not belong to this bucket
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
router.delete('/file', deleteGalleryFile)

export default router
