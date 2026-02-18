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
  return ROTATION_VARIANTS_BY_CANONICAL.get(key) ?? [shape]
}

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

    const shuffled = shuffle(bestOptions, rng).sort((a, b) => b.shape.size - a.shape.size)
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
  const cellIndex = new Map<string, number>()
  regionCells.forEach((cell, idx) => cellIndex.set(`${cell.x},${cell.y}`, idx))

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
  const orderedSigns = order.map((entry) => (entry.symbol.negative ? -1 : 1))

  // Legacy polyomino behavior (no negatives): region must be tiled exactly once.
  if (!hasNegative) {
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

  // Negative behavior: every symbol is mandatory.
  // Region cells are evaluated by net coverage (positive - negative), and each
  // cell must end at exactly 1 coverage.
  const positiveCounts = Array.from({ length: regionSize }, () => 0)
  const negativeCounts = Array.from({ length: regionSize }, () => 0)
  const positiveCoverageBySymbol = orderedPlacements.map((placements, symbolIndex) => {
    const coverage = Array.from({ length: regionSize }, () => false)
    if (orderedSigns[symbolIndex] < 0) return coverage
    for (const placement of placements) {
      for (const index of placement) {
        coverage[index] = true
      }
    }
    return coverage
  })
  const negativeCoverageBySymbol = orderedPlacements.map((placements, symbolIndex) => {
    const coverage = Array.from({ length: regionSize }, () => false)
    if (orderedSigns[symbolIndex] > 0) return coverage
    for (const placement of placements) {
      for (const index of placement) {
        coverage[index] = true
      }
    }
    return coverage
  })

  const canStillReachExactCoverage = (startIndex: number) => {
    for (let cell = 0; cell < regionSize; cell += 1) {
      let positivesLeft = 0
      let negativesLeft = 0
      for (let i = startIndex; i < orderedPlacements.length; i += 1) {
        if (orderedSigns[i] > 0 && positiveCoverageBySymbol[i][cell]) positivesLeft += 1
        if (orderedSigns[i] < 0 && negativeCoverageBySymbol[i][cell]) negativesLeft += 1
      }
      const net = positiveCounts[cell] - negativeCounts[cell]
      const minNet = net - negativesLeft
      const maxNet = net + positivesLeft
      if (1 < minNet || 1 > maxNet) return false
    }
    return true
  }

  const solve = (index: number): boolean => {
    if (!canStillReachExactCoverage(index)) return false
    if (index >= orderedPlacements.length) {
      for (let cell = 0; cell < regionSize; cell += 1) {
        if (positiveCounts[cell] - negativeCounts[cell] !== 1) return false
      }
      return true
    }

    const sign = orderedSigns[index]
    for (const placement of orderedPlacements[index]) {
      if (sign > 0) {
        for (const cell of placement) positiveCounts[cell] += 1
      } else {
        for (const cell of placement) negativeCounts[cell] += 1
      }
      if (solve(index + 1)) return true
      if (sign > 0) {
        for (const cell of placement) positiveCounts[cell] -= 1
      } else {
        for (const cell of placement) negativeCounts[cell] -= 1
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
  preferredPath?: Point[]
) {
  if (maxSymbols <= 0) return null
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 200, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const { regionCells } = buildRegionCellsForPath(solutionPath)
  const candidateRegions = shuffle(
    Array.from(regionCells.entries())
      .map(([id, cells]) => ({ id, cells }))
      .filter((region) => region.cells.length <= 10),
    rng
  )

  const targetRegions = Math.min(candidateRegions.length, minRegions + randInt(rng, 2))
  if (candidateRegions.length < minRegions) return null

  const symbols: PolyominoSymbol[] = []
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
    placedRegions += 1
  }

  if (placedRegions < minRegions) return null
  if (totalArea < 4) return null

  return { symbols, solutionPath }
}

export function generatePolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  maxSymbols = 4,
  preferredPath?: Point[]
) {
  return generatePositivePolyominoSymbolsForEdges(
    edges,
    seed,
    minRegions,
    usedIconCells,
    colorPalette,
    false,
    maxSymbols,
    preferredPath
  )
}

export function generateRotatedPolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  minRegions: number,
  usedIconCells: Set<string>,
  colorPalette: string[],
  maxSymbols = 4,
  preferredPath?: Point[]
) {
  return generatePositivePolyominoSymbolsForEdges(
    edges,
    seed,
    minRegions,
    usedIconCells,
    colorPalette,
    true,
    maxSymbols,
    preferredPath
  )
}

function pickNegativeShapeSize(rng: () => number, maxSize: number, minSize = 1) {
  const weightedSizes = [
    { size: 1, weight: 64 },
    { size: 2, weight: 31 },
    { size: 3, weight: 4 },
    { size: 4, weight: 1 },
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
  const minSize = requireRotated ? 2 : 1

  for (let attempt = 0; attempt < 42; attempt += 1) {
    const size = pickNegativeShapeSize(rng, maxSize, minSize)
    const shapes = shuffle(SHAPES_BY_SIZE.get(size) ?? [], rng)
    for (const shape of shapes) {
      const hasMultipleRotations = rotationVariantsForShape(shape).length > 1
      if (requireRotated && !hasMultipleRotations) continue
      const rotatable = requireRotated
        ? allowRotated && hasMultipleRotations
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

export function generateNegativePolyominoesForEdges(
  edges: Set<string>,
  seed: number,
  positiveSymbols: PolyominoSymbol[],
  usedIconCells: Set<string>,
  colorPalette: string[],
  starsActive: boolean,
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
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 200, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const { regions, regionCells } = buildRegionCellsForPath(solutionPath)
  const positiveByRegion = new Map<number, PolyominoSymbol[]>()
  for (const symbol of positiveSymbols) {
    if (symbol.negative) continue
    const region = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (region === undefined) continue
    if (!positiveByRegion.has(region)) positiveByRegion.set(region, [])
    positiveByRegion.get(region)?.push(symbol)
  }

  const regionFreeCells = new Map<number, Array<{ x: number; y: number }>>()
  for (const [regionId, cells] of regionCells.entries()) {
    if (!positiveByRegion.has(regionId)) continue
    const free = cells.filter((cell) => !usedIconCells.has(`${cell.x},${cell.y}`))
    if (free.length >= 2) {
      regionFreeCells.set(regionId, shuffle(free, rng))
    }
  }

  const pairCapacityByCells = Array.from(regionFreeCells.values()).reduce(
    (sum, free) => sum + Math.floor(free.length / 2),
    0
  )
  const pairLimit = Math.min(4, maxNegativeSymbols, maxExtraPositiveSymbols, pairCapacityByCells)
  if (pairLimit <= 0) return null

  let targetPairs = 1
  if (pairLimit >= 2 && rng() < 0.34) targetPairs += 1
  if (pairLimit >= 3 && rng() < 0.13) targetPairs += 1
  if (pairLimit >= 4 && rng() < 0.05) targetPairs += 1
  targetPairs = Math.min(targetPairs, pairLimit)

  const negativeSymbols: PolyominoSymbol[] = []
  const pairedPositiveSymbols: PolyominoSymbol[] = []

  for (let attempt = 0; attempt < 90 && negativeSymbols.length < targetPairs; attempt += 1) {
    const viableRegions = Array.from(regionFreeCells.entries())
      .filter(([, free]) => free.length >= 2)
      .map(([regionId]) => regionId)
    if (viableRegions.length === 0) break

    const regionId = viableRegions[randInt(rng, viableRegions.length)]
    const cells = regionCells.get(regionId)
    const free = regionFreeCells.get(regionId)
    if (!cells || !free || free.length < 2) continue

    const shapeChoice = pickNegativePairShape(
      cells,
      allowRotatedNegative,
      requireRotatedNegative,
      rng
    )
    if (!shapeChoice) continue

    const iconCells = shuffle([...free], rng).slice(0, 2)
    if (iconCells.length < 2) continue

    const [positiveCell, negativeCell] = iconCells
    const positiveColor = colorPalette[randInt(rng, colorPalette.length)]
    pairedPositiveSymbols.push({
      cellX: positiveCell.x,
      cellY: positiveCell.y,
      shape: shapeChoice.shape,
      color: positiveColor,
      rotatable: shapeChoice.rotatable,
      negative: false,
    })
    negativeSymbols.push({
      cellX: negativeCell.x,
      cellY: negativeCell.y,
      shape: shapeChoice.shape,
      color: starsActive
        ? colorPalette[randInt(rng, colorPalette.length)]
        : NEGATIVE_POLYOMINO_COLOR,
      rotatable: shapeChoice.rotatable,
      negative: true,
    })

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

  if (negativeSymbols.length === 0) return null
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
