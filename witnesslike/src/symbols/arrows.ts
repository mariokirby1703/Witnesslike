import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  edgeKey,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type ArrowDirection =
  | 'right'
  | 'down-right'
  | 'down'
  | 'down-left'
  | 'left'
  | 'up-left'
  | 'up'
  | 'up-right'

export type ArrowTarget = {
  cellX: number
  cellY: number
  direction: ArrowDirection
  count: 1 | 2 | 3 | 4
  color: string
}

const DEFAULT_ARROW_COLOR = '#a855f7'
const EPSILON = 1e-9
const ALL_DIRECTIONS: ArrowDirection[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
]

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function countCardinalCrossings(path: Point[], direction: ArrowDirection, centerX: number, centerY: number) {
  let crossings = 0
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    if (a.x === b.x) {
      const x = a.x
      const minY = Math.min(a.y, b.y)
      const maxY = Math.max(a.y, b.y)
      const hitsRow = centerY > minY && centerY < maxY
      if (!hitsRow) continue
      if (direction === 'right' && x > centerX) crossings += 1
      if (direction === 'left' && x < centerX) crossings += 1
      continue
    }
    if (a.y === b.y) {
      const y = a.y
      const minX = Math.min(a.x, b.x)
      const maxX = Math.max(a.x, b.x)
      const hitsColumn = centerX > minX && centerX < maxX
      if (!hitsColumn) continue
      if (direction === 'down' && y > centerY) crossings += 1
      if (direction === 'up' && y < centerY) crossings += 1
    }
  }
  return crossings
}

function countDiagonalCrossings(path: Point[], direction: ArrowDirection, centerX: number, centerY: number) {
  let crossings = 0
  for (const point of path) {
    const dx = point.x - centerX
    const dy = point.y - centerY

    if (direction === 'up-right') {
      if (dx > 0 && dy < 0 && Math.abs(dx + dy) < EPSILON) crossings += 1
      continue
    }
    if (direction === 'up-left') {
      if (dx < 0 && dy < 0 && Math.abs(dx - dy) < EPSILON) crossings += 1
      continue
    }
    if (direction === 'down-right') {
      if (dx > 0 && dy > 0 && Math.abs(dx - dy) < EPSILON) crossings += 1
      continue
    }
    if (dx < 0 && dy > 0 && Math.abs(dx + dy) < EPSILON) crossings += 1
  }
  return crossings
}

export function countArrowCrossings(path: Point[], target: Pick<ArrowTarget, 'cellX' | 'cellY' | 'direction'>) {
  const centerX = target.cellX + 0.5
  const centerY = target.cellY + 0.5

  if (
    target.direction === 'left' ||
    target.direction === 'right' ||
    target.direction === 'up' ||
    target.direction === 'down'
  ) {
    return countCardinalCrossings(path, target.direction, centerX, centerY)
  }

  return countDiagonalCrossings(path, target.direction, centerX, centerY)
}

export function generateArrowsForEdges(
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

  const optionsByCell = new Map<string, Array<{ direction: ArrowDirection; count: 1 | 2 | 3 | 4 }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const options: Array<{ direction: ArrowDirection; count: 1 | 2 | 3 | 4 }> = []
      for (const direction of ALL_DIRECTIONS) {
        const crossings = countArrowCrossings(solutionPath, { cellX: x, cellY: y, direction })
        if (crossings < 1 || crossings > 4) continue
        options.push({ direction, count: crossings as 1 | 2 | 3 | 4 })
      }
      if (options.length > 0) {
        optionsByCell.set(`${x},${y}`, options)
      }
    }
  }

  const candidateCells = Array.from(optionsByCell.keys())
  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 2 : 1
  const maxCount = lowSymbolSet ? 8 : 5
  const maxAllowed = Math.min(maxCount, candidateCells.length)
  if (maxAllowed < minCount) return null

  const targetCount = lowSymbolSet
    ? minCount + randInt(rng, maxAllowed - minCount + 1)
    : 1 + randInt(rng, maxAllowed)

  let palette = [DEFAULT_ARROW_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_ARROW_COLOR]
  }

  const arrows = shuffle(candidateCells, rng)
    .slice(0, targetCount)
    .map((key) => {
      const [cellX, cellY] = key.split(',').map(Number)
      const options = optionsByCell.get(key) ?? []
      const pick = options[randInt(rng, options.length)] ?? options[0]
      return {
        cellX,
        cellY,
        direction: pick.direction,
        count: pick.count,
        color: palette[randInt(rng, palette.length)] ?? DEFAULT_ARROW_COLOR,
      }
    })

  return { arrows, solutionPath }
}

export function checkArrows(path: Point[], arrowTargets: ArrowTarget[]) {
  return arrowTargets.every(
    (target) => countArrowCrossings(path, target) === target.count
  )
}

export function arrowDirectionAngle(direction: ArrowDirection) {
  if (direction === 'right') return 0
  if (direction === 'down-right') return 45
  if (direction === 'down') return 90
  if (direction === 'down-left') return 135
  if (direction === 'left') return 180
  if (direction === 'up-left') return -135
  if (direction === 'up') return -90
  return -45
}
