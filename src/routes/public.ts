import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router()

/**
 * @swagger
 * /api/public/events/{id}:
 *   get:
 *     summary: Get a public event for form filling (active events only, no auth)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public event detail with sections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Form not found or not accepting responses
 */
router.get('/events/:id', async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: 'active' },
    include: {
      sections: { orderBy: { order: 'asc' } },
    },
  })

  if (!event) {
    res.status(404).json({ error: 'Form not found or not accepting responses' })
    return
  }

  const { userId, ...publicEvent } = event
  res.json(publicEvent)
})

export default router
