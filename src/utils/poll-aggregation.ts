import { prisma } from '../config/prisma.js'

export async function aggregateWordCloud(slideId: string) {
  const votes = await prisma.pollVote.findMany({ where: { slideId } })
  const wordMap = new Map<string, number>()

  for (const vote of votes) {
    const word = String((vote.value as { word?: string }).word ?? '').trim().toLowerCase()
    if (word) wordMap.set(word, (wordMap.get(word) ?? 0) + 1)
  }

  return Array.from(wordMap.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
}

export async function aggregateMC(slideId: string) {
  const slide = await prisma.pollSlide.findUnique({ where: { id: slideId } })
  const options = (slide?.options as string[]) ?? []
  const votes = await prisma.pollVote.findMany({ where: { slideId } })

  const countMap = new Map<string, number>()
  for (const opt of options) countMap.set(opt, 0)

  for (const vote of votes) {
    const selected = (vote.value as { option?: string }).option
    if (selected && countMap.has(selected)) {
      countMap.set(selected, countMap.get(selected)! + 1)
    }
  }

  return options.map((option) => ({ option, count: countMap.get(option) ?? 0 }))
}

export async function aggregateOpenEnded(slideId: string) {
  const votes = await prisma.pollVote.findMany({
    where: { slideId },
    orderBy: { createdAt: 'desc' },
  })

  const textMap = new Map<string, { count: number; createdAt: Date }>()
  for (const v of votes) {
    const text = String((v.value as { text?: string }).text ?? '').trim()
    if (!text) continue
    const existing = textMap.get(text)
    if (existing) {
      existing.count++
    } else {
      textMap.set(text, { count: 1, createdAt: v.createdAt })
    }
  }

  return Array.from(textMap.entries())
    .map(([text, { count, createdAt }]) => ({ text, count, createdAt }))
    .sort((a, b) => b.count - a.count)
}

export async function aggregateRanking(slideId: string) {
  const slide = await prisma.pollSlide.findUnique({ where: { id: slideId } })
  const options = (slide?.options as string[]) ?? []
  const votes = await prisma.pollVote.findMany({ where: { slideId } })

  const rankSums = new Map<string, { total: number; count: number }>()
  for (const opt of options) rankSums.set(opt, { total: 0, count: 0 })

  for (const vote of votes) {
    const ranking = (vote.value as { ranking?: string[] }).ranking ?? []
    ranking.forEach((opt, index) => {
      const entry = rankSums.get(opt)
      if (entry) {
        entry.total += index + 1
        entry.count += 1
      }
    })
  }

  return options
    .map((option) => {
      const entry = rankSums.get(option)!
      return { option, avgRank: entry.count > 0 ? entry.total / entry.count : 0 }
    })
    .sort((a, b) => a.avgRank - b.avgRank)
}

export async function aggregateScale(slideId: string) {
  const votes = await prisma.pollVote.findMany({ where: { slideId } })
  const statementsMap = new Map<string, Map<number, number>>()

  for (const vote of votes) {
    const scales = (vote.value as { scales?: { statement: string; value: number | null }[] }).scales
    if (!Array.isArray(scales)) continue
    for (const { statement, value } of scales) {
      if (value === null || value === undefined) continue
      if (!statementsMap.has(statement)) statementsMap.set(statement, new Map())
      const dist = statementsMap.get(statement)!
      dist.set(value, (dist.get(value) ?? 0) + 1)
    }
  }

  return Array.from(statementsMap.entries()).map(([statement, dist]) => {
    const distribution = Array.from(dist.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value)
    const total = distribution.reduce((s, d) => s + d.count, 0)
    const avg = total > 0 ? distribution.reduce((s, d) => s + d.value * d.count, 0) / total : 0
    return { statement, distribution, average: avg, responseCount: total }
  })
}

export async function aggregateQA(slideId: string) {
  const votes = await prisma.pollVote.findMany({
    where: { slideId },
    orderBy: { createdAt: 'desc' },
  })

  return votes
    .map((v) => {
      const val = v.value as { text?: string; participantName?: string }
      const text = String(val.text ?? '').trim()
      const participantName = val.participantName ?? v.participantId
      return { text, participantName, createdAt: v.createdAt, isAnswered: v.isAnswered, voteId: v.id }
    })
    .filter((item) => item.text)
}

export async function aggregateGuessNumber(slideId: string) {
  const votes = await prisma.pollVote.findMany({ where: { slideId } })
  const countMap = new Map<number, number>()

  for (const vote of votes) {
    const val = Number((vote.value as { value?: number }).value)
    if (!isNaN(val)) countMap.set(val, (countMap.get(val) ?? 0) + 1)
  }

  return Array.from(countMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value)
}

export async function aggregateHundredPoints(slideId: string) {
  const slide = await prisma.pollSlide.findUnique({ where: { id: slideId } })
  const options = (slide?.options as string[]) ?? []
  const votes = await prisma.pollVote.findMany({ where: { slideId } })

  const pointsMap = new Map<string, number>()
  for (const opt of options) pointsMap.set(opt, 0)

  for (const vote of votes) {
    const allocations = (vote.value as { allocations?: Record<string, number> }).allocations ?? {}
    for (const [opt, pts] of Object.entries(allocations)) {
      if (pointsMap.has(opt)) {
        pointsMap.set(opt, pointsMap.get(opt)! + (Number(pts) || 0))
      }
    }
  }

  return options.map((option) => ({ option, totalPoints: pointsMap.get(option) ?? 0 }))
}

export async function aggregatePinOnImage(slideId: string) {
  const votes = await prisma.pollVote.findMany({
    where: { slideId },
    orderBy: { createdAt: 'desc' },
  })

  return votes.map((v) => {
    const val = v.value as { x?: number; y?: number; participantName?: string }
    return {
      x: Number(val.x ?? 0),
      y: Number(val.y ?? 0),
      participantName: val.participantName ?? v.participantId,
    }
  })
}

export async function aggregate2x2Grid(slideId: string) {
  const slide = await prisma.pollSlide.findUnique({ where: { id: slideId } })
  const options = (slide?.options as string[]) ?? []
  const votes = await prisma.pollVote.findMany({ where: { slideId } })

  const placementMap = new Map<string, { xTotal: number; yTotal: number; count: number }>()
  for (const opt of options) placementMap.set(opt, { xTotal: 0, yTotal: 0, count: 0 })

  for (const vote of votes) {
    const placements = (vote.value as { placements?: Record<string, { x: number; y: number }> }).placements ?? {}
    for (const [opt, pos] of Object.entries(placements)) {
      const entry = placementMap.get(opt)
      if (entry) {
        entry.xTotal += Number(pos.x) || 0
        entry.yTotal += Number(pos.y) || 0
        entry.count += 1
      }
    }
  }

  return options.map((option) => {
    const entry = placementMap.get(option)!
    return {
      option,
      avgX: entry.count > 0 ? entry.xTotal / entry.count : 50,
      avgY: entry.count > 0 ? entry.yTotal / entry.count : 50,
    }
  })
}

export type AggregateResult =
  | Awaited<ReturnType<typeof aggregateWordCloud>>
  | Awaited<ReturnType<typeof aggregateMC>>
  | Awaited<ReturnType<typeof aggregateOpenEnded>>
  | Awaited<ReturnType<typeof aggregateRanking>>
  | Awaited<ReturnType<typeof aggregateScale>>
  | Awaited<ReturnType<typeof aggregateQA>>
  | Awaited<ReturnType<typeof aggregateGuessNumber>>
  | Awaited<ReturnType<typeof aggregateHundredPoints>>
  | Awaited<ReturnType<typeof aggregatePinOnImage>>
  | Awaited<ReturnType<typeof aggregate2x2Grid>>

const aggregators: Record<string, (slideId: string) => Promise<AggregateResult>> = {
  word_cloud: aggregateWordCloud,
  multiple_choice: aggregateMC,
  open_ended: aggregateOpenEnded,
  ranking: aggregateRanking,
  scales: aggregateScale,
  qa: aggregateQA,
  guess_number: aggregateGuessNumber,
  hundred_points: aggregateHundredPoints,
  pin_on_image: aggregatePinOnImage,
  grid_2x2: aggregate2x2Grid,
}

export function aggregateResults(type: string, slideId: string) {
  const fn = aggregators[type]
  if (!fn) throw new Error(`Unknown slide type: ${type}`)
  return fn(slideId)
}
