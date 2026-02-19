import { MAX_INDEX, type Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  edgeKey,
  edgesFromPath,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type CardinalTarget = {
  cellX: number
  cellY: number
  color: string
}

const DEFAULT_CARDINAL_COLOR = '#ef2df5'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function hasTopBlock(usedEdges: Set<string>, cellX: number, cellY: number) {
  for (let y = cellY; y >= 0; y -= 1) {
    const key = edgeKey({ x: cellX, y }, { x: cellX + 1, y })
    if (usedEdges.has(key)) return true
  }
  return false
}

function hasBottomBlock(usedEdges: Set<string>, cellX: number, cellY: number) {
  for (let y = cellY + 1; y <= MAX_INDEX; y += 1) {
    const key = edgeKey({ x: cellX, y }, { x: cellX + 1, y })
    if (usedEdges.has(key)) return true
  }
  return false
}

function hasLeftBlock(usedEdges: Set<string>, cellX: number, cellY: number) {
  for (let x = cellX; x >= 0; x -= 1) {
    const key = edgeKey({ x, y: cellY }, { x, y: cellY + 1 })
    if (usedEdges.has(key)) return true
  }
  return false
}

function hasRightBlock(usedEdges: Set<string>, cellX: number, cellY: number) {
  for (let x = cellX + 1; x <= MAX_INDEX; x += 1) {
    const key = edgeKey({ x, y: cellY }, { x, y: cellY + 1 })
    if (usedEdges.has(key)) return true
  }
  return false
}

export function isCardinalBlockedAllDirections(
  usedEdges: Set<string>,
  cellX: number,
  cellY: number
) {
  return (
    hasTopBlock(usedEdges, cellX, cellY) &&
    hasRightBlock(usedEdges, cellX, cellY) &&
    hasBottomBlock(usedEdges, cellX, cellY) &&
    hasLeftBlock(usedEdges, cellX, cellY)
  )
}

function pickLowSetTargetCount(rng: () => number, maxAllowed: number) {
  if (maxAllowed <= 1) return 1
  if (maxAllowed === 2) return rng() < 0.5 ? 1 : 2
  if (maxAllowed === 3) {
    const roll = rng()
    if (roll < 0.38) return 1
    if (roll < 0.78) return 2
    return 3
  }
  const roll = rng()
  if (roll < 0.32) return 1
  if (roll < 0.62) return 2
  if (roll < 0.9) return 3
  return 4
}

export function generateCardinalsForEdges(
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
    preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)
      ? preferredPath
      : findBestLoopyPathByRegions(edges, rng, 220, 10) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const usedEdges = edgesFromPath(solutionPath)
  const candidates: Array<Omit<CardinalTarget, 'color'>> = []
  for (let y = 0; y < MAX_INDEX; y += 1) {
    for (let x = 0; x < MAX_INDEX; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      if (!isCardinalBlockedAllDirections(usedEdges, x, y)) continue
      candidates.push({ cellX: x, cellY: y })
    }
  }
  if (candidates.length === 0) return null

  const lowSymbolSet = selectedSymbolCount <= 2
  const maxCount = lowSymbolSet ? 4 : 2
  const maxAllowed = Math.min(maxCount, candidates.length)
  if (maxAllowed < 1) return null

  const targetCount = lowSymbolSet
    ? pickLowSetTargetCount(rng, maxAllowed)
    : maxAllowed === 1
      ? 1
      : 1 + randInt(rng, 2)

  let palette = [DEFAULT_CARDINAL_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_CARDINAL_COLOR]
  }

  const targets = shuffle(candidates, rng)
    .slice(0, targetCount)
    .map((target) => ({
      ...target,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_CARDINAL_COLOR,
    }))
  return { targets, solutionPath }
}

export function checkCardinals(usedEdges: Set<string>, targets: CardinalTarget[]) {
  return targets.every((target) => isCardinalBlockedAllDirections(usedEdges, target.cellX, target.cellY))
}

