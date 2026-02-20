import type { TileKind } from './HomePage'
import { END, NODE_COUNT, START } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import { buildCellRegions, edgeKey, neighbors } from './puzzleUtils'
import { checkColorSquares } from './symbols/colorSquares'
import type { ColorSquare } from './symbols/colorSquares'
import { checkCardinals, isCardinalBlockedAllDirections } from './symbols/cardinal'
import type { CardinalTarget } from './symbols/cardinal'
import { checkArrows, countArrowCrossings } from './symbols/arrows'
import type { ArrowTarget } from './symbols/arrows'
import { checkHexTargets } from './symbols/hexagon'
import type { HexTarget } from './symbols/hexagon'
import type { NegatorTarget } from './symbols/negator'
import { checkSentinels, collectFailingSentinelIndexes } from './symbols/sentinel'
import type { SentinelTarget } from './symbols/sentinel'
import { checkSpinners, collectFailingSpinnerIndexes } from './symbols/spinner'
import type { SpinnerTarget } from './symbols/spinner'
import { checkMinesweeperNumbers, countSeparatedNeighborCells } from './symbols/minesweeperNumbers'
import type { MinesweeperNumberTarget } from './symbols/minesweeperNumbers'
import { checkPolyominoes } from './symbols/polyomino'
import type { PolyominoSymbol } from './symbols/polyomino'
import { checkStars } from './symbols/stars'
import type { StarTarget } from './symbols/stars'
import { checkTriangles } from './symbols/triangles'
import type { TriangleTarget } from './symbols/triangles'
import { checkDots } from './symbols/dots'
import type { DotTarget } from './symbols/dots'
import { checkDiamonds, countTouchedCornerBends } from './symbols/diamonds'
import type { DiamondTarget } from './symbols/diamonds'
import { checkChevrons, countChevronRegionCells } from './symbols/chevrons'
import type { ChevronTarget } from './symbols/chevrons'
import { checkWaterDroplets, isWaterDropletContained } from './symbols/waterDroplet'
import type { WaterDropletTarget } from './symbols/waterDroplet'
import { checkGhosts, collectFailingGhostIndexes } from './symbols/ghost'
import type { GhostTarget } from './symbols/ghost'

type SolverSymbols = {
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
  polyominoSymbols: PolyominoSymbol[]
  hexTargets: HexTarget[]
  negatorTargets: NegatorTarget[]
  sentinelTargets: SentinelTarget[]
}

export type EliminatedSymbolRef =
  | { kind: 'arrow'; index: number }
  | { kind: 'color-square'; index: number }
  | { kind: 'star'; index: number }
  | { kind: 'triangle'; index: number }
  | { kind: 'dot'; index: number }
  | { kind: 'diamond'; index: number }
  | { kind: 'chevron'; index: number }
  | { kind: 'minesweeper'; index: number }
  | { kind: 'water-droplet'; index: number }
  | { kind: 'cardinal'; index: number }
  | { kind: 'spinner'; index: number }
  | { kind: 'sentinel'; index: number }
  | { kind: 'ghost'; index: number }
  | { kind: 'polyomino'; index: number }
  | { kind: 'hexagon'; index: number }

export type ConstraintEvaluation = {
  ok: boolean
  eliminatedNegatorIndexes: number[]
  eliminatedSymbols: EliminatedSymbolRef[]
}

type ConstraintEvalMode = 'minimal' | 'first'

type NegationTargetRef =
  | EliminatedSymbolRef
  | { kind: 'negator'; index: number }

type SelectedNegation = {
  negatorIndex: number
  target: NegationTargetRef
}

function eliminatedKey(symbol: NegationTargetRef) {
  return `${symbol.kind}:${symbol.index}`
}

function pointKey(point: Point) {
  return `${point.x},${point.y}`
}

function isAtEnd(point: Point) {
  return point.x === END.x && point.y === END.y
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

function buildFailingSymbolKeySet(
  path: Point[],
  usedEdges: Set<string>,
  symbols: SolverSymbols
) {
  const failing = new Set<string>()

  symbols.arrowTargets.forEach((target, index) => {
    if (countArrowCrossings(path, target) !== target.count) {
      failing.add(`arrow:${index}`)
    }
  })

  symbols.triangleTargets.forEach((target, index) => {
    if (countTouchedCellEdges(usedEdges, target.cellX, target.cellY) !== target.count) {
      failing.add(`triangle:${index}`)
    }
  })
  symbols.dotTargets.forEach((target, index) => {
    const touchedCorners = new Set<string>([
      `${target.cellX},${target.cellY}`,
      `${target.cellX + 1},${target.cellY}`,
      `${target.cellX},${target.cellY + 1}`,
      `${target.cellX + 1},${target.cellY + 1}`,
    ])
    let touchedCount = 0
    for (const point of path) {
      if (touchedCorners.has(`${point.x},${point.y}`)) touchedCount += 1
    }
    if (touchedCount !== target.count) {
      failing.add(`dot:${index}`)
    }
  })
  symbols.diamondTargets.forEach((target, index) => {
    if (countTouchedCornerBends(path, target.cellX, target.cellY) !== target.count) {
      failing.add(`diamond:${index}`)
    }
  })

  symbols.hexTargets.forEach((target, index) => {
    if (target.kind === 'edge') {
      if (!target.edgeKey || !usedEdges.has(target.edgeKey)) {
        failing.add(`hexagon:${index}`)
      }
      return
    }
    const touched = path.some(
      (point) => point.x === target.position.x && point.y === target.position.y
    )
    if (!touched) {
      failing.add(`hexagon:${index}`)
    }
  })

  const regions = buildCellRegions(usedEdges)
  symbols.chevronTargets.forEach((target, index) => {
    if (countChevronRegionCells(regions, target) !== target.count) {
      failing.add(`chevron:${index}`)
    }
  })

  symbols.minesweeperTargets.forEach((target, index) => {
    if (countSeparatedNeighborCells(regions, target.cellX, target.cellY) !== target.value) {
      failing.add(`minesweeper:${index}`)
    }
  })
  symbols.waterDropletTargets.forEach((target, index) => {
    if (!isWaterDropletContained(regions, target, usedEdges)) {
      failing.add(`water-droplet:${index}`)
    }
  })
  symbols.cardinalTargets.forEach((target, index) => {
    if (!isCardinalBlockedAllDirections(usedEdges, target.cellX, target.cellY)) {
      failing.add(`cardinal:${index}`)
    }
  })
  for (const index of collectFailingSpinnerIndexes(path, symbols.spinnerTargets)) {
    failing.add(`spinner:${index}`)
  }
  for (const index of collectFailingGhostIndexes(usedEdges, symbols.ghostTargets)) {
    failing.add(`ghost:${index}`)
  }
  for (const index of collectFailingSentinelIndexes(usedEdges, {
    arrowTargets: symbols.arrowTargets,
    colorSquares: symbols.colorSquares,
    starTargets: symbols.starTargets,
    triangleTargets: symbols.triangleTargets,
    dotTargets: symbols.dotTargets,
    diamondTargets: symbols.diamondTargets,
    chevronTargets: symbols.chevronTargets,
    minesweeperTargets: symbols.minesweeperTargets,
    waterDropletTargets: symbols.waterDropletTargets,
    cardinalTargets: symbols.cardinalTargets,
    spinnerTargets: symbols.spinnerTargets,
    ghostTargets: symbols.ghostTargets,
    polyominoSymbols: symbols.polyominoSymbols,
    negatorTargets: symbols.negatorTargets,
    hexTargets: symbols.hexTargets,
    sentinelTargets: symbols.sentinelTargets,
  })) {
    failing.add(`sentinel:${index}`)
  }

  const colorSquaresByRegion = new Map<number, Array<number>>()
  const regionColorSets = new Map<number, Set<string>>()
  symbols.colorSquares.forEach((square, index) => {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) return
    if (!colorSquaresByRegion.has(region)) colorSquaresByRegion.set(region, [])
    colorSquaresByRegion.get(region)?.push(index)
    if (!regionColorSets.has(region)) regionColorSets.set(region, new Set())
    regionColorSets.get(region)?.add(square.color)
  })
  for (const [region, colors] of regionColorSets.entries()) {
    if (colors.size <= 1) continue
    const indexes = colorSquaresByRegion.get(region) ?? []
    for (const index of indexes) {
      failing.add(`color-square:${index}`)
    }
  }

  const regionCounts = new Map<number, Map<string, { stars: number; symbols: number; starIndexes: number[] }>>()
  const ensureEntry = (region: number, color: string) => {
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) return null
    const entry = colorMap.get(color) ?? { stars: 0, symbols: 0, starIndexes: [] as number[] }
    colorMap.set(color, entry)
    return entry
  }

  symbols.starTargets.forEach((star, index) => {
    const region = regions.get(`${star.cellX},${star.cellY}`)
    if (region === undefined) return
    const entry = ensureEntry(region, star.color)
    if (!entry) return
    entry.stars += 1
    entry.starIndexes.push(index)
  })

  const addColoredSymbol = (cellX: number, cellY: number, color: string) => {
    const region = regions.get(`${cellX},${cellY}`)
    if (region === undefined) return
    const entry = ensureEntry(region, color)
    if (!entry) return
    entry.symbols += 1
  }

  symbols.arrowTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.colorSquares.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.triangleTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.dotTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.diamondTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.chevronTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.minesweeperTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.waterDropletTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.cardinalTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.spinnerTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.ghostTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.polyominoSymbols.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.negatorTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.sentinelTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))

  for (const colorMap of regionCounts.values()) {
    for (const entry of colorMap.values()) {
      if (entry.stars === 0) continue
      if (entry.stars + entry.symbols === 2) continue
      for (const starIndex of entry.starIndexes) {
        failing.add(`star:${starIndex}`)
      }
    }
  }

  return failing
}

function satisfiesBaseConstraints(
  path: Point[],
  usedEdges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols
) {
  if (activeKinds.includes('arrows')) {
    if (!checkArrows(path, symbols.arrowTargets)) return false
  }

  if (activeKinds.includes('hexagon')) {
    if (!checkHexTargets(path, usedEdges, symbols.hexTargets)) return false
  }

  if (activeKinds.includes('color-squares')) {
    if (!checkColorSquares(usedEdges, symbols.colorSquares)) return false
  }

  if (activeKinds.includes('stars')) {
    if (!checkStars(
      usedEdges,
      symbols.starTargets,
      symbols.arrowTargets,
      symbols.colorSquares,
      symbols.polyominoSymbols,
      symbols.triangleTargets,
      symbols.dotTargets,
      symbols.diamondTargets,
      symbols.chevronTargets,
      symbols.minesweeperTargets,
      symbols.waterDropletTargets,
      symbols.cardinalTargets,
      symbols.spinnerTargets,
      symbols.ghostTargets,
      symbols.negatorTargets,
      symbols.sentinelTargets
    )) {
      return false
    }
  }

  if (activeKinds.includes('triangles')) {
    if (!checkTriangles(usedEdges, symbols.triangleTargets)) return false
  }

  if (activeKinds.includes('dots')) {
    if (!checkDots(path, symbols.dotTargets)) return false
  }

  if (activeKinds.includes('diamonds')) {
    if (!checkDiamonds(path, symbols.diamondTargets)) return false
  }

  if (activeKinds.includes('chevrons')) {
    if (!checkChevrons(usedEdges, symbols.chevronTargets)) return false
  }

  if (activeKinds.includes('minesweeper-numbers')) {
    if (!checkMinesweeperNumbers(usedEdges, symbols.minesweeperTargets)) return false
  }

  if (activeKinds.includes('water-droplet')) {
    if (!checkWaterDroplets(usedEdges, symbols.waterDropletTargets)) return false
  }

  if (activeKinds.includes('cardinal')) {
    if (!checkCardinals(usedEdges, symbols.cardinalTargets)) return false
  }

  if (activeKinds.includes('spinner')) {
    if (!checkSpinners(path, symbols.spinnerTargets)) return false
  }

  if (activeKinds.includes('ghost')) {
    if (!checkGhosts(usedEdges, symbols.ghostTargets)) return false
  }

  if (activeKinds.includes('sentinel')) {
    if (!checkSentinels(usedEdges, {
      arrowTargets: symbols.arrowTargets,
      colorSquares: symbols.colorSquares,
      starTargets: symbols.starTargets,
      triangleTargets: symbols.triangleTargets,
      dotTargets: symbols.dotTargets,
      diamondTargets: symbols.diamondTargets,
      chevronTargets: symbols.chevronTargets,
      minesweeperTargets: symbols.minesweeperTargets,
      waterDropletTargets: symbols.waterDropletTargets,
      cardinalTargets: symbols.cardinalTargets,
      spinnerTargets: symbols.spinnerTargets,
      ghostTargets: symbols.ghostTargets,
      polyominoSymbols: symbols.polyominoSymbols,
      negatorTargets: symbols.negatorTargets,
      hexTargets: symbols.hexTargets,
      sentinelTargets: symbols.sentinelTargets,
    })) {
      return false
    }
  }

  if (
    activeKinds.includes('polyomino') ||
    activeKinds.includes('rotated-polyomino') ||
    activeKinds.includes('negative-polyomino') ||
    activeKinds.includes('rotated-negative-polyomino')
  ) {
    if (!checkPolyominoes(usedEdges, symbols.polyominoSymbols)) return false
  }

  return true
}

export function evaluatePathConstraints(
  path: Point[],
  usedEdges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols,
  mode: ConstraintEvalMode = 'minimal'
): ConstraintEvaluation {
  const noNegatorResult = {
    ok: satisfiesBaseConstraints(path, usedEdges, activeKinds, symbols),
    eliminatedNegatorIndexes: [] as number[],
    eliminatedSymbols: [] as EliminatedSymbolRef[],
  }
  if (!activeKinds.includes('negator')) {
    return noNegatorResult
  }
  if (symbols.negatorTargets.length === 0) {
    return { ok: false, eliminatedNegatorIndexes: [], eliminatedSymbols: [] }
  }

  const regions = buildCellRegions(usedEdges)
  const removableSymbols: Array<NegationTargetRef & { region: number }> = []
  const failingKeys = buildFailingSymbolKeySet(path, usedEdges, symbols)
  const candidateKindPriority: Record<NegationTargetRef['kind'], number> = {
    negator: 99,
    star: 1,
    arrow: 2,
    chevron: 3,
    triangle: 4,
    dot: 5,
    diamond: 6,
    minesweeper: 7,
    'water-droplet': 8,
    cardinal: 9,
    spinner: 10,
    sentinel: 11,
    ghost: 12,
    'color-square': 13,
    hexagon: 14,
    polyomino: 15,
  }

  symbols.arrowTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'arrow', index, region })
  })
  symbols.colorSquares.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'color-square', index, region })
  })
  symbols.starTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'star', index, region })
  })
  symbols.triangleTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'triangle', index, region })
  })
  symbols.dotTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'dot', index, region })
  })
  symbols.diamondTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'diamond', index, region })
  })
  symbols.chevronTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'chevron', index, region })
  })
  symbols.minesweeperTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'minesweeper', index, region })
  })
  symbols.waterDropletTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'water-droplet', index, region })
  })
  symbols.cardinalTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'cardinal', index, region })
  })
  symbols.spinnerTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'spinner', index, region })
  })
  symbols.ghostTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'ghost', index, region })
  })
  symbols.sentinelTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'sentinel', index, region })
  })
  symbols.polyominoSymbols.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'polyomino', index, region })
  })
  symbols.hexTargets.forEach((target, index) => {
    const regionIds = regionIdsForBoardPoint(regions, target.position)
    for (const region of regionIds) {
      removableSymbols.push({ kind: 'hexagon', index, region })
    }
  })
  symbols.negatorTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    removableSymbols.push({ kind: 'negator', index, region })
  })
  const negatorCandidates = symbols.negatorTargets.map((target, negatorIndex) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return [] as Array<NegationTargetRef & { region: number }>
    const sortedCandidates = removableSymbols.filter(
      (symbol) =>
        symbol.region === region &&
        !(symbol.kind === 'negator' && symbol.index === negatorIndex)
    ).sort((a, b) => {
      const aKey = `${a.kind}:${a.index}`
      const bKey = `${b.kind}:${b.index}`
      const aFailing = failingKeys.has(aKey) ? 1 : 0
      const bFailing = failingKeys.has(bKey) ? 1 : 0
      if (aFailing !== bFailing) return bFailing - aFailing
      return candidateKindPriority[a.kind] - candidateKindPriority[b.kind]
    })
    const nonNegatorCandidates = sortedCandidates.filter((candidate) => candidate.kind !== 'negator')
    const negatorOnlyCandidates = sortedCandidates.filter((candidate) => candidate.kind === 'negator')
    return [...nonNegatorCandidates, ...negatorOnlyCandidates]
  })

  if (negatorCandidates.some((candidates) => candidates.length === 0)) {
    return { ok: false, eliminatedNegatorIndexes: [], eliminatedSymbols: [] }
  }

  const chosenNegations: SelectedNegation[] = []
  const usedKeys = new Set<string>()

  const testSelection = () => {
    const buildFilteredSymbols = (
      restoredSymbolKey?: string,
      restoredNegatorIndex?: number
    ): SolverSymbols => {
      const removedColorSquares = new Set<number>()
      const removedArrows = new Set<number>()
      const removedStars = new Set<number>()
      const removedTriangles = new Set<number>()
      const removedDots = new Set<number>()
      const removedDiamonds = new Set<number>()
      const removedChevrons = new Set<number>()
      const removedMinesweeper = new Set<number>()
      const removedWaterDroplets = new Set<number>()
      const removedCardinals = new Set<number>()
      const removedSpinners = new Set<number>()
      const removedGhosts = new Set<number>()
      const removedSentinels = new Set<number>()
      const removedPolyominoes = new Set<number>()
      const removedHexagons = new Set<number>()
      const removedNegators = new Set<number>(
        symbols.negatorTargets.map((_, index) => index)
      )
      if (restoredNegatorIndex !== undefined) {
        removedNegators.delete(restoredNegatorIndex)
      }

      for (const selected of chosenNegations) {
        const symbol = selected.target
        if (eliminatedKey(symbol) === restoredSymbolKey) continue
        if (symbol.kind === 'arrow') removedArrows.add(symbol.index)
        if (symbol.kind === 'color-square') removedColorSquares.add(symbol.index)
        if (symbol.kind === 'star') removedStars.add(symbol.index)
        if (symbol.kind === 'triangle') removedTriangles.add(symbol.index)
        if (symbol.kind === 'dot') removedDots.add(symbol.index)
        if (symbol.kind === 'diamond') removedDiamonds.add(symbol.index)
        if (symbol.kind === 'chevron') removedChevrons.add(symbol.index)
        if (symbol.kind === 'minesweeper') removedMinesweeper.add(symbol.index)
        if (symbol.kind === 'water-droplet') removedWaterDroplets.add(symbol.index)
        if (symbol.kind === 'cardinal') removedCardinals.add(symbol.index)
        if (symbol.kind === 'spinner') removedSpinners.add(symbol.index)
        if (symbol.kind === 'ghost') removedGhosts.add(symbol.index)
        if (symbol.kind === 'sentinel') removedSentinels.add(symbol.index)
        if (symbol.kind === 'polyomino') removedPolyominoes.add(symbol.index)
        if (symbol.kind === 'hexagon') removedHexagons.add(symbol.index)
        if (symbol.kind === 'negator') continue
      }

      return {
        arrowTargets: symbols.arrowTargets.filter((_, index) => !removedArrows.has(index)),
        colorSquares: symbols.colorSquares.filter((_, index) => !removedColorSquares.has(index)),
        starTargets: symbols.starTargets.filter((_, index) => !removedStars.has(index)),
        triangleTargets: symbols.triangleTargets.filter((_, index) => !removedTriangles.has(index)),
        dotTargets: symbols.dotTargets.filter((_, index) => !removedDots.has(index)),
        diamondTargets: symbols.diamondTargets.filter((_, index) => !removedDiamonds.has(index)),
        chevronTargets: symbols.chevronTargets.filter((_, index) => !removedChevrons.has(index)),
        minesweeperTargets: symbols.minesweeperTargets.filter((_, index) => !removedMinesweeper.has(index)),
        waterDropletTargets: symbols.waterDropletTargets.filter((_, index) => !removedWaterDroplets.has(index)),
        cardinalTargets: symbols.cardinalTargets.filter((_, index) => !removedCardinals.has(index)),
        spinnerTargets: symbols.spinnerTargets.filter((_, index) => !removedSpinners.has(index)),
        ghostTargets: symbols.ghostTargets.filter((_, index) => !removedGhosts.has(index)),
        sentinelTargets: symbols.sentinelTargets.filter((_, index) => !removedSentinels.has(index)),
        polyominoSymbols: symbols.polyominoSymbols.filter((_, index) => !removedPolyominoes.has(index)),
        hexTargets: symbols.hexTargets.filter((_, index) => !removedHexagons.has(index)),
        negatorTargets: symbols.negatorTargets.filter((_, index) => !removedNegators.has(index)),
      }
    }

    const filtered = buildFilteredSymbols()

    if (!satisfiesBaseConstraints(path, usedEdges, activeKinds, filtered)) return null

    const chosenTargets = chosenNegations.map((selected) => selected.target)
    const hasNegatorTarget = chosenTargets.some((symbol) => symbol.kind === 'negator')
    const hasNonNegatorTarget = chosenTargets.some((symbol) => symbol.kind !== 'negator')
    // Negator-vs-negator cancellation is only valid when all negations are between
    // negators. Mixed chains (e.g. one removes hex, the other removes a negator)
    // are not allowed.
    if (hasNegatorTarget && hasNonNegatorTarget) return null

    // Removed non-negator symbols must be necessary for satisfying base constraints.
    for (const selected of chosenNegations) {
      const symbol = selected.target
      if (symbol.kind === 'negator') continue
      const restored = buildFilteredSymbols(
        eliminatedKey(symbol),
        selected.negatorIndex
      )
      if (satisfiesBaseConstraints(path, usedEdges, activeKinds, restored)) {
        return null
      }
    }

    return {
      ok: true,
      eliminatedNegatorIndexes: symbols.negatorTargets.map((_, index) => index),
      eliminatedSymbols: chosenTargets.filter(
        (symbol): symbol is EliminatedSymbolRef => symbol.kind !== 'negator'
      ),
    } satisfies ConstraintEvaluation
  }

  const search = (negatorIndex: number): ConstraintEvaluation | null => {
    if (negatorIndex >= negatorCandidates.length) {
      return testSelection()
    }
    let best: ConstraintEvaluation | null = null
    for (const candidate of negatorCandidates[negatorIndex]) {
      const key = `${candidate.kind}:${candidate.index}`
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      chosenNegations.push({
        negatorIndex,
        target: { kind: candidate.kind, index: candidate.index },
      })
      const solved = search(negatorIndex + 1)
      if (mode === 'first' && solved) {
        chosenNegations.pop()
        usedKeys.delete(key)
        return solved
      }
      if (
        solved &&
        (!best || solved.eliminatedSymbols.length < best.eliminatedSymbols.length)
      ) {
        best = solved
      }
      chosenNegations.pop()
      usedKeys.delete(key)
    }
    return best
  }

  return search(0) ?? { ok: false, eliminatedNegatorIndexes: [], eliminatedSymbols: [] }
}

export function findAnyValidSolutionPath(
  edges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols,
  maxVisitedNodes = Number.POSITIVE_INFINITY
) {
  const path: Point[] = [START]
  const usedEdges = new Set<string>()
  const visitedNodes = new Set<string>([pointKey(START)])
  let visitedCount = 0
  let aborted = false

  const dfs = (current: Point): boolean => {
    if (aborted) return false
    visitedCount += 1
    if (visitedCount > maxVisitedNodes) {
      aborted = true
      return false
    }

    if (isAtEnd(current)) {
      return evaluatePathConstraints(path, usedEdges, activeKinds, symbols, 'first').ok
    }

    const nextNodes = neighbors(current).sort((a, b) => {
      const aDistance = Math.abs(END.x - a.x) + Math.abs(END.y - a.y)
      const bDistance = Math.abs(END.x - b.x) + Math.abs(END.y - b.y)
      return aDistance - bDistance
    })

    for (const next of nextNodes) {
      const key = edgeKey(current, next)
      if (!edges.has(key)) continue

      const nextKey = pointKey(next)
      if (visitedNodes.has(nextKey)) continue

      visitedNodes.add(nextKey)
      usedEdges.add(key)
      path.push(next)

      if (dfs(next)) return true

      path.pop()
      usedEdges.delete(key)
      visitedNodes.delete(nextKey)
    }

    return false
  }

  if (!dfs(START)) return null
  return [...path]
}

type StepDirection = 'R' | 'L' | 'U' | 'D'

function stepDirection(from: Point, to: Point): StepDirection {
  if (to.x > from.x) return 'R'
  if (to.x < from.x) return 'L'
  if (to.y > from.y) return 'D'
  return 'U'
}

function manhattanDistanceToEnd(point: Point) {
  return Math.abs(END.x - point.x) + Math.abs(END.y - point.y)
}

export function findSimplestValidSolutionPath(
  edges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols,
  maxVisitedNodes = Number.POSITIVE_INFINITY
) {
  const path: Point[] = [START]
  const usedEdges = new Set<string>()
  const visitedNodes = new Set<string>([pointKey(START)])
  const minimumEdgeCount = manhattanDistanceToEnd(START)
  const maximumEdgeCount = NODE_COUNT * NODE_COUNT - 1
  const requiredParity = minimumEdgeCount % 2
  let visitedCount = 0
  let aborted = false

  const searchForExactEdgeCount = (edgeLimit: number) => {
    let bestPath: Point[] | null = null
    let bestTurnCount = Number.POSITIVE_INFINITY

    const dfs = (
      current: Point,
      previousDirection: StepDirection | null,
      turnCount: number
    ) => {
      if (aborted) return

      visitedCount += 1
      if (visitedCount > maxVisitedNodes) {
        aborted = true
        return
      }

      const usedEdgeCount = path.length - 1
      const remainingDistance = manhattanDistanceToEnd(current)
      if (usedEdgeCount + remainingDistance > edgeLimit) return

      if (isAtEnd(current)) {
        if (usedEdgeCount !== edgeLimit) return
        const evaluation = evaluatePathConstraints(path, usedEdges, activeKinds, symbols, 'first')
        if (!evaluation.ok) return
        if (turnCount < bestTurnCount) {
          bestTurnCount = turnCount
          bestPath = [...path]
        }
        return
      }

      if (turnCount >= bestTurnCount) return

      const nextNodes = neighbors(current)
        .filter((next) => edges.has(edgeKey(current, next)) && !visitedNodes.has(pointKey(next)))
        .map((next) => {
          const direction = stepDirection(current, next)
          const distance = manhattanDistanceToEnd(next)
          const turnPenalty =
            previousDirection && previousDirection !== direction ? 1 : 0
          return { next, direction, distance, turnPenalty }
        })
        .sort((a, b) => {
          if (a.distance !== b.distance) return a.distance - b.distance
          if (a.turnPenalty !== b.turnPenalty) return a.turnPenalty - b.turnPenalty
          if (a.next.y !== b.next.y) return a.next.y - b.next.y
          return a.next.x - b.next.x
        })

      for (const candidate of nextNodes) {
        const edge = edgeKey(current, candidate.next)
        const nextTurnCount = turnCount + candidate.turnPenalty
        if (nextTurnCount >= bestTurnCount) continue
        visitedNodes.add(pointKey(candidate.next))
        usedEdges.add(edge)
        path.push(candidate.next)
        dfs(candidate.next, candidate.direction, nextTurnCount)
        path.pop()
        usedEdges.delete(edge)
        visitedNodes.delete(pointKey(candidate.next))
        if (aborted) return
      }
    }

    dfs(START, null, 0)
    return bestPath
  }

  for (let edgeLimit = minimumEdgeCount; edgeLimit <= maximumEdgeCount; edgeLimit += 1) {
    if (edgeLimit % 2 !== requiredParity) continue
    const solved = searchForExactEdgeCount(edgeLimit)
    if (solved) return solved
    if (aborted) return null
  }

  return null
}
