import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgeKey,
  edgesFromPath,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'
import type { ArrowDirection } from './arrows'

export type ChevronTarget = {
  cellX: number
  cellY: number
  direction: ArrowDirection
  count: 1 | 2 | 3
  color: string
}

const DEFAULT_CHEVRON_COLOR = '#ff4c00'
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

function directionDelta(direction: ArrowDirection) {
  if (direction === 'right') return { dx: 1, dy: 0 }
  if (direction === 'down-right') return { dx: 1, dy: 1 }
  if (direction === 'down') return { dx: 0, dy: 1 }
  if (direction === 'down-left') return { dx: -1, dy: 1 }
  if (direction === 'left') return { dx: -1, dy: 0 }
  if (direction === 'up-left') return { dx: -1, dy: -1 }
  if (direction === 'up') return { dx: 0, dy: -1 }
  return { dx: 1, dy: -1 }
}

export function countChevronRegionCells(
  regions: Map<string, number>,
  target: Pick<ChevronTarget, 'cellX' | 'cellY' | 'direction'>
) {
  const sourceRegion = regions.get(`${target.cellX},${target.cellY}`)
  if (sourceRegion === undefined) return 0
  const { dx, dy } = directionDelta(target.direction)
  let x = target.cellX + dx
  let y = target.cellY + dy
  let matches = 0
  while (x >= 0 && x < 4 && y >= 0 && y < 4) {
    if (regions.get(`${x},${y}`) === sourceRegion) matches += 1
    x += dx
    y += dy
  }
  return matches
}

export function generateChevronsForEdges(
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

  const regions = buildCellRegions(edgesFromPath(solutionPath))
  const optionsByCell = new Map<string, Array<{ direction: ArrowDirection; count: 1 | 2 | 3 }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const options: Array<{ direction: ArrowDirection; count: 1 | 2 | 3 }> = []
      for (const direction of ALL_DIRECTIONS) {
        const count = countChevronRegionCells(regions, { cellX: x, cellY: y, direction })
        if (count < 1 || count > 3) continue
        options.push({ direction, count: count as 1 | 2 | 3 })
      }
      if (options.length > 0) {
        optionsByCell.set(`${x},${y}`, options)
      }
    }
  }

  const candidateCells = Array.from(optionsByCell.keys())
  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 3 : 2
  const maxCount = lowSymbolSet ? 8 : 5
  const maxAllowed = Math.min(maxCount, candidateCells.length)
  if (maxAllowed < minCount) return null

  const targetCount = lowSymbolSet
    ? minCount + randInt(rng, maxAllowed - minCount + 1)
    : 1 + randInt(rng, maxAllowed)

  let palette = [DEFAULT_CHEVRON_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_CHEVRON_COLOR]
  }

  const targets = shuffle(candidateCells, rng)
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
        color: palette[randInt(rng, palette.length)] ?? DEFAULT_CHEVRON_COLOR,
      }
    })

  return { targets, solutionPath }
}

export function checkChevrons(usedEdges: Set<string>, targets: ChevronTarget[]) {
  const regions = buildCellRegions(usedEdges)
  return targets.every((target) => countChevronRegionCells(regions, target) === target.count)
}

export function chevronDirectionAngle(direction: ArrowDirection) {
  if (direction === 'right') return 0
  if (direction === 'down-right') return 45
  if (direction === 'down') return 90
  if (direction === 'down-left') return 135
  if (direction === 'left') return 180
  if (direction === 'up-left') return -135
  if (direction === 'up') return -90
  return -45
}
