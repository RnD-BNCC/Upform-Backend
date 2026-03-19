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

  return votes.map((v) => ({
    text: String((v.value as { text?: string }).text ?? ''),
    createdAt: v.createdAt,
  }))
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
  const countMap = new Map<number, number>()

  for (const vote of votes) {
    const val = Number((vote.value as { scale?: number }).scale)
    if (!isNaN(val)) countMap.set(val, (countMap.get(val) ?? 0) + 1)
  }

  return Array.from(countMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value)
}

export type AggregateResult =
  | Awaited<ReturnType<typeof aggregateWordCloud>>
  | Awaited<ReturnType<typeof aggregateMC>>
  | Awaited<ReturnType<typeof aggregateOpenEnded>>
  | Awaited<ReturnType<typeof aggregateRanking>>
  | Awaited<ReturnType<typeof aggregateScale>>

const aggregators: Record<string, (slideId: string) => Promise<AggregateResult>> = {
  word_cloud: aggregateWordCloud,
  multiple_choice: aggregateMC,
  open_ended: aggregateOpenEnded,
  ranking: aggregateRanking,
  scales: aggregateScale,
}

export function aggregateResults(type: string, slideId: string) {
  const fn = aggregators[type]
  if (!fn) throw new Error(`Unknown slide type: ${type}`)
  return fn(slideId)
}
