import type { Point } from '../puzzleConstants'
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

export type TriangleTarget = {
  cellX: number
  cellY: number
  count: 1 | 2 | 3
  color: string
}

const DEFAULT_TRIANGLE_COLOR = '#ff8a00'

function countTouchedCellEdges(usedEdges: Set<string>, cellX: number, cellY: number) {
  let touched = 0
  const top = edgeKey({ x: cellX, y: cellY }, { x: cellX + 1, y: cellY })
  const bottom = edgeKey({ x: cellX, y: cellY + 1 }, { x: cellX + 1, y: cellY + 1 })
  const left = edgeKey({ x: cellX, y: cellY }, { x: cellX, y: cellY + 1 })
  const right = edgeKey({ x: cellX + 1, y: cellY }, { x: cellX + 1, y: cellY + 1 })
  if (usedEdges.has(top)) touched += 1
  if (usedEdges.has(bottom)) touched += 1
  if (usedEdges.has(left)) touched += 1
  if (usedEdges.has(right)) touched += 1
  return touched
}

export function generateTrianglesForEdges(
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

  const usedEdges = edgesFromPath(solutionPath)
  const candidates: Array<Omit<TriangleTarget, 'color'>> = []
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const touches = countTouchedCellEdges(usedEdges, x, y)
      if (touches < 1 || touches > 3) continue
      candidates.push({ cellX: x, cellY: y, count: touches as 1 | 2 | 3 })
    }
  }

  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 3 : 0
  const maxCount = lowSymbolSet ? 10 : 5
  const maxAllowed = Math.min(maxCount, candidates.length)
  if (maxAllowed < minCount) return null

  let targetCount: number
  if (!lowSymbolSet) {
    targetCount = randInt(rng, maxAllowed + 1)
  } else {
    const range = maxAllowed - minCount
    if (selectedSymbolCount === 2) {
      // Keep 3..10 possible, but bias strongly toward lower counts for mixed-symbol boards.
      const weighted = Math.floor(Math.pow(rng(), 1.85) * (range + 1))
      targetCount = minCount + Math.min(range, weighted)
    } else {
      targetCount = minCount + randInt(rng, range + 1)
    }
  }

  if (targetCount === 0) {
    return { triangles: [] as TriangleTarget[], solutionPath }
  }

  let palette = [DEFAULT_TRIANGLE_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      const desiredColors = 2
      palette = shuffle(COLOR_PALETTE, rng).slice(0, desiredColors)
    }
    if (palette.length === 0) palette = [DEFAULT_TRIANGLE_COLOR]
  }

  const triangles = shuffle(candidates, rng)
    .slice(0, targetCount)
    .map((target) => ({
      ...target,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_TRIANGLE_COLOR,
    }))
  return { triangles, solutionPath }
}

export function checkTriangles(usedEdges: Set<string>, triangleTargets: TriangleTarget[]) {
  return triangleTargets.every(
    (target) => countTouchedCellEdges(usedEdges, target.cellX, target.cellY) === target.count
  )
}
