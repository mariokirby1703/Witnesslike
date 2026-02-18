import type { TileKind } from './HomePage'
import { END, START } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import { buildCellRegions, edgeKey, neighbors } from './puzzleUtils'
import { checkColorSquares } from './symbols/colorSquares'
import type { ColorSquare } from './symbols/colorSquares'
import { checkArrows, countArrowCrossings } from './symbols/arrows'
import type { ArrowTarget } from './symbols/arrows'
import { checkHexTargets } from './symbols/hexagon'
import type { HexTarget } from './symbols/hexagon'
import type { NegatorTarget } from './symbols/negator'
import { checkPolyominoes } from './symbols/polyomino'
import type { PolyominoSymbol } from './symbols/polyomino'
import { checkStars } from './symbols/stars'
import type { StarTarget } from './symbols/stars'
import { checkTriangles } from './symbols/triangles'
import type { TriangleTarget } from './symbols/triangles'

type SolverSymbols = {
  arrowTargets: ArrowTarget[]
  colorSquares: ColorSquare[]
  starTargets: StarTarget[]
  triangleTargets: TriangleTarget[]
  polyominoSymbols: PolyominoSymbol[]
  hexTargets: HexTarget[]
  negatorTargets: NegatorTarget[]
}

export type EliminatedSymbolRef =
  | { kind: 'arrow'; index: number }
  | { kind: 'color-square'; index: number }
  | { kind: 'star'; index: number }
  | { kind: 'triangle'; index: number }
  | { kind: 'polyomino'; index: number }
  | { kind: 'hexagon'; index: number }

export type ConstraintEvaluation = {
  ok: boolean
  eliminatedNegatorIndexes: number[]
  eliminatedSymbols: EliminatedSymbolRef[]
}

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
  symbols.polyominoSymbols.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))
  symbols.negatorTargets.forEach((target) => addColoredSymbol(target.cellX, target.cellY, target.color))

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
      symbols.negatorTargets
    )) {
      return false
    }
  }

  if (activeKinds.includes('triangles')) {
    if (!checkTriangles(usedEdges, symbols.triangleTargets)) return false
  }

  if (
    activeKinds.includes('polyomino') ||
    activeKinds.includes('rotated-polyomino') ||
    activeKinds.includes('negative-polyomino')
  ) {
    if (!checkPolyominoes(usedEdges, symbols.polyominoSymbols)) return false
  }

  return true
}

export function evaluatePathConstraints(
  path: Point[],
  usedEdges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols
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
    star: 0,
    arrow: 1,
    triangle: 2,
    'color-square': 3,
    hexagon: 4,
    polyomino: 5,
    negator: 6,
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
    return removableSymbols.filter(
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
        if (symbol.kind === 'polyomino') removedPolyominoes.add(symbol.index)
        if (symbol.kind === 'hexagon') removedHexagons.add(symbol.index)
        if (symbol.kind === 'negator') continue
      }

      return {
        arrowTargets: symbols.arrowTargets.filter((_, index) => !removedArrows.has(index)),
        colorSquares: symbols.colorSquares.filter((_, index) => !removedColorSquares.has(index)),
        starTargets: symbols.starTargets.filter((_, index) => !removedStars.has(index)),
        triangleTargets: symbols.triangleTargets.filter((_, index) => !removedTriangles.has(index)),
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
    for (const candidate of negatorCandidates[negatorIndex]) {
      const key = `${candidate.kind}:${candidate.index}`
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      chosenNegations.push({
        negatorIndex,
        target: { kind: candidate.kind, index: candidate.index },
      })
      const solved = search(negatorIndex + 1)
      if (solved) return solved
      chosenNegations.pop()
      usedKeys.delete(key)
    }
    return null
  }

  return search(0) ?? { ok: false, eliminatedNegatorIndexes: [], eliminatedSymbols: [] }
}

export function findAnyValidSolutionPath(
  edges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols
) {
  const path: Point[] = [START]
  const usedEdges = new Set<string>()
  const visitedNodes = new Set<string>([pointKey(START)])

  const dfs = (current: Point): boolean => {
    if (isAtEnd(current)) {
      return evaluatePathConstraints(path, usedEdges, activeKinds, symbols).ok
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
