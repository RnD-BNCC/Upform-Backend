import { eventRepository, eventAnalyticsEventRepository } from '@/modules/event-analytics/event-analytics.repository.js'
import type { Request, Response } from 'express'
import type { Prisma } from '../../../generated/prisma/index.js'
import { handleControllerError } from '@/utils/controller-error.js'
import PDFDocument from 'pdfkit'

type AnalyticsEventType = 'view' | 'start' | 'section_view' | 'finish'

type AnalyticsEventBody = {
  answers?: Record<string, string | string[]>
  currentSectionId?: string | null
  currentSectionIndex?: number
  deviceType?: string
  progressPercent?: number
  respondentUuid?: string
  sectionHistory?: number[]
  sessionUuid?: string
  type?: AnalyticsEventType
  userAgent?: string
}

type EventParams = {
  eventId: string
}

type AnalyticsReportBody = {
  conditionCount?: number
  dateRangeLabel?: string
  deviceRows?: Array<{ count: number; label: string }>
  formTitle?: string
  metrics?: Array<{ label: string; value: string }>
  pageDropOffs?: Array<{
    dropOffs: number
    label: string
    submissions: number
    views: number
  }>
  submissionsByDay?: Array<{ day: string; submissions: number }>
}

type PublicEventParams = {
  id: string
}

function getAnalyticsData(eventId: string, body: AnalyticsEventBody) {
  return {
    answers: (body.answers ?? {}) as Prisma.InputJsonValue,
    deviceType: body.deviceType,
    eventId,
    progressPercent: body.progressPercent,
    respondentUuid: body.respondentUuid,
    sectionHistory: (body.sectionHistory ?? []) as Prisma.InputJsonValue,
    sectionId: body.currentSectionId ?? null,
    sectionIndex: body.currentSectionIndex,
    sessionUuid: body.sessionUuid,
    type: body.type ?? 'view',
    userAgent: body.userAgent,
  }
}

export async function listEventAnalytics(req: Request<EventParams>, res: Response) {
  try {
    const { eventId } = req.params

    const event = await eventRepository.findFirst({ where: { id: eventId, stsrc: { not: 'D' } } })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const analyticsEvents = await eventAnalyticsEventRepository.findMany({
      where: { eventId },
      orderBy: { occurredAt: 'asc' },
    })

    res.json(analyticsEvents)
  } catch (error) {
    handleControllerError('EventAnalytics', 'list analytics events failed', error, res)
  }
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'analytics-report'
}

function asNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function formatReportDate(value = new Date()) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  if (doc.y + neededHeight <= doc.page.height - doc.page.margins.bottom) return
  doc.addPage()
}

const REPORT_COLORS = ['#0f5ea8', '#f2bf3d', '#10b981', '#ef476f']

function drawMetricCards(
  doc: PDFKit.PDFDocument,
  metrics: Array<{ label: string; value: string }>,
) {
  const startX = doc.page.margins.left
  const gap = 12
  const width = (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap * 3) / 4
  const y = doc.y

  metrics.slice(0, 4).forEach((metric, index) => {
    const x = startX + index * (width + gap)
    const color = REPORT_COLORS[index % REPORT_COLORS.length]
    doc
      .roundedRect(x, y, width, 78, 10)
      .fillAndStroke('#f8fafc', '#e5e7eb')
    doc.roundedRect(x, y, 5, 78, 10).fill(color)
    doc
      .fillColor('#6b7280')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(metric.label.toUpperCase(), x + 16, y + 14, {
        width: width - 26,
      })
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(23)
      .text(metric.value, x + 16, y + 38, { width: width - 26 })
  })

  doc.y = y + 98
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  ensureSpace(doc, 44)
  const x = doc.page.margins.left
  doc.x = x
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(title, x, doc.y)
  if (subtitle) {
    doc
      .moveDown(0.2)
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(9)
      .text(subtitle, x, doc.y, { width: 280 })
  }
  doc.moveDown(0.8)
}

function drawReportHeader(
  doc: PDFKit.PDFDocument,
  formTitle: string,
  dateRangeLabel: string,
  conditionCount?: number,
) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right

  doc.rect(0, 0, doc.page.width, 8).fill('#0f5ea8')
  doc
    .fillColor('#0f5ea8')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('UPFORM', left, 28, { characterSpacing: 1.5 })
  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(25)
    .text(`${formTitle} Analytics Report`, left, 46, {
      lineGap: 2,
      width: 480,
    })
  doc
    .fillColor('#64748b')
    .font('Helvetica')
    .fontSize(9)
    .text(`Generated ${formatReportDate()}`, right - 210, 35, {
      align: 'right',
      width: 210,
    })
    .text(`Date range: ${dateRangeLabel}`, right - 210, 50, {
      align: 'right',
      width: 210,
    })
  if (conditionCount) {
    doc.text(`Filtered by ${conditionCount} condition${conditionCount === 1 ? '' : 's'}`, right - 210, 65, {
      align: 'right',
      width: 210,
    })
  }

  doc
    .moveTo(left, 92)
    .lineTo(right, 92)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke()
  doc.y = 116
}

function drawLineChart(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<{ day: string; submissions: number }>,
) {
  ensureSpace(doc, 238)
  drawSectionTitle(doc, title, 'Completed submissions over the selected date range.')

  const x = doc.page.margins.left
  const y = doc.y
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const height = 158
  const max = Math.max(...rows.map((row) => asNumber(row.submissions)), 1)
  const plotX = x + 44
  const plotY = y + 18
  const plotWidth = width - 70
  const plotHeight = height - 54

  doc.roundedRect(x, y, width, height, 10).fillAndStroke('#ffffff', '#e5e7eb')
  doc.strokeColor('#edf2f7').lineWidth(1)
  ;[0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const lineY = plotY + plotHeight * ratio
    doc.moveTo(plotX, lineY).lineTo(plotX + plotWidth, lineY).stroke()
  })

  const points = rows.map((row, index) => {
    const pointX =
      rows.length === 1
        ? plotX + plotWidth / 2
        : plotX + (plotWidth / (rows.length - 1)) * index
    const pointY = plotY + plotHeight - (asNumber(row.submissions) / max) * plotHeight
    return { ...row, x: pointX, y: pointY }
  })

  if (points.length > 1) {
    doc.save()
    doc.moveTo(points[0].x, plotY + plotHeight)
    points.forEach((point) => doc.lineTo(point.x, point.y))
    doc.lineTo(points[points.length - 1].x, plotY + plotHeight)
    doc.closePath().fill('#dbeafe')
    doc.restore()
  }

  doc.strokeColor('#0f5ea8').lineWidth(2.5)
  points.forEach((point, index) => {
    if (index === 0) doc.moveTo(point.x, point.y)
    else doc.lineTo(point.x, point.y)
  })
  if (points.length > 0) doc.stroke()

  points.forEach((point) => {
    doc.circle(point.x, point.y, 4).fill('#0f5ea8')
    if (asNumber(point.submissions) > 0) {
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(String(point.submissions), point.x - 12, point.y - 16, {
          align: 'center',
          width: 24,
        })
    }
  })

  doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
  points.slice(0, 7).forEach((point) => {
    doc.text(point.day, point.x - 24, plotY + plotHeight + 10, {
      align: 'center',
      width: 48,
    })
  })
  doc.fillColor('#6b7280').fontSize(8).text(String(max), x + 10, plotY - 3)
  doc.text('0', x + 18, plotY + plotHeight - 3)

  doc.y = y + height + 22
}

function drawBarSection(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<Record<string, string | number>>,
  config: {
    barKey: string
    countKey: string
    labelKey: string
    subtitle?: string
    valueSuffix?: string
  },
  maxRows = 8,
) {
  ensureSpace(doc, 120)
  drawSectionTitle(doc, title, config.subtitle)

  const startX = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const maxBar = Math.max(...rows.map((row) => asNumber(row[config.barKey])), 1)
  let y = doc.y

  rows.slice(0, maxRows).forEach((row, index) => {
    ensureSpace(doc, 44)
    const value = asNumber(row[config.barKey])
    const label = String(row[config.labelKey] ?? '')
    const count = String(row[config.countKey] ?? value)
    const barWidth = Math.max((value / maxBar) * (width - 190), value > 0 ? 6 : 0)
    const color = REPORT_COLORS[index % REPORT_COLORS.length]

    doc.roundedRect(startX, y, width, 34, 8).fill('#f8fafc')
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(label, startX + 12, y + 10, { width: 150 })
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(9)
      .text(`${count}${config.valueSuffix ?? ''}`, startX + width - 58, y + 10, {
        align: 'right',
        width: 46,
      })
    doc.roundedRect(startX + 170, y + 13, width - 240, 8, 999).fill('#e5e7eb')
    doc.roundedRect(startX + 170, y + 13, barWidth, 8, 999).fill(color)
    y += 42
    doc.y = y
  })

  doc.moveDown(0.4)
}

function drawBarPanel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<Record<string, string | number>>,
  config: {
    barKey: string
    countKey: string
    labelKey: string
    valueSuffix?: string
  },
) {
  const panelHeight = 250
  const maxBar = Math.max(...rows.map((row) => asNumber(row[config.barKey])), 1)

  doc.roundedRect(x, y, width, panelHeight, 12).fillAndStroke('#ffffff', '#e5e7eb')
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(title, x + 16, y + 16)

  let rowY = y + 48
  rows.slice(0, 5).forEach((row, index) => {
    const value = asNumber(row[config.barKey])
    const label = String(row[config.labelKey] ?? '')
    const count = String(row[config.countKey] ?? value)
    const barTrackWidth = width - 124
    const barWidth = Math.max((value / maxBar) * barTrackWidth, value > 0 ? 5 : 0)
    const color = REPORT_COLORS[index % REPORT_COLORS.length]

    doc
      .fillColor('#334155')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(label, x + 16, rowY, { width: width - 32 })
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(8)
      .text(`${count}${config.valueSuffix ?? ''}`, x + width - 72, rowY, {
        align: 'right',
        width: 56,
      })
    doc.roundedRect(x + 16, rowY + 18, barTrackWidth, 8, 999).fill('#e5e7eb')
    doc.roundedRect(x + 16, rowY + 18, barWidth, 8, 999).fill(color)
    rowY += 38
  })

  if (rows.length === 0) {
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(10)
      .text('No data yet.', x + 16, y + 54)
  }
}

function drawBarTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<Record<string, string | number>>,
  columns: Array<{ key: string; label: string; width: number }>,
  barKey?: string,
) {
  ensureSpace(doc, 120)
  drawSectionTitle(doc, title)

  const startX = doc.page.margins.left
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const maxBar = barKey
    ? Math.max(...rows.map((row) => asNumber(row[barKey])), 1)
    : 1

  let y = doc.y
  doc.roundedRect(startX, y, tableWidth, 28, 6).fill('#f8fafc')
  let x = startX
  columns.forEach((column) => {
    doc
      .fillColor('#6b7280')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(column.label.toUpperCase(), x + 8, y + 10, {
        width: column.width - 16,
      })
    x += column.width
  })
  y += 28

  rows.forEach((row) => {
    ensureSpace(doc, 36)
    x = startX
    doc.moveTo(startX, y).lineTo(startX + tableWidth, y).strokeColor('#eef2f7').stroke()

    columns.forEach((column) => {
      doc
        .fillColor('#111827')
        .font(column.key === columns[0].key ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .text(String(row[column.key] ?? ''), x + 8, y + 10, {
          width: column.width - 16,
        })
      x += column.width
    })

    if (barKey) {
      const value = asNumber(row[barKey])
      const barWidth = Math.max((value / maxBar) * 110, value > 0 ? 4 : 0)
      doc.roundedRect(startX + tableWidth - 125, y + 13, 112, 7, 999).fill('#e5e7eb')
      doc.roundedRect(startX + tableWidth - 125, y + 13, barWidth, 7, 999).fill('#0f5ea8')
    }

    y += 34
    doc.y = y
  })

  doc.moveDown(1)
}

export async function downloadEventAnalyticsReport(
  req: Request<EventParams, unknown, AnalyticsReportBody>,
  res: Response,
) {
  try {
    const { eventId } = req.params
    const event = await eventRepository.findFirst({
      where: { id: eventId, stsrc: { not: 'D' } },
      select: { id: true, name: true },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    const formTitle = req.body.formTitle?.trim() || event.name || 'Untitled form'
    const metrics = req.body.metrics?.length
      ? req.body.metrics
      : [
          { label: 'Unique visitors', value: '0' },
          { label: 'Started', value: '0' },
          { label: 'Finished', value: '0' },
          { label: 'Completion rate', value: '0%' },
        ]
    const submissionsByDay = req.body.submissionsByDay?.length
      ? req.body.submissionsByDay
      : [{ day: 'No data', submissions: 0 }]
    const pageDropOffs = req.body.pageDropOffs ?? []
    const deviceRows = req.body.deviceRows ?? []
    const doc = new PDFDocument({
      info: {
        Author: 'UpForm',
        Subject: `${formTitle} analytics report`,
        Title: `${formTitle} Analytics Report`,
      },
      layout: 'landscape',
      margin: 40,
      size: 'A4',
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizeFileName(formTitle)}-analytics-report.pdf"`,
    )

    doc.pipe(res)

    drawReportHeader(doc, formTitle, req.body.dateRangeLabel || 'All time', req.body.conditionCount)
    drawMetricCards(doc, metrics)
    drawLineChart(doc, 'Completed Submissions by Day', submissionsByDay)

    doc.addPage()
    drawReportHeader(doc, formTitle, req.body.dateRangeLabel || 'All time', req.body.conditionCount)

    const totalDevices = deviceRows.reduce((sum, row) => sum + asNumber(row.count), 0)
    const panelGap = 18
    const panelWidth =
      (doc.page.width - doc.page.margins.left - doc.page.margins.right - panelGap) / 2
    const panelY = doc.y
    drawBarPanel(
      doc,
      doc.page.margins.left,
      panelY,
      panelWidth,
      'Page Performance',
      pageDropOffs,
      {
        barKey: 'views',
        countKey: 'views',
        labelKey: 'label',
        valueSuffix: ' views',
      },
    )
    drawBarPanel(
      doc,
      doc.page.margins.left + panelWidth + panelGap,
      panelY,
      panelWidth,
      'Device Mix',
      deviceRows.map((row) => ({
        count: row.count,
        label: row.label,
        share: totalDevices > 0 ? `${((row.count / totalDevices) * 100).toFixed(1)}%` : '0%',
      })),
      {
        barKey: 'count',
        countKey: 'share',
        labelKey: 'label',
      },
    )

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        'Prepared with UpForm. Metrics reflect the analytics filters active at export time.',
        doc.page.margins.left,
        doc.page.height - 54,
        { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
      )

    doc.end()
  } catch (error) {
    handleControllerError('EventAnalytics', 'download report failed', error, res)
  }
}

export async function trackPublicEventAnalytics(
  req: Request<PublicEventParams, unknown, AnalyticsEventBody>,
  res: Response,
) {
  try {
    const event = await eventRepository.findFirst({
      where: { id: req.params.id, status: 'active', stsrc: { not: 'D' } },
    })
    if (!event) {
      res.status(404).json({ error: 'Event not found or not active' })
      return
    }

    const analyticsEvent = await eventAnalyticsEventRepository.create({
      data: getAnalyticsData(req.params.id, req.body),
    })

    res.status(201).json(analyticsEvent)
  } catch (error) {
    handleControllerError('EventAnalytics', 'track analytics event failed', error, res)
  }
}
