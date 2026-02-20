import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type DiamondTarget = {
  cellX: number
  cellY: number
  count: 1 | 2 | 3 | 4
  color: string
}

const DEFAULT_DIAMOND_COLOR = '#9fbc00'

export function countTouchedCornerBends(path: Point[], cellX: number, cellY: number) {
  const corners = new Set<string>([
    `${cellX},${cellY}`,
    `${cellX + 1},${cellY}`,
    `${cellX},${cellY + 1}`,
    `${cellX + 1},${cellY + 1}`,
  ])
  let bends = 0
  for (let i = 1; i < path.length - 1; i += 1) {
    const point = path[i]
    if (!corners.has(`${point.x},${point.y}`)) continue
    const prev = path[i - 1]
    const next = path[i + 1]
    const dxA = point.x - prev.x
    const dyA = point.y - prev.y
    const dxB = next.x - point.x
    const dyB = next.y - point.y
    if (dxA !== dxB || dyA !== dyB) {
      bends += 1
    }
  }
  return bends
}

function diamondCountWeight(count: 1 | 2 | 3 | 4, lowSymbolSet: boolean) {
  if (lowSymbolSet) return 1
  if (count === 1) return 4
  if (count === 2) return 2.6
  if (count === 3) return 1.2
  return 0.6
}

export function generateDiamondsForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  starsActive: boolean,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 220, 10) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const candidates: Array<Omit<DiamondTarget, 'color'>> = []
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const bends = countTouchedCornerBends(solutionPath, x, y)
      if (bends < 1 || bends > 4) continue
      candidates.push({ cellX: x, cellY: y, count: bends as 1 | 2 | 3 | 4 })
    }
  }

  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 3 : 1
  const maxCount = lowSymbolSet ? 9 : 5
  const maxAllowed = Math.min(maxCount, candidates.length)
  if (maxAllowed < minCount) return null

  const range = maxAllowed - minCount
  const targetCount = lowSymbolSet
    ? minCount + randInt(rng, range + 1)
    : 1 + randInt(rng, maxAllowed)

  let palette = [DEFAULT_DIAMOND_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_DIAMOND_COLOR]
  }

  const remaining = shuffle(candidates, rng)
  const selected: Array<Omit<DiamondTarget, 'color'>> = []
  while (selected.length < targetCount && remaining.length > 0) {
    const totalWeight = remaining.reduce(
      (sum, candidate) => sum + diamondCountWeight(candidate.count, lowSymbolSet),
      0
    )
    let roll = rng() * totalWeight
    let pickIndex = remaining.length - 1
    for (let index = 0; index < remaining.length; index += 1) {
      roll -= diamondCountWeight(remaining[index].count, lowSymbolSet)
      if (roll <= 0) {
        pickIndex = index
        break
      }
    }
    const [picked] = remaining.splice(pickIndex, 1)
    if (!picked) break
    selected.push(picked)
  }

  const targets = selected.map((target) => ({
    ...target,
    color: palette[randInt(rng, palette.length)] ?? DEFAULT_DIAMOND_COLOR,
  }))

  return { targets, solutionPath }
}

export function checkDiamonds(path: Point[], diamondTargets: DiamondTarget[]) {
  return diamondTargets.every(
    (target) => countTouchedCornerBends(path, target.cellX, target.cellY) === target.count
  )
}
