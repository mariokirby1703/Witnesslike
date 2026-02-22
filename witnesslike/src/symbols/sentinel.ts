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
import type { ArrowTarget } from './arrows'
import type { CardinalTarget } from './cardinal'
import type { ColorSquare } from './colorSquares'
import type { HexTarget } from './hexagon'
import type { MinesweeperNumberTarget } from './minesweeperNumbers'
import type { NegatorTarget } from './negator'
import type { PolyominoSymbol } from './polyomino'
import type { SpinnerTarget } from './spinner'
import type { StarTarget } from './stars'
import type { TriangleTarget } from './triangles'
import type { DotTarget } from './dots'
import type { DiamondTarget } from './diamonds'
import type { ChevronTarget } from './chevrons'
import type { WaterDropletTarget } from './waterDroplet'
import type { GhostTarget } from './ghost'
import type { CrystalTarget } from './crystals'
import type { ChipTarget } from './chips'
import type { DiceTarget } from './dice'
import type { BlackHoleTarget } from './blackHoles'
import type { OpenPentagonTarget } from './openPentagons'
import type { TallyMarkTarget } from './tallyMarks'
import type { EyeTarget } from './eyes'
import type { CompassTarget } from './compass'

export type SentinelDirection = 'up' | 'right' | 'down' | 'left'

export type SentinelTarget = {
  cellX: number
  cellY: number
  direction: SentinelDirection
  color: string
}

type SentinelSupportSymbols = {
  arrowTargets: ArrowTarget[]
  colorSquares: ColorSquare[]
  starTargets: StarTarget[]
  triangleTargets: TriangleTarget[]
  dotTargets: DotTarget[]
  diamondTargets: DiamondTarget[]
  chevronTargets: ChevronTarget[]
  minesweeperTargets: MinesweeperNumberTarget[]
  waterDropletTargets: WaterDropletTarget[]
  cardinalTargets: CardinalTarget[]
  spinnerTargets: SpinnerTarget[]
  ghostTargets: GhostTarget[]
  crystalTargets: CrystalTarget[]
  chipTargets: ChipTarget[]
  diceTargets: DiceTarget[]
  blackHoleTargets: BlackHoleTarget[]
  openPentagonTargets: OpenPentagonTarget[]
  tallyTargets?: TallyMarkTarget[]
  eyeTargets?: EyeTarget[]
  compassTargets?: CompassTarget[]
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  hexTargets: HexTarget[]
}

export type SentinelConstraintSymbols = SentinelSupportSymbols & {
  sentinelTargets: SentinelTarget[]
}

type ObservedSymbol = {
  x: number
  y: number
  regionIds: number[]
  sentinelIndex?: number
}

const DEFAULT_SENTINEL_COLOR = '#efe96f'
const SENTINEL_DIRECTIONS: SentinelDirection[] = ['up', 'right', 'down', 'left']
const GRID_MIN_CELL = 0
const GRID_MAX_CELL = 3

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function isInteger(value: number) {
  return Math.abs(value - Math.round(value)) < 1e-9
}

function regionIdsForBoardPoint(
  regions: Map<string, number>,
  point: Point
) {
  const ids = new Set<number>()
  const xInt = isInteger(point.x)
  const yInt = isInteger(point.y)

  const tryAdd = (cellX: number, cellY: number) => {
    if (cellX < 0 || cellX > 3 || cellY < 0 || cellY > 3) return
    const id = regions.get(`${cellX},${cellY}`)
    if (id !== undefined) ids.add(id)
  }

  if (xInt && yInt) {
    const x = Math.round(point.x)
    const y = Math.round(point.y)
    tryAdd(x - 1, y - 1)
    tryAdd(x, y - 1)
    tryAdd(x - 1, y)
    tryAdd(x, y)
    return Array.from(ids)
  }

  if (!xInt && yInt) {
    const left = Math.floor(point.x)
    const y = Math.round(point.y)
    tryAdd(left, y - 1)
    tryAdd(left, y)
    return Array.from(ids)
  }

  if (xInt && !yInt) {
    const x = Math.round(point.x)
    const top = Math.floor(point.y)
    tryAdd(x - 1, top)
    tryAdd(x, top)
    return Array.from(ids)
  }

  return []
}

function symbolIsInSentinelForbiddenSide(
  sentinel: Pick<SentinelTarget, 'cellX' | 'cellY' | 'direction'>,
  point: Pick<Point, 'x' | 'y'>
) {
  const sentinelX = sentinel.cellX + 0.5
  const sentinelY = sentinel.cellY + 0.5
  if (sentinel.direction === 'up') return point.y < sentinelY
  if (sentinel.direction === 'down') return point.y > sentinelY
  if (sentinel.direction === 'left') return point.x < sentinelX
  return point.x > sentinelX
}

function isOutwardFacing(cellX: number, cellY: number, direction: SentinelDirection) {
  if (direction === 'up') return cellY === GRID_MIN_CELL
  if (direction === 'down') return cellY === GRID_MAX_CELL
  if (direction === 'left') return cellX === GRID_MIN_CELL
  return cellX === GRID_MAX_CELL
}

function isEdgeCell(cellX: number, cellY: number) {
  return (
    cellX === GRID_MIN_CELL ||
    cellX === GRID_MAX_CELL ||
    cellY === GRID_MIN_CELL ||
    cellY === GRID_MAX_CELL
  )
}

function isCornerCell(cellX: number, cellY: number) {
  const xEdge = cellX === GRID_MIN_CELL || cellX === GRID_MAX_CELL
  const yEdge = cellY === GRID_MIN_CELL || cellY === GRID_MAX_CELL
  return xEdge && yEdge
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function pickDirectionWithOutwardBias(
  directions: SentinelDirection[],
  cellX: number,
  cellY: number,
  rng: () => number
) {
  const hasInwardAlternative = directions.some(
    (direction) => !isOutwardFacing(cellX, cellY, direction)
  )
  const weighted = directions.map((direction) => ({
    direction,
    weight: isOutwardFacing(cellX, cellY, direction) && hasInwardAlternative ? 0.24 : 1,
  }))
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let pick = rng() * totalWeight
  for (const entry of weighted) {
    pick -= entry.weight
    if (pick <= 0) return entry.direction
  }
  return weighted[weighted.length - 1]?.direction ?? directions[0]
}

function buildObservedSymbols(
  regions: Map<string, number>,
  symbols: SentinelConstraintSymbols
) {
  const observed: ObservedSymbol[] = []

  const addCellSymbol = (
    cellX: number,
    cellY: number,
    sentinelIndex?: number
  ) => {
    const region = regions.get(`${cellX},${cellY}`)
    if (region === undefined) return
    observed.push({
      x: cellX + 0.5,
      y: cellY + 0.5,
      regionIds: [region],
      sentinelIndex,
    })
  }

  for (const target of symbols.arrowTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.colorSquares) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.starTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.triangleTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.dotTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.diamondTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.chevronTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.minesweeperTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.waterDropletTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.cardinalTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.spinnerTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.ghostTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.crystalTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.chipTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.diceTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.blackHoleTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.openPentagonTargets) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.tallyTargets ?? []) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.eyeTargets ?? []) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.compassTargets ?? []) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.polyominoSymbols) addCellSymbol(target.cellX, target.cellY)
  for (const target of symbols.negatorTargets) addCellSymbol(target.cellX, target.cellY)
  symbols.sentinelTargets.forEach((target, index) => {
    addCellSymbol(target.cellX, target.cellY, index)
  })

  for (const target of symbols.hexTargets) {
    const regionIds = regionIdsForBoardPoint(regions, target.position)
    if (regionIds.length === 0) continue
    observed.push({
      x: target.position.x,
      y: target.position.y,
      regionIds,
    })
  }

  return observed
}

function validDirectionsForCell(
  cellX: number,
  cellY: number,
  region: number,
  observed: ObservedSymbol[],
  placedSentinels: SentinelTarget[],
  regions: Map<string, number>
) {
  const candidatePoint = { x: cellX + 0.5, y: cellY + 0.5 }
  for (const placedSentinel of placedSentinels) {
    const placedRegion = regions.get(`${placedSentinel.cellX},${placedSentinel.cellY}`)
    if (placedRegion === undefined || placedRegion !== region) continue
    if (symbolIsInSentinelForbiddenSide(placedSentinel, candidatePoint)) {
      return [] as SentinelDirection[]
    }
  }

  const probe: Pick<SentinelTarget, 'cellX' | 'cellY' | 'direction'> = {
    cellX,
    cellY,
    direction: 'up',
  }
  return SENTINEL_DIRECTIONS.filter((direction) => {
    probe.direction = direction
    return observed.every((symbol) => {
      if (!symbol.regionIds.includes(region)) return true
      return !symbolIsInSentinelForbiddenSide(probe, symbol)
    })
  })
}

export function collectFailingSentinelIndexes(
  usedEdges: Set<string>,
  symbols: SentinelConstraintSymbols
) {
  const failing = new Set<number>()
  if (symbols.sentinelTargets.length === 0) return failing
  const regions = buildCellRegions(usedEdges)
  const observed = buildObservedSymbols(regions, symbols)

  symbols.sentinelTargets.forEach((sentinel, index) => {
    const region = regions.get(`${sentinel.cellX},${sentinel.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    for (const symbol of observed) {
      if (symbol.sentinelIndex === index) continue
      if (!symbol.regionIds.includes(region)) continue
      if (symbolIsInSentinelForbiddenSide(sentinel, symbol)) {
        failing.add(index)
        return
      }
    }
  })

  return failing
}

export function checkSentinels(
  usedEdges: Set<string>,
  symbols: SentinelConstraintSymbols
) {
  return collectFailingSentinelIndexes(usedEdges, symbols).size === 0
}

export function generateSentinelsForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  starsActive: boolean,
  symbols: SentinelSupportSymbols,
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
  const regions = buildCellRegions(usedEdges)
  const availableCells = shuffle(
    Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4) })).filter(
      (cell) =>
        !blockedCells.has(`${cell.x},${cell.y}`) &&
        regions.has(`${cell.x},${cell.y}`)
    ),
    rng
  )
  if (availableCells.length === 0) return null

  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 3 : 2
  const maxCount = lowSymbolSet ? 7 : 4
  const maxAllowed = Math.min(maxCount, availableCells.length)
  if (maxAllowed < minCount) return null
  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)

  let palette = [DEFAULT_SENTINEL_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_SENTINEL_COLOR]
  }

  for (let attempt = 0; attempt < 54; attempt += 1) {
    const localRng = mulberry32(seed + 6121 + attempt * 131)
    const remainingCells = shuffle(availableCells, localRng)
    const sentinelTargets: SentinelTarget[] = []
    const currentSymbols: SentinelConstraintSymbols = {
      ...symbols,
      sentinelTargets,
    }
    const observed = buildObservedSymbols(regions, currentSymbols)
    const occupiedCells = Array.from(blockedCells).map((key) => {
      const [x, y] = key.split(',').map(Number)
      return { x, y }
    })
    const sparseBoard = blockedCells.size <= 3

    while (remainingCells.length > 0 && sentinelTargets.length < targetCount) {
      const nonEdgeRemaining = remainingCells.filter(
        (candidate) => !isEdgeCell(candidate.x, candidate.y)
      ).length
      const candidates: Array<{
        index: number
        cell: { x: number; y: number }
        direction: SentinelDirection
        score: number
      }> = []
      for (let index = 0; index < remainingCells.length; index += 1) {
        const cell = remainingCells[index]
        const region = regions.get(`${cell.x},${cell.y}`)
        if (region === undefined) continue
        const directions = validDirectionsForCell(
          cell.x,
          cell.y,
          region,
          observed,
          sentinelTargets,
          regions
        )
        if (directions.length === 0) continue
        const direction = pickDirectionWithOutwardBias(directions, cell.x, cell.y, localRng)
        const nearestDistance =
          occupiedCells.length === 0
            ? 4
            : occupiedCells.reduce(
                (best, occupied) => Math.min(best, manhattan(cell, occupied)),
                Number.POSITIVE_INFINITY
              )
        const hasEdgeAdjacent = occupiedCells.some(
          (occupied) => manhattan(cell, occupied) === 1
        )
        const hasDiagonalAdjacent = occupiedCells.some(
          (occupied) =>
            Math.abs(cell.x - occupied.x) === 1 &&
            Math.abs(cell.y - occupied.y) === 1
        )
        let score = nearestDistance * (sparseBoard ? 4.3 : 3.2)
        if (hasEdgeAdjacent) score -= sparseBoard ? 6 : 3.4
        if (hasDiagonalAdjacent) score -= sparseBoard ? 2.2 : 1.1
        if (isEdgeCell(cell.x, cell.y)) {
          const interiorAlternativeFactor = nonEdgeRemaining > 0 ? 1 : 0.28
          score -= (sparseBoard ? 2.8 : 1.9) * interiorAlternativeFactor
          if (isCornerCell(cell.x, cell.y)) {
            score -= (sparseBoard ? 1.45 : 0.95) * interiorAlternativeFactor
          }
          if (sentinelTargets.length === 0) {
            score -= (sparseBoard ? 0.9 : 0.55) * interiorAlternativeFactor
          }
        }
        score += localRng() * 0.9
        candidates.push({ index, cell, direction, score })
      }
      if (candidates.length === 0) break
      candidates.sort((a, b) => b.score - a.score)
      const topPool = candidates.slice(0, Math.min(3, candidates.length))
      const pick = topPool[randInt(localRng, topPool.length)] ?? topPool[0]
      const [chosen] = remainingCells.splice(pick.index, 1)
      if (!chosen) continue
      if (sentinelTargets.length >= targetCount) break
      const region = regions.get(`${chosen.x},${chosen.y}`)
      if (region === undefined) continue
      const nextSentinel: SentinelTarget = {
        cellX: chosen.x,
        cellY: chosen.y,
        direction: pick.direction,
        color: palette[randInt(localRng, palette.length)] ?? DEFAULT_SENTINEL_COLOR,
      }
      sentinelTargets.push(nextSentinel)
      occupiedCells.push({ x: chosen.x, y: chosen.y })
      observed.push({
        x: chosen.x + 0.5,
        y: chosen.y + 0.5,
        regionIds: [region],
        sentinelIndex: sentinelTargets.length - 1,
      })
    }

    if (sentinelTargets.length < targetCount) continue
    const finalSymbols: SentinelConstraintSymbols = {
      ...symbols,
      sentinelTargets,
    }
    if (checkSentinels(usedEdges, finalSymbols)) {
      return { targets: sentinelTargets, solutionPath }
    }
  }

  return null
}

export function sentinelDirectionAngle(direction: SentinelDirection) {
  if (direction === 'up') return 0
  if (direction === 'right') return 90
  if (direction === 'down') return 180
  return -90
}


