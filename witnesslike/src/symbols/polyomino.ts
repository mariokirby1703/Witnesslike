import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgesFromPath,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'
import type { ColorSquare } from './colorSquares'

export type PolyominoShape = {
  id: string
  cells: Point[]
  size: number
}

export type PolyominoSymbol = {
  cellX: number
  cellY: number
  shape: PolyominoShape
  color: string
}

const DEFAULT_POLYOMINO_COLOR = '#f4c430'

function normalizeCells(cells: Point[]) {
  const minX = Math.min(...cells.map((cell) => cell.x))
  const minY = Math.min(...cells.map((cell) => cell.y))
  return cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
}

function cellsKey(cells: Point[]) {
  const sorted = [...cells].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
  return sorted.map((cell) => `${cell.x},${cell.y}`).join('|')
}

function rotateCells(cells: Point[]) {
  return cells.map((cell) => ({ x: -cell.y, y: cell.x }))
}

function buildPolyominoShapes() {
  const baseShapes: Array<{ id: string; cells: Point[] }> = [
    { id: 'mono', cells: [{ x: 0, y: 0 }] },
    { id: 'domino', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { id: 'tri-line', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
    { id: 'tri-l', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    { id: 'tet-line', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    { id: 'tet-square', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    { id: 'tet-l', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
    { id: 'tet-t', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
    { id: 'tet-s', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  ]

  const shapes: PolyominoShape[] = []
  const seen = new Set<string>()

  for (const base of baseShapes) {
    let current = base.cells
    for (let i = 0; i < 4; i += 1) {
      const normalized = normalizeCells(current)
      const key = cellsKey(normalized)
      if (!seen.has(key)) {
        seen.add(key)
        shapes.push({ id: `${base.id}-${i}`, cells: normalized, size: normalized.length })
      }
      current = rotateCells(current)
    }
  }

  return shapes
}

const POLYOMINO_SHAPES = buildPolyominoShapes()

function listShapePlacements(
  shape: PolyominoShape,
  regionCells: Array<{ x: number; y: number }>,
  regionSet: Set<string>
) {
  const placements: Array<{ cells: string[]; shape: PolyominoShape }> = []
  for (const anchor of regionCells) {
    const cells = shape.cells.map((cell) => ({
      x: cell.x + anchor.x,
      y: cell.y + anchor.y,
    }))
    if (cells.every((cell) => regionSet.has(`${cell.x},${cell.y}`))) {
      placements.push({
        cells: cells.map((cell) => `${cell.x},${cell.y}`),
        shape,
      })
    }
  }
  return placements
}

function tileRegionWithShapes(
  regionCells: Array<{ x: number; y: number }>,
  rng: () => number
) {
  const regionSet = new Set(regionCells.map((cell) => `${cell.x},${cell.y}`))
  const shapes = [...POLYOMINO_SHAPES].sort((a, b) => b.size - a.size)

  const placementsByCell = new Map<string, Array<{ cells: string[]; shape: PolyominoShape }>>()
  for (const shape of shapes) {
    const placements = listShapePlacements(shape, regionCells, regionSet)
    for (const placement of placements) {
      for (const cell of placement.cells) {
        if (!placementsByCell.has(cell)) placementsByCell.set(cell, [])
        placementsByCell.get(cell)?.push(placement)
      }
    }
  }

  const solve = (remaining: Set<string>): PolyominoShape[] | null => {
    if (remaining.size === 0) return []
    let bestOptions: Array<{ cells: string[]; shape: PolyominoShape }> | null = null
    for (const cell of remaining) {
      const options = placementsByCell.get(cell) ?? []
      if (!bestOptions || options.length < bestOptions.length) {
        bestOptions = options
        if (options.length <= 1) break
      }
    }
    if (!bestOptions || bestOptions.length === 0) return null

    const shuffled = shuffle(bestOptions, rng).sort(
      (a, b) => b.shape.size - a.shape.size
    )
    for (const placement of shuffled) {
      if (!placement.cells.every((cell) => remaining.has(cell))) continue
      const nextRemaining = new Set(remaining)
      for (const cell of placement.cells) {
        nextRemaining.delete(cell)
      }
      const result = solve(nextRemaining)
      if (result) {
        return [placement.shape, ...result]
      }
    }
    return null
  }

  return solve(regionSet)
}

function canTileRegion(regionCells: Array<{ x: number; y: number }>, shapes: PolyominoShape[]) {
  const regionSet = new Set(regionCells.map((cell) => `${cell.x},${cell.y}`))
  const totalArea = shapes.reduce((sum, shape) => sum + shape.size, 0)
  if (totalArea !== regionCells.length) return false

  const shapePlacements = shapes.map((shape) =>
    listShapePlacements(shape, regionCells, regionSet)
  )
  if (shapePlacements.some((placements) => placements.length === 0)) return false

  const order = shapes
    .map((shape, idx) => ({ shape, idx, count: shapePlacements[idx].length }))
    .sort((a, b) => a.count - b.count)

  const solve = (index: number, remaining: Set<string>): boolean => {
    if (index >= order.length) return remaining.size === 0
    const { idx } = order[index]
    for (const placement of shapePlacements[idx]) {
      if (!placement.cells.every((cell) => remaining.has(cell))) continue
      const nextRemaining = new Set(remaining)
      for (const cell of placement.cells) {
        nextRemaining.delete(cell)
      }
      if (solve(index + 1, nextRemaining)) return true
    }
    return false
  }

  return solve(0, regionSet)
}

export function buildPolyominoPalette(
  rng: () => number,
  colorSquares: ColorSquare[],
  starsActive: boolean
) {
  if (!starsActive) return [DEFAULT_POLYOMINO_COLOR]

  const squareColors = Array.from(new Set(colorSquares.map((square) => square.color)))
  if (squareColors.length >= 2) return squareColors

  const paletteSize = 2 + randInt(rng, 2)
  const palette = [...squareColors]
  const pool = shuffle(COLOR_PALETTE.filter((color) => !palette.includes(color)), rng)
  for (const color of pool) {
    if (palette.length >= paletteSize) break
    palette.push(color)
  }
  return palette.length > 0 ? palette : [DEFAULT_POLYOMINO_COLOR]
}

export function generatePolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 200, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const regions = buildCellRegions(edgesFromPath(solutionPath))
  const regionCells = new Map<number, Array<{ x: number; y: number }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }

  const candidateRegions = shuffle(
    Array.from(regionCells.entries())
      .map(([id, cells]) => ({ id, cells }))
      .filter((region) => region.cells.length <= 10),
    rng
  )

  const targetRegions = Math.min(
    candidateRegions.length,
    minRegions + randInt(rng, 2)
  )
  if (candidateRegions.length < minRegions) return null

  const symbols: PolyominoSymbol[] = []
  let placedRegions = 0
  let totalArea = 0
  for (const region of candidateRegions) {
    if (placedRegions >= targetRegions) break
    const tiling = tileRegionWithShapes(region.cells, rng)
    if (!tiling) continue
    const availableCells = shuffle(
      region.cells.filter((cell) => !usedIconCells.has(`${cell.x},${cell.y}`)),
      rng
    )
    if (availableCells.length < tiling.length) continue
    if (symbols.length + tiling.length > 4) continue
    for (let i = 0; i < tiling.length; i += 1) {
      const cell = availableCells[i]
      usedIconCells.add(`${cell.x},${cell.y}`)
      const color = colorPalette[randInt(rng, colorPalette.length)]
      symbols.push({ cellX: cell.x, cellY: cell.y, shape: tiling[i], color })
      totalArea += tiling[i].size
    }
    placedRegions += 1
  }

  if (placedRegions < minRegions) return null
  if (totalArea < 4) return null

  return { symbols, solutionPath }
}

export function checkPolyominoes(usedEdges: Set<string>, polyominoSymbols: PolyominoSymbol[]) {
  const regions = buildCellRegions(usedEdges)
  const regionCells = new Map<number, Array<{ x: number; y: number }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }

  const polyByRegion = new Map<number, PolyominoSymbol[]>()
  for (const symbol of polyominoSymbols) {
    const region = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (region === undefined) continue
    if (!polyByRegion.has(region)) polyByRegion.set(region, [])
    polyByRegion.get(region)?.push(symbol)
  }

  for (const [regionId, symbols] of polyByRegion.entries()) {
    const cells = regionCells.get(regionId)
    if (!cells) {
      return false
    }
    const shapes = symbols.map((symbol) => symbol.shape)
    if (!canTileRegion(cells, shapes)) {
      return false
    }
  }

  return true
}
