import { MAX_INDEX, type Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgesFromPath,
  edgeKey,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type MinesweeperNumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type MinesweeperNumberTarget = {
  cellX: number
  cellY: number
  value: MinesweeperNumberValue
  color: string
}

const DEFAULT_MINESWEEPER_COLOR = '#8f939b'

const DIGIT_BITMAPS: Record<MinesweeperNumberValue, string[]> = {
  0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
}

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

export function minesweeperDigitPixels(value: MinesweeperNumberValue) {
  const rows = DIGIT_BITMAPS[value]
  const pixels: Array<{ x: number; y: number }> = []
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y]
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '1') pixels.push({ x, y })
    }
  }
  return pixels
}

export function countSeparatedNeighborCells(
  regions: Map<string, number>,
  cellX: number,
  cellY: number
) {
  const centerRegion = regions.get(`${cellX},${cellY}`)
  if (centerRegion === undefined) return 0

  let separated = 0
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = cellX + dx
      const ny = cellY + dy
      if (nx < 0 || nx >= MAX_INDEX || ny < 0 || ny >= MAX_INDEX) continue
      const neighborRegion = regions.get(`${nx},${ny}`)
      if (neighborRegion === undefined) continue
      if (neighborRegion !== centerRegion) separated += 1
    }
  }

  return separated
}

export function generateMinesweeperNumbersForEdges(
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
  const candidates: Array<Omit<MinesweeperNumberTarget, 'color'>> = []
  for (let y = 0; y < MAX_INDEX; y += 1) {
    for (let x = 0; x < MAX_INDEX; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const count = countSeparatedNeighborCells(regions, x, y)
      if (count < 0 || count > 7) continue
      candidates.push({
        cellX: x,
        cellY: y,
        value: count as MinesweeperNumberValue,
      })
    }
  }
  if (candidates.length === 0) return null

  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = 1
  const maxCount = lowSymbolSet ? 7 : 4
  const maxAllowed = Math.min(maxCount, candidates.length)
  if (maxAllowed < minCount) return null

  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)
  let palette = [DEFAULT_MINESWEEPER_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_MINESWEEPER_COLOR]
  }

  const targets = shuffle(candidates, rng)
    .slice(0, targetCount)
    .map((target) => ({
      ...target,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_MINESWEEPER_COLOR,
    }))
  return { targets, solutionPath }
}

export function checkMinesweeperNumbers(
  usedEdges: Set<string>,
  targets: MinesweeperNumberTarget[]
) {
  const regions = buildCellRegions(usedEdges)
  return targets.every(
    (target) => countSeparatedNeighborCells(regions, target.cellX, target.cellY) === target.value
  )
}
