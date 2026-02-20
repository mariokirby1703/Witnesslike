import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type DotTarget = {
  cellX: number
  cellY: number
  count: 1 | 2 | 3 | 4
  color: string
}

const DEFAULT_DOT_COLOR = '#f4eb2f'

function countTouchedCellCorners(path: Point[], cellX: number, cellY: number) {
  const corners = new Set<string>([
    `${cellX},${cellY}`,
    `${cellX + 1},${cellY}`,
    `${cellX},${cellY + 1}`,
    `${cellX + 1},${cellY + 1}`,
  ])
  let touched = 0
  for (const point of path) {
    if (corners.has(`${point.x},${point.y}`)) touched += 1
  }
  return touched
}

function dotCountWeight(count: 1 | 2 | 3 | 4, lowSymbolSet: boolean) {
  if (lowSymbolSet) {
    if (count === 1) return 5
    if (count === 2) return 3
    if (count === 3) return 0.9
    return 0.35
  }
  if (count === 1) return 8
  if (count === 2) return 4.5
  if (count === 3) return 0.28
  return 0.08
}

export function generateDotsForEdges(
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

  const candidates: Array<Omit<DotTarget, 'color'>> = []
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const touchedCorners = countTouchedCellCorners(solutionPath, x, y)
      if (touchedCorners < 1 || touchedCorners > 4) continue
      candidates.push({
        cellX: x,
        cellY: y,
        count: touchedCorners as 1 | 2 | 3 | 4,
      })
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

  let palette = [DEFAULT_DOT_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      const desiredColors = 2
      palette = shuffle(COLOR_PALETTE, rng).slice(0, desiredColors)
    }
    if (palette.length === 0) palette = [DEFAULT_DOT_COLOR]
  }

  const remaining = shuffle(candidates, rng)
  const selected: Array<Omit<DotTarget, 'color'>> = []
  while (selected.length < targetCount && remaining.length > 0) {
    const totalWeight = remaining.reduce(
      (sum, candidate) => sum + dotCountWeight(candidate.count, lowSymbolSet),
      0
    )
    let roll = rng() * totalWeight
    let pickIndex = remaining.length - 1
    for (let index = 0; index < remaining.length; index += 1) {
      roll -= dotCountWeight(remaining[index].count, lowSymbolSet)
      if (roll <= 0) {
        pickIndex = index
        break
      }
    }
    const [picked] = remaining.splice(pickIndex, 1)
    if (!picked) break
    selected.push(picked)
  }

  if (selected.length > 0) {
    let maxHighDots: number
    if (lowSymbolSet) {
      maxHighDots =
        selected.length >= 7 ? 2 : selected.length >= 4 ? 1 : 0
      if (maxHighDots > 0 && rng() < 0.35) {
        maxHighDots -= 1
      }
    } else {
      maxHighDots = selected.length >= 4 ? 1 : rng() < 0.2 ? 1 : 0
    }

    let highDotsUsed = 0
    const lowCountPool = shuffle(remaining.filter((candidate) => candidate.count <= 2), rng)
    for (let index = 0; index < selected.length; index += 1) {
      if (selected[index].count <= 2) continue
      if (highDotsUsed < maxHighDots) {
        highDotsUsed += 1
        continue
      }
      const replacement = lowCountPool.pop()
      if (replacement) {
        selected[index] = replacement
      }
    }
  }

  const targets = selected.map((target) => ({
    ...target,
    color: palette[randInt(rng, palette.length)] ?? DEFAULT_DOT_COLOR,
  }))

  return { targets, solutionPath }
}

export function checkDots(path: Point[], dotTargets: DotTarget[]) {
  return dotTargets.every(
    (target) => countTouchedCellCorners(path, target.cellX, target.cellY) === target.count
  )
}
