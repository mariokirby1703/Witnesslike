import { MAX_INDEX, type Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  edgeKey,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type SpinnerDirection = 'clockwise' | 'counterclockwise'

export type SpinnerTarget = {
  cellX: number
  cellY: number
  direction: SpinnerDirection
  color: string
}

const DEFAULT_SPINNER_COLOR = '#39ff14'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function traversalDirectionAroundCell(
  a: Point,
  b: Point,
  cellX: number,
  cellY: number
): SpinnerDirection | null {
  if (a.x === b.x) {
    const x = a.x
    const minY = Math.min(a.y, b.y)
    if (minY !== cellY) return null
    if (x === cellX) {
      return a.y > b.y ? 'clockwise' : 'counterclockwise'
    }
    if (x === cellX + 1) {
      return a.y < b.y ? 'clockwise' : 'counterclockwise'
    }
    return null
  }
  if (a.y === b.y) {
    const y = a.y
    const minX = Math.min(a.x, b.x)
    if (minX !== cellX) return null
    if (y === cellY) {
      return a.x < b.x ? 'clockwise' : 'counterclockwise'
    }
    if (y === cellY + 1) {
      return a.x > b.x ? 'clockwise' : 'counterclockwise'
    }
    return null
  }
  return null
}

function countSpinnerTraversals(path: Point[], target: Pick<SpinnerTarget, 'cellX' | 'cellY'>) {
  let clockwise = 0
  let counterclockwise = 0
  for (let index = 1; index < path.length; index += 1) {
    const direction = traversalDirectionAroundCell(
      path[index - 1],
      path[index],
      target.cellX,
      target.cellY
    )
    if (!direction) continue
    if (direction === 'clockwise') clockwise += 1
    else counterclockwise += 1
  }
  return { clockwise, counterclockwise }
}

export function collectFailingSpinnerIndexes(path: Point[], spinnerTargets: SpinnerTarget[]) {
  const failing = new Set<number>()
  spinnerTargets.forEach((target, index) => {
    const traversals = countSpinnerTraversals(path, target)
    const touched = traversals.clockwise + traversals.counterclockwise
    if (touched === 0) {
      failing.add(index)
      return
    }
    if (target.direction === 'clockwise') {
      if (traversals.counterclockwise > 0) failing.add(index)
      return
    }
    if (traversals.clockwise > 0) failing.add(index)
  })
  return failing
}

export function checkSpinners(path: Point[], spinnerTargets: SpinnerTarget[]) {
  return collectFailingSpinnerIndexes(path, spinnerTargets).size === 0
}

function directionSatisfiedByPath(path: Point[], cellX: number, cellY: number): SpinnerDirection | null {
  const traversals = countSpinnerTraversals(path, { cellX, cellY })
  if (traversals.clockwise > 0 && traversals.counterclockwise === 0) return 'clockwise'
  if (traversals.counterclockwise > 0 && traversals.clockwise === 0) return 'counterclockwise'
  return null
}

export function generateSpinnersForEdges(
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

  const candidates: Array<Omit<SpinnerTarget, 'color'>> = []
  for (let y = 0; y < MAX_INDEX; y += 1) {
    for (let x = 0; x < MAX_INDEX; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const direction = directionSatisfiedByPath(solutionPath, x, y)
      if (!direction) continue
      candidates.push({ cellX: x, cellY: y, direction })
    }
  }
  if (candidates.length === 0) return null

  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 2 : 1
  const maxCount = lowSymbolSet ? 6 : 4
  const maxAllowed = Math.min(maxCount, candidates.length)
  if (maxAllowed < minCount) return null
  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)

  let palette = [DEFAULT_SPINNER_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_SPINNER_COLOR]
  }

  const targets = shuffle(candidates, rng)
    .slice(0, targetCount)
    .map((target) => ({
      ...target,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_SPINNER_COLOR,
    }))

  return { targets, solutionPath }
}

export function spinnerDirectionScaleX(direction: SpinnerDirection) {
  return direction === 'counterclockwise' ? -1 : 1
}
