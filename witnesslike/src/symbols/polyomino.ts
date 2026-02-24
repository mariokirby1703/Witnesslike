import { MAX_INDEX } from '../puzzleConstants'
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
  rotatable: boolean
  negative: boolean
}

const DEFAULT_POSITIVE_POLYOMINO_COLOR = '#f4c430'
export const NEGATIVE_POLYOMINO_COLOR = '#1f43ff'

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

function canonicalRotationKey(cells: Point[]) {
  let current = cells
  let canonical = ''
  for (let i = 0; i < 4; i += 1) {
    const normalized = normalizeCells(current)
    const key = cellsKey(normalized)
    if (!canonical || key < canonical) {
      canonical = key
    }
    current = rotateCells(current)
  }
  return canonical
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
const SHAPES_BY_SIZE = (() => {
  const bySize = new Map<number, PolyominoShape[]>()
  for (const shape of POLYOMINO_SHAPES) {
    if (!bySize.has(shape.size)) bySize.set(shape.size, [])
    bySize.get(shape.size)?.push(shape)
  }
  return bySize
})()

const ROTATION_VARIANTS_BY_CANONICAL = (() => {
  const byCanonical = new Map<string, PolyominoShape[]>()
  for (const shape of POLYOMINO_SHAPES) {
    const key = canonicalRotationKey(shape.cells)
    if (!byCanonical.has(key)) byCanonical.set(key, [])
    byCanonical.get(key)?.push(shape)
  }
  return byCanonical
})()

function rotationVariantsForShape(shape: PolyominoShape) {
  const key = canonicalRotationKey(shape.cells)
  const knownVariants = ROTATION_VARIANTS_BY_CANONICAL.get(key)
  if (knownVariants && knownVariants.length > 0) {
    return knownVariants
  }

  // Fallback for custom intro shapes that are not part of the generated catalog.
  const generated: PolyominoShape[] = []
  const seen = new Set<string>()
  let current = shape.cells
  for (let i = 0; i < 4; i += 1) {
    const normalized = normalizeCells(current)
    const cellSignature = cellsKey(normalized)
    if (!seen.has(cellSignature)) {
      seen.add(cellSignature)
      generated.push({
        id: `${shape.id}-rot-${i}`,
        cells: normalized,
        size: normalized.length,
      })
    }
    current = rotateCells(current)
  }

  return generated.length > 0 ? generated : [shape]
}

function listShapePlacements(
  shape: PolyominoShape,
  regionCells: Array<{ x: number; y: number }>,
  regionSet: Set<string>
) {
  const placements: Array<{ cells: string[]; shape: PolyominoShape }> = []
  const seen = new Set<string>()
  for (const anchor of regionCells) {
    for (const shapeCell of shape.cells) {
      const offsetX = anchor.x - shapeCell.x
      const offsetY = anchor.y - shapeCell.y
      const cells = shape.cells.map((cell) => ({
        x: cell.x + offsetX,
        y: cell.y + offsetY,
      }))
      if (!cells.every((cell) => regionSet.has(`${cell.x},${cell.y}`))) {
        continue
      }
      const placementCells = cells.map((cell) => `${cell.x},${cell.y}`)
      const placementKey = [...placementCells].sort().join('|')
      if (seen.has(placementKey)) continue
      seen.add(placementKey)
      placements.push({
        cells: placementCells,
        shape,
      })
    }
  }
  return placements
}

function listRequirementPlacements(
  symbol: PolyominoSymbol,
  regionCells: Array<{ x: number; y: number }>,
  regionSet: Set<string>
) {
  const shapes = symbol.rotatable ? rotationVariantsForShape(symbol.shape) : [symbol.shape]
  const placements: Array<{ cells: string[]; shape: PolyominoShape }> = []
  const seen = new Set<string>()

  for (const shape of shapes) {
    for (const placement of listShapePlacements(shape, regionCells, regionSet)) {
      const key = placement.cells.join('|')
      if (seen.has(key)) continue
      seen.add(key)
      placements.push(placement)
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

    const preferLargeFirst = rng() < 0.58
    const shuffled = shuffle(bestOptions, rng).sort((a, b) =>
      preferLargeFirst ? b.shape.size - a.shape.size : a.shape.size - b.shape.size
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

function canTileRegion(regionCells: Array<{ x: number; y: number }>, symbols: PolyominoSymbol[]) {
  const regionSet = new Set(regionCells.map((cell) => `${cell.x},${cell.y}`))
  const regionSize = regionCells.length
  const hasNegative = symbols.some((symbol) => symbol.negative)
  const positiveArea = symbols.reduce(
    (sum, symbol) => sum + (symbol.negative ? 0 : symbol.shape.cells.length),
    0
  )
  const negativeArea = symbols.reduce(
    (sum, symbol) => sum + (symbol.negative ? symbol.shape.cells.length : 0),
    0
  )
  const netArea = positiveArea - negativeArea
  if (!hasNegative && positiveArea !== regionSize) return false
  if (hasNegative && netArea < 0) return false
  if (hasNegative && netArea > 0 && netArea !== regionSize) return false

  const cellIndex = new Map<string, number>()
  regionCells.forEach((cell, idx) => cellIndex.set(`${cell.x},${cell.y}`, idx))

  if (!hasNegative) {
    const symbolPlacements = symbols.map((symbol) =>
      listRequirementPlacements(symbol, regionCells, regionSet).map((placement) =>
        placement.cells
          .map((cell) => cellIndex.get(cell))
          .filter((index): index is number => index !== undefined)
      )
    )
    if (symbolPlacements.some((placements) => placements.length === 0)) return false

    const order = symbols
      .map((symbol, idx) => ({ symbol, idx, count: symbolPlacements[idx].length }))
      .sort((a, b) => a.count - b.count)
    const orderedPlacements = order.map((entry) => symbolPlacements[entry.idx])

    const solveExact = (index: number, remaining: Set<number>): boolean => {
      if (index >= orderedPlacements.length) return remaining.size === 0
      for (const placement of orderedPlacements[index]) {
        if (!placement.every((cell) => remaining.has(cell))) continue
        const nextRemaining = new Set(remaining)
        for (const cell of placement) nextRemaining.delete(cell)
        if (solveExact(index + 1, nextRemaining)) return true
      }
      return false
    }

    return solveExact(0, new Set(Array.from({ length: regionSize }, (_, i) => i)))
  }

  if (!symbols.some((symbol) => !symbol.negative)) return false

  type GlobalPlacement = {
    boardCells: number[]
  }

  const boardIndex = new Map<string, number>()
  const boardCells: Array<{ x: number; y: number }> = []
  let nextBoardIndex = 0
  for (let y = 0; y < MAX_INDEX; y += 1) {
    for (let x = 0; x < MAX_INDEX; x += 1) {
      boardCells.push({ x, y })
      boardIndex.set(`${x},${y}`, nextBoardIndex)
      nextBoardIndex += 1
    }
  }
  const boardSize = boardCells.length
  const regionBoardCells = new Set<number>()
  for (const cell of regionCells) {
    const index = boardIndex.get(`${cell.x},${cell.y}`)
    if (index !== undefined) regionBoardCells.add(index)
  }

  const listGlobalPlacements = (symbol: PolyominoSymbol): GlobalPlacement[] => {
    const shapes = symbol.rotatable ? rotationVariantsForShape(symbol.shape) : [symbol.shape]
    const placements: GlobalPlacement[] = []
    const seen = new Set<string>()

    for (const shape of shapes) {
      for (const anchor of boardCells) {
        for (const shapeCell of shape.cells) {
          const offsetX = anchor.x - shapeCell.x
          const offsetY = anchor.y - shapeCell.y
          const absoluteCells = shape.cells.map((cell) => ({
            x: cell.x + offsetX,
            y: cell.y + offsetY,
          }))
          if (
            !absoluteCells.every(
              (cell) =>
                cell.x >= 0 &&
                cell.x < MAX_INDEX &&
                cell.y >= 0 &&
                cell.y < MAX_INDEX
            )
          ) {
            continue
          }
          const globalCells = absoluteCells.map((cell) => `${cell.x},${cell.y}`)
          const globalKey = [...globalCells].sort().join('|')
          if (seen.has(globalKey)) continue
          seen.add(globalKey)
          const absoluteBoardCells = absoluteCells
            .map((cell) => boardIndex.get(`${cell.x},${cell.y}`))
            .filter((index): index is number => index !== undefined)
          placements.push({
            boardCells: [...new Set(absoluteBoardCells)].sort((a, b) => a - b),
          })
        }
      }
    }

    return placements
  }

  const symbolPlacements = symbols.map((symbol) => listGlobalPlacements(symbol))
  if (symbolPlacements.some((placements) => placements.length === 0)) return false

  const order = symbols
    .map((symbol, idx) => ({ symbol, idx, count: symbolPlacements[idx].length }))
    .sort((a, b) => a.count - b.count)
  const orderedPlacements = order.map((entry) => symbolPlacements[entry.idx])
  const orderedSigns = order.map((entry) => (entry.symbol.negative ? -1 : 1))
  const targetNetByBoardCell = Array.from({ length: boardSize }, (_, index) =>
    netArea === 0 ? 0 : regionBoardCells.has(index) ? 1 : 0
  )

  const positiveCounts = Array.from({ length: boardSize }, () => 0)
  const negativeCounts = Array.from({ length: boardSize }, () => 0)
  const positiveCoverageBySymbol = orderedPlacements.map((placements, symbolIndex) => {
    const coverage = Array.from({ length: boardSize }, () => false)
    if (orderedSigns[symbolIndex] < 0) return coverage
    for (const placement of placements) {
      for (const index of placement.boardCells) {
        coverage[index] = true
      }
    }
    return coverage
  })
  const negativeCoverageBySymbol = orderedPlacements.map((placements, symbolIndex) => {
    const coverage = Array.from({ length: boardSize }, () => false)
    if (orderedSigns[symbolIndex] > 0) return coverage
    for (const placement of placements) {
      for (const index of placement.boardCells) {
        coverage[index] = true
      }
    }
    return coverage
  })

  const canStillReachTargetNet = (startIndex: number) => {
    for (let cell = 0; cell < boardSize; cell += 1) {
      let positivesLeft = 0
      let negativesLeft = 0
      for (let i = startIndex; i < orderedPlacements.length; i += 1) {
        if (orderedSigns[i] > 0 && positiveCoverageBySymbol[i][cell]) positivesLeft += 1
        if (orderedSigns[i] < 0 && negativeCoverageBySymbol[i][cell]) negativesLeft += 1
      }
      const net = positiveCounts[cell] - negativeCounts[cell]
      const minNet = net - negativesLeft
      const maxNet = net + positivesLeft
      const target = targetNetByBoardCell[cell]
      if (target < minNet || target > maxNet) return false
      if (negativeCounts[cell] > positiveCounts[cell] + positivesLeft) return false
    }
    return true
  }

  const solve = (index: number): boolean => {
    if (!canStillReachTargetNet(index)) return false
    if (index >= orderedPlacements.length) {
      for (let cell = 0; cell < boardSize; cell += 1) {
        if (negativeCounts[cell] > positiveCounts[cell]) return false
        const net = positiveCounts[cell] - negativeCounts[cell]
        if (net !== targetNetByBoardCell[cell]) return false
      }
      return true
    }

    const sign = orderedSigns[index]
    for (const placement of orderedPlacements[index]) {
      if (sign > 0) {
        for (const cell of placement.boardCells) positiveCounts[cell] += 1
      } else {
        for (const cell of placement.boardCells) negativeCounts[cell] += 1
      }
      if (solve(index + 1)) return true
      if (sign > 0) {
        for (const cell of placement.boardCells) positiveCounts[cell] -= 1
      } else {
        for (const cell of placement.boardCells) negativeCounts[cell] -= 1
      }
    }
    return false
  }

  return solve(0)
}

function buildRegionCellsForPath(path: Point[]) {
  const regions = buildCellRegions(edgesFromPath(path))
  const regionCells = new Map<number, Array<{ x: number; y: number }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }
  return { regions, regionCells }
}

export function buildPolyominoPalette(
  rng: () => number,
  colorSquares: ColorSquare[],
  starsActive: boolean
) {
  if (!starsActive) return [DEFAULT_POSITIVE_POLYOMINO_COLOR]

  const squareColors = Array.from(new Set(colorSquares.map((square) => square.color))).slice(0, 2)
  if (squareColors.length >= 2) return squareColors

  const palette = [...squareColors]
  const pool = shuffle(COLOR_PALETTE.filter((color) => !palette.includes(color)), rng)
  for (const color of pool) {
    if (palette.length >= 2) break
    palette.push(color)
  }
  return palette.length > 0 ? palette : [DEFAULT_POSITIVE_POLYOMINO_COLOR]
}

function generatePositivePolyominoSymbolsForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  rotatable: boolean,
  maxSymbols: number,
  preferredPath?: Point[],
  blockedRegionIds?: Set<number>
) {
  if (maxSymbols <= 0) return null
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 72, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const { regionCells } = buildRegionCellsForPath(solutionPath)
  const allRegions = Array.from(regionCells.entries()).map(([id, cells]) => ({ id, cells }))
  let candidateRegions = shuffle(
    allRegions.filter(
      (region) =>
        region.cells.length <= 12 &&
        (!blockedRegionIds || !blockedRegionIds.has(region.id))
    ),
    rng
  )
  if (candidateRegions.length === 0) {
    candidateRegions = shuffle(
      allRegions.filter((region) => !blockedRegionIds || !blockedRegionIds.has(region.id)),
      rng
    )
  }

  const additionalRegionBudget =
    candidateRegions.length >= 4 ? 3 : candidateRegions.length >= 2 ? 2 : 1
  const targetRegions = Math.min(
    candidateRegions.length,
    minRegions + randInt(rng, additionalRegionBudget)
  )
  if (candidateRegions.length < minRegions) return null

  const symbols: PolyominoSymbol[] = []
  const usedRegionIds: number[] = []
  let placedRegions = 0
  let totalArea = 0
  for (const region of candidateRegions) {
    if (placedRegions >= targetRegions) break
    if (symbols.length >= maxSymbols) break
    const tiling = tileRegionWithShapes(region.cells, rng)
    if (!tiling) continue
    const availableCells = shuffle(
      region.cells.filter((cell) => !usedIconCells.has(`${cell.x},${cell.y}`)),
      rng
    )
    if (availableCells.length < tiling.length) continue
    if (symbols.length + tiling.length > maxSymbols) continue
    for (let i = 0; i < tiling.length; i += 1) {
      const cell = availableCells[i]
      usedIconCells.add(`${cell.x},${cell.y}`)
      const color = colorPalette[randInt(rng, colorPalette.length)]
      symbols.push({
        cellX: cell.x,
        cellY: cell.y,
        shape: tiling[i],
        color,
        rotatable,
        negative: false,
      })
      totalArea += tiling[i].size
    }
    usedRegionIds.push(region.id)
    placedRegions += 1
  }

  if (placedRegions < minRegions) return null
  const minimumTotalArea = maxSymbols >= 3 ? 4 : maxSymbols === 2 ? 3 : 1
  if (totalArea < minimumTotalArea) return null

  return { symbols, solutionPath, usedRegionIds }
}

export function generatePolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  maxSymbols = 4,
  preferredPath?: Point[],
  blockedRegionIds?: Set<number>
) {
  return generatePositivePolyominoSymbolsForEdges(
    edges,
    seed,
    minRegions,
    usedIconCells,
    colorPalette,
    false,
    maxSymbols,
    preferredPath,
    blockedRegionIds
  )
}

export function generateRotatedPolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  maxSymbols = 4,
  preferredPath?: Point[],
  blockedRegionIds?: Set<number>
) {
  return generatePositivePolyominoSymbolsForEdges(
    edges,
    seed,
    minRegions,
    usedIconCells,
    colorPalette,
    true,
    maxSymbols,
    preferredPath,
    blockedRegionIds
  )
}

function pickNegativeShapeSize(
  rng: () => number,
  maxSize: number,
  minSize = 1,
  complexityBoost = 0
) {
  const clampedBoost = Math.max(0, Math.min(1, complexityBoost))
  const size1Weight = Math.max(8, Math.round(52 - 26 * clampedBoost))
  const size2Weight = Math.max(14, Math.round(30 - 6 * clampedBoost))
  const size3Weight = Math.round(12 + 18 * clampedBoost)
  const size4Weight = Math.round(6 + 14 * clampedBoost)
  const weightedSizes = [
    { size: 1, weight: size1Weight },
    { size: 2, weight: size2Weight },
    { size: 3, weight: size3Weight },
    { size: 4, weight: size4Weight },
  ].filter((entry) => entry.size <= maxSize && entry.size >= minSize)

  const totalWeight = weightedSizes.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return 1
  let pick = rng() * totalWeight
  for (const entry of weightedSizes) {
    pick -= entry.weight
    if (pick <= 0) return entry.size
  }
  return weightedSizes[weightedSizes.length - 1].size
}

function pickNegativePairShape(
  regionCells: Array<{ x: number; y: number }>,
  allowRotated: boolean,
  requireRotated: boolean,
  rng: () => number
) {
  const regionSet = new Set(regionCells.map((cell) => `${cell.x},${cell.y}`))
  const maxSize = Math.min(4, regionCells.length)
  const baseComplexityBoost =
    regionCells.length >= 10
      ? 1
      : regionCells.length >= 8
        ? 0.88
        : regionCells.length >= 6
          ? 0.68
          : regionCells.length >= 4
            ? 0.46
            : 0.2

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const attemptComplexityBoost = Math.max(0, baseComplexityBoost - attempt * 0.035)
    const size = pickNegativeShapeSize(rng, maxSize, 1, attemptComplexityBoost)
    const shapes = shuffle(SHAPES_BY_SIZE.get(size) ?? [], rng)
    for (const shape of shapes) {
      const hasMultipleRotations = rotationVariantsForShape(shape).length > 1
      const rotatable = requireRotated
        ? allowRotated
        : allowRotated && hasMultipleRotations && rng() < 0.45
      const probe: PolyominoSymbol = {
        cellX: 0,
        cellY: 0,
        shape,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable,
        negative: true,
      }
      if (listRequirementPlacements(probe, regionCells, regionSet).length > 0) {
        return { shape, rotatable }
      }
    }
  }

  return null
}

function pickPositivePairShape(
  regionCells: Array<{ x: number; y: number }>,
  rotatable: boolean,
  rng: () => number,
  avoidCanonicalShapeKey?: string
) {
  const regionSet = new Set(regionCells.map((cell) => `${cell.x},${cell.y}`))
  const maxSize = Math.min(4, regionCells.length)

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const size = pickNegativeShapeSize(rng, maxSize, 1)
    const shapes = shuffle(SHAPES_BY_SIZE.get(size) ?? [], rng)
    const preferred = avoidCanonicalShapeKey
      ? shapes.filter((shape) => canonicalRotationKey(shape.cells) !== avoidCanonicalShapeKey)
      : shapes
    const fallback = avoidCanonicalShapeKey
      ? shapes.filter((shape) => canonicalRotationKey(shape.cells) === avoidCanonicalShapeKey)
      : []

    for (const shape of [...preferred, ...fallback]) {
      const probe: PolyominoSymbol = {
        cellX: 0,
        cellY: 0,
        shape,
        color: DEFAULT_POSITIVE_POLYOMINO_COLOR,
        rotatable,
        negative: false,
      }
      if (listRequirementPlacements(probe, regionCells, regionSet).length > 0) {
        return { shape, rotatable }
      }
    }
  }

  return null
}

export function generateNegativePolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  positiveSymbols: PolyominoSymbol[],
  usedIconCells: Set<string>,
  colorPalette: string[],
  starsActive: boolean,
  pairedPositiveRotatable: boolean,
  allowRotatedNegative: boolean,
  requireRotatedNegative: boolean,
  maxNegativeSymbols = 4,
  maxExtraPositiveSymbols = 4,
  preferredPath?: Point[]
) {
  if (maxNegativeSymbols <= 0 || maxExtraPositiveSymbols <= 0) return null
  if (requireRotatedNegative && !allowRotatedNegative) return null
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 72, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const { regions, regionCells } = buildRegionCellsForPath(solutionPath)
  const regionFreeCells = new Map<number, Array<{ x: number; y: number }>>()
  for (const [regionId, cells] of regionCells.entries()) {
    const free = cells.filter((cell) => !usedIconCells.has(`${cell.x},${cell.y}`))
    if (free.length >= 2) {
      regionFreeCells.set(regionId, shuffle(free, rng))
    }
  }
  const regionSymbols = new Map<number, PolyominoSymbol[]>()
  for (const symbol of positiveSymbols) {
    const regionId = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (regionId === undefined) continue
    if (!regionSymbols.has(regionId)) regionSymbols.set(regionId, [])
    regionSymbols.get(regionId)?.push(symbol)
  }

  const pairCapacityByCells = Array.from(regionFreeCells.values()).reduce(
    (sum, free) => sum + Math.floor(free.length / 2),
    0
  )
  const pairLimit = Math.min(4, maxNegativeSymbols, maxExtraPositiveSymbols, pairCapacityByCells)
  if (pairLimit <= 0) return null

  const seededPositiveCount = positiveSymbols.filter((symbol) => !symbol.negative).length
  const twoPairBias = seededPositiveCount > 0 ? 0.72 : 0.58
  const minDesiredPairs = pairLimit >= 2 && rng() < twoPairBias ? 2 : 1
  let targetPairs = minDesiredPairs
  if (pairLimit >= 3 && rng() < 0.4) targetPairs += 1
  if (pairLimit >= 4 && rng() < 0.2) targetPairs += 1
  targetPairs = Math.min(targetPairs, pairLimit)

  const negativeSymbols: PolyominoSymbol[] = []
  const pairedPositiveSymbols: PolyominoSymbol[] = []

  for (let attempt = 0; attempt < 72 && negativeSymbols.length < targetPairs; attempt += 1) {
    const viableRegions = Array.from(regionFreeCells.entries())
      .filter(([, free]) => free.length >= 2)
      .map(([regionId]) => regionId)
    if (viableRegions.length === 0) break

    const regionId = viableRegions[randInt(rng, viableRegions.length)]
    const cells = regionCells.get(regionId)
    const free = regionFreeCells.get(regionId)
    if (!cells || !free || free.length < 2) continue

    const negativeShapeChoice = pickNegativePairShape(
      cells,
      allowRotatedNegative,
      requireRotatedNegative,
      rng
    )
    if (!negativeShapeChoice) continue
    const positiveShapeChoice = pickPositivePairShape(
      cells,
      pairedPositiveRotatable,
      rng,
      canonicalRotationKey(negativeShapeChoice.shape.cells)
    )
    if (!positiveShapeChoice) continue

    const iconCells = shuffle([...free], rng).slice(0, 2)
    if (iconCells.length < 2) continue

    const [positiveCell, negativeCell] = iconCells
    const positiveColor = colorPalette[randInt(rng, colorPalette.length)]
    const nextPositiveSymbol: PolyominoSymbol = {
      cellX: positiveCell.x,
      cellY: positiveCell.y,
      shape: positiveShapeChoice.shape,
      color: positiveColor,
      rotatable: positiveShapeChoice.rotatable,
      negative: false,
    }
    const nextNegativeSymbol: PolyominoSymbol = {
      cellX: negativeCell.x,
      cellY: negativeCell.y,
      shape: negativeShapeChoice.shape,
      color: starsActive
        ? colorPalette[randInt(rng, colorPalette.length)]
        : NEGATIVE_POLYOMINO_COLOR,
      rotatable: negativeShapeChoice.rotatable,
      negative: true,
    }

    const existingRegionSymbols = regionSymbols.get(regionId) ?? []
    if (!canTileRegion(cells, [...existingRegionSymbols, nextPositiveSymbol, nextNegativeSymbol])) {
      continue
    }

    pairedPositiveSymbols.push(nextPositiveSymbol)
    negativeSymbols.push(nextNegativeSymbol)
    if (!regionSymbols.has(regionId)) regionSymbols.set(regionId, [])
    const symbolsInRegion = regionSymbols.get(regionId)
    symbolsInRegion?.push(nextPositiveSymbol, nextNegativeSymbol)

    usedIconCells.add(`${positiveCell.x},${positiveCell.y}`)
    usedIconCells.add(`${negativeCell.x},${negativeCell.y}`)
    regionFreeCells.set(
      regionId,
      free.filter(
        (cell) =>
          !(cell.x === positiveCell.x && cell.y === positiveCell.y) &&
          !(cell.x === negativeCell.x && cell.y === negativeCell.y)
      )
    )
  }

  if (negativeSymbols.length < minDesiredPairs) return null
  return { negativeSymbols, pairedPositiveSymbols, solutionPath }
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
    if (!cells) return false
    if (!canTileRegion(cells, symbols)) return false
  }

  return true
}
