import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tile, TileKind } from './HomePage'
import { END, END_CAP_LENGTH, GAP_SIZE, START, VIEWBOX } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import {
  COLOR_PALETTE,
  buildEdges,
  buildFullEdges,
  closestPointOnSegment,
  distance,
  edgeKey,
  edgesFromPath,
  hasPath,
  hexPoints,
  listAllEdges,
  mulberry32,
  neighbors,
  shapeBounds,
  shuffle,
  starPoints,
} from './puzzleUtils'
import { evaluatePathConstraints, findAnyValidSolutionPath } from './puzzleSolver'
import type { ArrowTarget } from './symbols/arrows'
import { arrowDirectionAngle, generateArrowsForEdges } from './symbols/arrows'
import type { ColorSquare } from './symbols/colorSquares'
import { generateColorSquaresForEdges } from './symbols/colorSquares'
import type { HexTarget } from './symbols/hexagon'
import { generateHexTargets } from './symbols/hexagon'
import type { NegatorTarget } from './symbols/negator'
import { generateNegatorsForEdges } from './symbols/negator'
import type { StarTarget } from './symbols/stars'
import { generateStarsForEdges } from './symbols/stars'
import type { TriangleTarget } from './symbols/triangles'
import { generateTrianglesForEdges } from './symbols/triangles'
import type { PolyominoSymbol } from './symbols/polyomino'
import {
  buildPolyominoPalette,
  generateNegativePolyominoesForEdges,
  generatePolyominoesForEdges,
  generateRotatedPolyominoesForEdges,
} from './symbols/polyomino'

type Puzzle = {
  edges: Set<string>
}

type Result = 'idle' | 'success' | 'fail'

type PuzzlePageProps = {
  selectedTiles: Tile[]
  onBack: () => void
}

const MAX_POLYOMINO_SYMBOLS = 4
const MAX_NEGATIVE_POLYOMINO_SYMBOLS = 4
const MAX_SYMBOL_COLORS = 3

type Eliminations = {
  negators: number[]
  arrows: number[]
  colorSquares: number[]
  stars: number[]
  triangles: number[]
  polyominoes: number[]
  hexagons: number[]
}

function emptyEliminations(): Eliminations {
  return {
    negators: [],
    arrows: [],
    colorSquares: [],
    stars: [],
    triangles: [],
    polyominoes: [],
    hexagons: [],
  }
}

function mapEliminations(
  eliminatedNegatorIndexes: number[],
  eliminatedSymbols: Array<
    { kind: 'arrow'; index: number } |
    { kind: 'color-square'; index: number } |
    { kind: 'star'; index: number } |
    { kind: 'triangle'; index: number } |
    { kind: 'polyomino'; index: number } |
    { kind: 'hexagon'; index: number }
  >
): Eliminations {
  const mapped = emptyEliminations()
  mapped.negators = [...eliminatedNegatorIndexes]
  for (const symbol of eliminatedSymbols) {
    if (symbol.kind === 'arrow') mapped.arrows.push(symbol.index)
    if (symbol.kind === 'color-square') mapped.colorSquares.push(symbol.index)
    if (symbol.kind === 'star') mapped.stars.push(symbol.index)
    if (symbol.kind === 'triangle') mapped.triangles.push(symbol.index)
    if (symbol.kind === 'polyomino') mapped.polyominoes.push(symbol.index)
    if (symbol.kind === 'hexagon') mapped.hexagons.push(symbol.index)
  }
  return mapped
}

function generatePuzzle(seed: number): Puzzle {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = mulberry32(seed + attempt * 97)
    const edges = buildEdges(rng)
    if (hasPath(edges)) {
      return { edges }
    }
  }
  const fallbackEdges = buildEdges(mulberry32(seed))
  return { edges: fallbackEdges }
}

function pickActiveKinds(kinds: TileKind[], rng: () => number) {
  if (kinds.length <= 1) return kinds
  const active = kinds.filter(() => rng() < 0.6)
  if (active.length >= 2) return active
  return shuffle(kinds, rng).slice(0, 2)
}

function trianglePoints(centerX: number, centerY: number, size: number) {
  const halfWidth = size * 0.9
  return `${centerX},${centerY - size} ${centerX - halfWidth},${centerY + size * 0.72} ${centerX + halfWidth},${centerY + size * 0.72}`
}

function buildColorSquarePool(rng: () => number) {
  return shuffle(COLOR_PALETTE, rng).slice(0, MAX_SYMBOL_COLORS)
}

function countSymbolColors(
  arrowTargets: ArrowTarget[],
  colorSquares: ColorSquare[],
  starTargets: StarTarget[],
  triangleTargets: TriangleTarget[],
  polyominoSymbols: PolyominoSymbol[],
  negatorTargets: NegatorTarget[],
  includeNegatorColors = true
) {
  const colors = new Set<string>()
  for (const arrow of arrowTargets) colors.add(arrow.color)
  for (const square of colorSquares) colors.add(square.color)
  for (const star of starTargets) colors.add(star.color)
  for (const triangle of triangleTargets) colors.add(triangle.color)
  for (const symbol of polyominoSymbols) colors.add(symbol.color)
  if (includeNegatorColors) {
    for (const negator of negatorTargets) colors.add(negator.color)
  }
  return colors.size
}

function PuzzlePage({ selectedTiles, onBack }: PuzzlePageProps) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [path, setPath] = useState<Point[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [result, setResult] = useState<Result>('idle')
  const [eliminations, setEliminations] = useState<Eliminations>(() => emptyEliminations())
  const [lastSolved, setLastSolved] = useState<{
    seed: number
    path: Point[]
    eliminations: Eliminations
  } | null>(null)
  const boardRef = useRef<SVGSVGElement | null>(null)
  const solveTraceTimerRef = useRef<number | null>(null)

  const selectedKinds = useMemo<TileKind[]>(
    () => selectedTiles.map((tile) => tile.kind).filter((kind) => kind !== 'placeholder'),
    [selectedTiles]
  )

  const allEdges = useMemo(() => listAllEdges(), [])

  const { puzzle, activeKinds, arrowTargets, colorSquares, starTargets, triangleTargets, polyominoSymbols, negatorTargets, hexTargets } = useMemo(() => {
    const baseKinds = selectedKinds.length > 0 ? selectedKinds : (['gap-line'] as TileKind[])
    const minActive = baseKinds.length >= 2 ? 2 : 1
    const mustIncludeRotatedPolyomino =
      baseKinds.includes('polyomino') && baseKinds.includes('rotated-polyomino')
    const requireRotatedNegativePolyomino =
      baseKinds.includes('negative-polyomino') &&
      baseKinds.includes('rotated-polyomino') &&
      !baseKinds.includes('polyomino')
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const rng = mulberry32(seed + attempt * 313 + 11)
      const mustKeepAllSymbols = baseKinds.length >= 3
      let active: TileKind[]

      if (baseKinds.length >= 2) {
        if (mustKeepAllSymbols || attempt < 50) {
          active = [...baseKinds]
        } else if (attempt < 70) {
          active = shuffle(baseKinds, rng).slice(0, baseKinds.length - 1)
        } else {
          active = pickActiveKinds(baseKinds, rng)
        }
      } else {
        active = [...baseKinds]
      }

      if (
        active.includes('negative-polyomino') &&
        !active.includes('polyomino') &&
        !active.includes('rotated-polyomino')
      ) {
        active = active.filter((kind) => kind !== 'negative-polyomino')
      }

      let edges = active.includes('gap-line')
        ? generatePuzzle(seed + attempt * 131).edges
        : buildFullEdges()

      let arrowTargets: ArrowTarget[] = []
      let colorSquares: ColorSquare[] = []
      let starTargets: StarTarget[] = []
      let triangleTargets: TriangleTarget[] = []
      let polyominoSymbols: PolyominoSymbol[] = []
      let negatorTargets: NegatorTarget[] = []
      let solutionPath: Point[] | null = null

      if (active.includes('color-squares')) {
        const colorSquarePool = active.includes('stars')
          ? undefined
          : buildColorSquarePool(rng)
        const baseDesiredColorCount = active.includes('stars') ? 2 : rng() < 0.5 ? 2 : 3
        const desiredColorCount = Math.max(
          1,
          Math.min(baseDesiredColorCount, colorSquarePool?.length ?? baseDesiredColorCount)
        )
        let colorResult = generateColorSquaresForEdges(
          edges,
          seed + attempt * 2001,
          desiredColorCount,
          baseKinds.length,
          colorSquarePool
        )

        if (!colorResult && active.includes('gap-line')) {
          const fullEdges = buildFullEdges()
          const retry = generateColorSquaresForEdges(
            fullEdges,
            seed + attempt * 2001 + 99,
            desiredColorCount,
            baseKinds.length,
            colorSquarePool
          )
          if (retry) {
            edges = fullEdges
            colorResult = retry
            active = active.filter((kind) => kind !== 'gap-line')
          }
        }

        if (colorResult) {
          colorSquares = colorResult.squares
          solutionPath = colorResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'color-squares')
        }
      }

      if (
        active.includes('polyomino') ||
        active.includes('rotated-polyomino') ||
        active.includes('negative-polyomino')
      ) {
        const baseUsedCells = new Set<string>(colorSquares.map((square) => `${square.cellX},${square.cellY}`))
        let usedPolyCells = new Set(baseUsedCells)
        const polyPalette = buildPolyominoPalette(
          rng,
          colorSquares,
          active.includes('stars')
        )
        const minRegions = 1

        if (active.includes('polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const fixedSlotsLeftRaw = MAX_POLYOMINO_SYMBOLS - currentPositiveCount
          const reserveForRotated =
            mustIncludeRotatedPolyomino && active.includes('rotated-polyomino') ? 1 : 0
          const fixedSlotsLeft = Math.max(0, fixedSlotsLeftRaw - reserveForRotated)
          if (fixedSlotsLeft <= 0) {
            active = active.filter((kind) => kind !== 'polyomino')
          }
          let usedForFixed = new Set(usedPolyCells)
          let polyResult =
            fixedSlotsLeft > 0
              ? generatePolyominoesForEdges(
                  edges,
                  seed + attempt * 9107,
                  minRegions,
                  usedForFixed,
                  polyPalette,
                  fixedSlotsLeft,
                  solutionPath ?? undefined
                )
              : null

          if (!polyResult && active.includes('gap-line')) {
            const fullEdges = buildFullEdges()
            usedForFixed = new Set(usedPolyCells)
            const retry =
              fixedSlotsLeft > 0
                ? generatePolyominoesForEdges(
                    fullEdges,
                    seed + attempt * 9107 + 31,
                    minRegions,
                    usedForFixed,
                    polyPalette,
                    fixedSlotsLeft,
                    solutionPath ?? undefined
                  )
                : null
            if (retry) {
              edges = fullEdges
              polyResult = retry
              active = active.filter((kind) => kind !== 'gap-line')
            }
          }

          if (polyResult) {
            polyominoSymbols = [...polyominoSymbols, ...polyResult.symbols]
            usedPolyCells = usedForFixed
            solutionPath = solutionPath ?? polyResult.solutionPath
          } else {
            active = active.filter((kind) => kind !== 'polyomino')
          }
        }

        if (active.includes('rotated-polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const rotatedSlotsLeft = MAX_POLYOMINO_SYMBOLS - currentPositiveCount
          if (rotatedSlotsLeft <= 0) {
            active = active.filter((kind) => kind !== 'rotated-polyomino')
          }
          let usedForRotated = new Set(usedPolyCells)
          let rotatedResult =
            rotatedSlotsLeft > 0
              ? generateRotatedPolyominoesForEdges(
                  edges,
                  seed + attempt * 12121,
                  minRegions,
                  usedForRotated,
                  polyPalette,
                  rotatedSlotsLeft,
                  solutionPath ?? undefined
                )
              : null

          if (!rotatedResult && active.includes('gap-line')) {
            const fullEdges = buildFullEdges()
            usedForRotated = new Set(usedPolyCells)
            const retry =
              rotatedSlotsLeft > 0
                ? generateRotatedPolyominoesForEdges(
                    fullEdges,
                    seed + attempt * 12121 + 31,
                    minRegions,
                    usedForRotated,
                    polyPalette,
                    rotatedSlotsLeft,
                    solutionPath ?? undefined
                  )
                : null
            if (retry) {
              edges = fullEdges
              rotatedResult = retry
              active = active.filter((kind) => kind !== 'gap-line')
            }
          }

          if (rotatedResult) {
            polyominoSymbols = [...polyominoSymbols, ...rotatedResult.symbols]
            usedPolyCells = usedForRotated
            solutionPath = solutionPath ?? rotatedResult.solutionPath
          } else {
            active = active.filter((kind) => kind !== 'rotated-polyomino')
          }
        }

        if (mustIncludeRotatedPolyomino) {
          if (!active.includes('rotated-polyomino')) continue
          if (!polyominoSymbols.some((symbol) => symbol.rotatable)) continue
        }

        if (active.includes('negative-polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const extraPositiveSlots = Math.max(0, MAX_POLYOMINO_SYMBOLS - currentPositiveCount)
          if (extraPositiveSlots <= 0) {
            active = active.filter((kind) => kind !== 'negative-polyomino')
          } else {
            const negativeResult = generateNegativePolyominoesForEdges(
              edges,
              seed + attempt * 17041,
              polyominoSymbols.filter((symbol) => !symbol.negative),
              usedPolyCells,
              polyPalette,
              active.includes('stars'),
              active.includes('rotated-polyomino'),
              requireRotatedNegativePolyomino,
              MAX_NEGATIVE_POLYOMINO_SYMBOLS,
              extraPositiveSlots,
              solutionPath ?? undefined
            )

            if (negativeResult) {
              polyominoSymbols = [
                ...polyominoSymbols,
                ...negativeResult.pairedPositiveSymbols,
                ...negativeResult.negativeSymbols,
              ]
              solutionPath = solutionPath ?? negativeResult.solutionPath
            } else {
              active = active.filter((kind) => kind !== 'negative-polyomino')
            }
          }
        }
      }

      if (active.includes('triangles')) {
        const blockedTriangleCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredTriangleColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const triangleResult = generateTrianglesForEdges(
          edges,
          seed + attempt * 23011,
          baseKinds.length,
          blockedTriangleCells,
          active.includes('stars'),
          preferredTriangleColors,
          solutionPath ?? undefined
        )
        if (triangleResult) {
          triangleTargets = triangleResult.triangles
          solutionPath = solutionPath ?? triangleResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'triangles')
        }
      }

      if (active.includes('arrows')) {
        const blockedArrowCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredArrowColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const arrowResult = generateArrowsForEdges(
          edges,
          seed + attempt * 26053,
          baseKinds.length,
          blockedArrowCells,
          active.includes('stars'),
          preferredArrowColors,
          solutionPath ?? undefined
        )
        if (arrowResult) {
          arrowTargets = arrowResult.arrows
          solutionPath = solutionPath ?? arrowResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'arrows')
        }
      }

      if (active.includes('stars')) {
        const minPairs =
          baseKinds.length === 1 && baseKinds[0] === 'stars'
            ? 3
            : baseKinds.length <= 2
              ? 2
              : 1
        const starResult = generateStarsForEdges(
          edges,
          seed + attempt * 5003,
          minPairs,
          active.includes('arrows') ? arrowTargets : [],
          active.includes('color-squares') ? colorSquares : [],
          active.includes('polyomino') ||
            active.includes('rotated-polyomino') ||
            active.includes('negative-polyomino')
            ? polyominoSymbols
            : [],
          active.includes('triangles') ? triangleTargets : [],
          active.includes('negator'),
          solutionPath ?? undefined,
          baseKinds.length
        )
        if (starResult) {
          starTargets = starResult.stars
          solutionPath = solutionPath ?? starResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'stars')
        }
      }

      let hexTargets: HexTarget[] = []
      if (active.includes('hexagon')) {
        hexTargets = generateHexTargets(edges, seed + attempt * 7, solutionPath ?? undefined)
      }

      if (active.includes('negator')) {
        const removableSymbolCount =
          arrowTargets.length +
          colorSquares.length +
          starTargets.length +
          triangleTargets.length +
          polyominoSymbols.length +
          hexTargets.length
        if (removableSymbolCount === 0) {
          active = active.filter((kind) => kind !== 'negator')
        }
        if (active.includes('negator')) {
          const usedNegatorCells = new Set<string>([
            ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
            ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
            ...starTargets.map((star) => `${star.cellX},${star.cellY}`),
            ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
            ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
          ])
          const preferredNegatorColors = active.includes('stars')
            ? Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...starTargets.map((star) => star.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS)
            : []
          const negatorResult = generateNegatorsForEdges(
            edges,
            seed + attempt * 29017,
            usedNegatorCells,
            arrowTargets,
            colorSquares,
            starTargets,
            triangleTargets,
            polyominoSymbols,
            hexTargets,
            active.includes('stars'),
            preferredNegatorColors,
            solutionPath ?? undefined
          )
          if (negatorResult) {
            negatorTargets = negatorResult.negators
            solutionPath = solutionPath ?? negatorResult.solutionPath
          } else {
            active = active.filter((kind) => kind !== 'negator')
          }
        }
      }

      if (
        active.includes('stars') &&
        countSymbolColors(
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          polyominoSymbols,
          negatorTargets,
          true
        ) > MAX_SYMBOL_COLORS
      ) {
        continue
      }

      if (mustKeepAllSymbols && baseKinds.some((kind) => !active.includes(kind))) {
        continue
      }

      if (active.length < minActive) continue

      if (solutionPath && solutionPath.length >= 2) {
        const usedEdgesForSolution = edgesFromPath(solutionPath)
        const quickEvaluation = evaluatePathConstraints(solutionPath, usedEdgesForSolution, active, {
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          polyominoSymbols,
          negatorTargets,
          hexTargets,
        })
        if (quickEvaluation.ok) {
          return {
            puzzle: { edges },
            activeKinds: active,
            arrowTargets,
            colorSquares,
            starTargets,
            triangleTargets,
            polyominoSymbols,
            negatorTargets,
            hexTargets,
          }
        }
      }

      const combinedSolution = findAnyValidSolutionPath(edges, active, {
        arrowTargets,
        colorSquares,
        starTargets,
        triangleTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
      })
      if (!combinedSolution) continue

      return {
        puzzle: { edges },
        activeKinds: active,
        arrowTargets,
        colorSquares,
        starTargets,
        triangleTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
      }
    }

    const fallbackKinds = baseKinds.filter((kind) => kind !== 'negator')
    const safeFallbackKinds =
      fallbackKinds.length > 0
        ? fallbackKinds.slice(0, Math.min(fallbackKinds.length, Math.max(minActive, 1)))
        : (['gap-line'] as TileKind[])
    const fallbackPuzzle = generatePuzzle(seed)
    const fallbackHexTargets = safeFallbackKinds.includes('hexagon')
      ? generateHexTargets(fallbackPuzzle.edges, seed + 7)
      : []
    return {
      puzzle: fallbackPuzzle,
      activeKinds: safeFallbackKinds,
      arrowTargets: [],
      colorSquares: [],
      starTargets: [],
      triangleTargets: [],
      polyominoSymbols: [],
      negatorTargets: [],
      hexTargets: fallbackHexTargets,
    }
  }, [seed, selectedKinds])

  const gaps = useMemo(
    () => allEdges.filter((edge) => !puzzle.edges.has(edge.key)),
    [allEdges, puzzle.edges]
  )

  const title =
    selectedTiles.length === 1 ? `${selectedTiles[0].label}-Puzzles` : 'Custom Set Puzzles'
  const subtitle =
    selectedTiles.length === 1
      ? selectedTiles[0].description
      : `Symbols: ${selectedTiles.map((tile) => tile.label).join(', ')}`

  const clearSolveTrace = () => {
    if (solveTraceTimerRef.current === null) return
    window.clearInterval(solveTraceTimerRef.current)
    solveTraceTimerRef.current = null
  }

  useEffect(() => () => clearSolveTrace(), [])

  const resetPath = () => {
    clearSolveTrace()
    setPath([])
    setIsDrawing(false)
    setLocked(false)
    setCursor(null)
    setResult('idle')
    setEliminations(emptyEliminations())
  }

  const handleNewPuzzle = () => {
    setSeed(Math.floor(Math.random() * 1_000_000_000))
    resetPath()
  }

  const handleViewLastSolved = () => {
    if (!lastSolved) return
    clearSolveTrace()
    setSeed(lastSolved.seed)
    setPath(lastSolved.path.map((point) => ({ ...point })))
    setEliminations({
      negators: [...lastSolved.eliminations.negators],
      arrows: [...lastSolved.eliminations.arrows],
      colorSquares: [...lastSolved.eliminations.colorSquares],
      stars: [...lastSolved.eliminations.stars],
      triangles: [...lastSolved.eliminations.triangles],
      polyominoes: [...lastSolved.eliminations.polyominoes],
      hexagons: [...lastSolved.eliminations.hexagons],
    })
    setIsDrawing(false)
    setLocked(true)
    setCursor(null)
    setResult('success')
  }

  const handleStartClick = () => {
    if (locked) return
    clearSolveTrace()
    setEliminations(emptyEliminations())
    setIsDrawing(true)
    setPath([START])
    setCursor(START)
    setResult('idle')
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || locked || path.length === 0) return
    const svg = boardRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * VIEWBOX.w + VIEWBOX.x
    const py = ((event.clientY - rect.top) / rect.height) * VIEWBOX.h + VIEWBOX.y
    const pointer = { x: px, y: py }

    const last = path[path.length - 1]
    if (!last) return

    const candidates = neighbors(last)
      .map((neighbor) => ({ neighbor, key: edgeKey(last, neighbor) }))
      .filter((candidate) => puzzle.edges.has(candidate.key))

    if (candidates.length === 0) {
      setCursor(last)
      return
    }

    let best = {
      neighbor: candidates[0].neighbor,
      point: last,
      t: 0,
      distance: Number.POSITIVE_INFINITY,
    }

    for (const candidate of candidates) {
      const closest = closestPointOnSegment(pointer, last, candidate.neighbor)
      const dist = distance(pointer, closest)
      if (dist < best.distance) {
        best = { neighbor: candidate.neighbor, point: closest, t: closest.t, distance: dist }
      }
    }

    if (last.x === END.x && last.y === END.y) {
      const endCapPoint = { x: END.x + END_CAP_LENGTH, y: END.y }
      const closest = closestPointOnSegment(pointer, END, endCapPoint)
      const dist = distance(pointer, closest)
      if (dist < best.distance) {
        setCursor({ x: closest.x, y: closest.y })
        return
      }
    }

    setCursor({ x: best.point.x, y: best.point.y })

    const shouldAdvance = best.t > 0.82 || distance(pointer, best.neighbor) < 0.32
    if (!shouldAdvance) return

    setPath((prev) => {
      const current = prev[prev.length - 1]
      if (!current) return prev

      const secondLast = prev[prev.length - 2]
      if (secondLast && secondLast.x === best.neighbor.x && secondLast.y === best.neighbor.y) {
        return prev.slice(0, -1)
      }

      const nextEdge = edgeKey(current, best.neighbor)
      for (let i = 1; i < prev.length; i += 1) {
        if (edgeKey(prev[i - 1], prev[i]) === nextEdge) {
          return prev
        }
      }

      if (prev.some((point) => point.x === best.neighbor.x && point.y === best.neighbor.y)) {
        return prev
      }

      return [...prev, best.neighbor]
    })
  }

  const handleContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    resetPath()
  }

  const applySolvedPath = (solvedPath: Point[]) => {
    const usedEdges = new Set<string>()
    for (let i = 1; i < solvedPath.length; i += 1) {
      usedEdges.add(edgeKey(solvedPath[i - 1], solvedPath[i]))
    }

    const evaluation = evaluatePathConstraints(solvedPath, usedEdges, activeKinds, {
      arrowTargets,
      colorSquares,
      starTargets,
      triangleTargets,
      polyominoSymbols,
      negatorTargets,
      hexTargets,
    })
    if (!evaluation.ok) {
      setResult('fail')
      setLocked(false)
      setIsDrawing(false)
      setCursor(null)
      setEliminations(emptyEliminations())
      return false
    }

    const solvedEliminations = mapEliminations(
      evaluation.eliminatedNegatorIndexes,
      evaluation.eliminatedSymbols
    )
    setPath(solvedPath.map((point) => ({ ...point })))
    setEliminations(solvedEliminations)
    setLastSolved({
      seed,
      path: solvedPath.map((point) => ({ ...point })),
      eliminations: {
        negators: [...solvedEliminations.negators],
        arrows: [...solvedEliminations.arrows],
        colorSquares: [...solvedEliminations.colorSquares],
        stars: [...solvedEliminations.stars],
        triangles: [...solvedEliminations.triangles],
        polyominoes: [...solvedEliminations.polyominoes],
        hexagons: [...solvedEliminations.hexagons],
      },
    })
    setResult('success')
    setLocked(true)
    setIsDrawing(false)
    setCursor(null)
    return true
  }

  const handleCheck = () => {
    if (locked || result === 'success') return
    const last = path[path.length - 1]
    if (!last) return

    const isConnected = path[0].x === START.x && path[0].y === START.y
    const atEnd = last.x === END.x && last.y === END.y
    if (!isConnected || !atEnd) return

    applySolvedPath(path)
  }

  const handleSolve = () => {
    clearSolveTrace()
    const solved = findAnyValidSolutionPath(puzzle.edges, activeKinds, {
      arrowTargets,
      colorSquares,
      starTargets,
      triangleTargets,
      polyominoSymbols,
      negatorTargets,
      hexTargets,
    })
    if (!solved || solved.length < 2) {
      setResult('fail')
      setLocked(false)
      setIsDrawing(false)
      setCursor(null)
      setEliminations(emptyEliminations())
      return
    }

    const solvedPath = solved.map((point) => ({ ...point }))
    setEliminations(emptyEliminations())
    setResult('idle')
    setLocked(true)
    setIsDrawing(false)
    setCursor(null)
    setPath([solvedPath[0]])

    let revealIndex = 1
    solveTraceTimerRef.current = window.setInterval(() => {
      if (revealIndex >= solvedPath.length) {
        clearSolveTrace()
        applySolvedPath(solvedPath)
        return
      }
      setPath(solvedPath.slice(0, revealIndex + 1).map((point) => ({ ...point })))
      revealIndex += 1
    }, 70)
  }

  const last = path[path.length - 1]
  const isConnected = path.length > 0 && path[0].x === START.x && path[0].y === START.y
  const canCheck = !!last && isConnected && last.x === END.x && last.y === END.y
  const displayPoints = [...path]
  if (isDrawing && cursor) {
    displayPoints.push(cursor)
  } else if (canCheck) {
    displayPoints.push({ x: END.x + END_CAP_LENGTH, y: END.y })
  }
  const pathPoints = displayPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const boardClass = ['board', result !== 'idle' ? result : '', canCheck ? 'can-check' : '']
    .filter(Boolean)
    .join(' ')
  const startActive = isDrawing || path.length > 0
  const startClass = [
    'start',
    startActive ? 'active' : '',
    result === 'success' ? 'success' : '',
    result === 'fail' ? 'fail' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const eliminated = useMemo(
    () => ({
      negators: new Set(eliminations.negators),
      arrows: new Set(eliminations.arrows),
      colorSquares: new Set(eliminations.colorSquares),
      stars: new Set(eliminations.stars),
      triangles: new Set(eliminations.triangles),
      polyominoes: new Set(eliminations.polyominoes),
      hexagons: new Set(eliminations.hexagons),
    }),
    [eliminations]
  )

  return (
    <div className="app puzzle">
      <div className="puzzle-top">
        <button className="back-button" onClick={onBack} aria-label="Back">
          <span aria-hidden="true">&lt;</span>
        </button>
        <div className="puzzle-hero">
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="board-shell">
        <svg
          ref={boardRef}
          className={boardClass}
          viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
          role="img"
          aria-label="Puzzle Grid"
          onPointerMove={handlePointerMove}
          onContextMenu={handleContextMenu}
        >
          <rect className="board-bg" x={-0.45} y={-0.45} width={4.9} height={4.9} />
          <g className="edges">
            {allEdges.map((segment) => (
              <line
                key={segment.key}
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
              />
            ))}
          </g>
          <g className="gaps">
            {gaps.map((gap) => {
              const midX = (gap.a.x + gap.b.x) / 2
              const midY = (gap.a.y + gap.b.y) / 2
              const half = GAP_SIZE / 2
              return (
                <rect
                  key={`gap-${gap.key}`}
                  className="gap"
                  x={midX - half}
                  y={midY - half}
                  width={GAP_SIZE}
                  height={GAP_SIZE}
                  rx={0.05}
                />
              )
            })}
          </g>
          {hexTargets.length > 0 && (
            <g className="hexes">
              {hexTargets.map((target, index) => (
                <polygon
                  key={`hex-${target.id}`}
                  className="hexagon"
                  points={hexPoints(target.position, 0.12)}
                  style={eliminated.hexagons.has(index) ? { opacity: 0.24 } : undefined}
                />
              ))}
            </g>
          )}
          {arrowTargets.length > 0 && (
            <g className="arrows">
              {arrowTargets.map((target, index) => {
                const step = 0.12
                const lastOffset = 0.16
                const firstOffset = lastOffset - (target.count - 1) * step
                const headOffsets = Array.from(
                  { length: target.count },
                  (_, headIndex) => firstOffset + headIndex * step
                )
                const isDiagonal =
                  target.direction === 'up-right' ||
                  target.direction === 'down-right' ||
                  target.direction === 'down-left' ||
                  target.direction === 'up-left'
                const localNudgeX = isDiagonal && target.count === 4 ? 0.06 : 0
                const headTailX = -0.09
                const headTipX = 0.11
                const headHalfHeight = 0.2
                const shaftStartX = -0.24
                const shaftEndX = headTipX + headOffsets[headOffsets.length - 1] - 0.06
                return (
                  <g
                    key={`arrow-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(${arrowDirectionAngle(target.direction)})`}
                    style={eliminated.arrows.has(index) ? { opacity: 0.24 } : undefined}
                  >
                    <g transform={localNudgeX !== 0 ? `translate(${localNudgeX} 0)` : undefined}>
                      <line
                        className="arrow-shaft"
                        x1={shaftStartX}
                        y1={0}
                        x2={shaftEndX}
                        y2={0}
                        style={{ stroke: target.color, strokeWidth: 0.064 }}
                      />
                      {headOffsets.map((offset, headIndex) => (
                        <polyline
                          key={`arrow-head-${headIndex}`}
                          className="arrow-head"
                          points={`${headTailX + offset},${-headHalfHeight} ${headTipX + offset},0 ${headTailX + offset},${headHalfHeight}`}
                          style={{ stroke: target.color, strokeWidth: 0.052 }}
                        />
                      ))}
                    </g>
                  </g>
                )
              })}
            </g>
          )}
          {colorSquares.length > 0 && (
            <g className="color-squares">
              {colorSquares.map((square, index) => (
                <rect
                  key={`color-${square.cellX}-${square.cellY}-${index}`}
                  className="color-square"
                  x={square.cellX + 0.5 - 0.17}
                  y={square.cellY + 0.5 - 0.17}
                  width={0.34}
                  height={0.34}
                  rx={0.08}
                  style={eliminated.colorSquares.has(index) ? { fill: square.color, opacity: 0.24 } : { fill: square.color }}
                />
              ))}
            </g>
          )}
          {starTargets.length > 0 && (
            <g className="stars">
              {starTargets.map((star, index) => (
                <polygon
                  key={`star-${star.cellX}-${star.cellY}-${index}`}
                  className="star"
                  points={starPoints({ x: star.cellX + 0.5, y: star.cellY + 0.5 }, 0.19, 0.135)}
                  style={eliminated.stars.has(index) ? { fill: star.color, opacity: 0.24 } : { fill: star.color }}
                />
              ))}
            </g>
          )}
          {negatorTargets.length > 0 && (
            <g className="negators">
              {negatorTargets.map((target, index) => (
                <g
                  key={`negator-${target.cellX}-${target.cellY}-${index}`}
                  transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                  style={eliminated.negators.has(index) ? { opacity: 0.24 } : undefined}
                >
                  <line className="negator-arm" x1="0" y1="0" x2="0" y2="-0.16" style={{ stroke: target.color }} />
                  <line className="negator-arm" x1="0" y1="0" x2="0.14" y2="0.085" style={{ stroke: target.color }} />
                  <line className="negator-arm" x1="0" y1="0" x2="-0.14" y2="0.085" style={{ stroke: target.color }} />
                </g>
              ))}
            </g>
          )}
          {triangleTargets.length > 0 && (
            <g className="triangles">
              {triangleTargets.map((target, index) => {
                const offsets =
                  target.count === 1 ? [0] : target.count === 2 ? [-0.095, 0.095] : [-0.165, 0, 0.165]
                return offsets.map((offset, offsetIndex) => (
                  <polygon
                    key={`tri-${target.cellX}-${target.cellY}-${index}-${offsetIndex}`}
                    className="triangle-target"
                    points={trianglePoints(target.cellX + 0.5 + offset, target.cellY + 0.5, 0.082)}
                    style={eliminated.triangles.has(index) ? { fill: target.color, opacity: 0.24 } : { fill: target.color }}
                  />
                ))
              })}
            </g>
          )}
          {polyominoSymbols.length > 0 && (
            <g className="polyominoes">
              {polyominoSymbols.map((symbol, index) => {
                const bounds = shapeBounds(symbol.shape.cells)
                const unit = 0.145
                const gap = symbol.negative ? 0.056 : 0.036
                const block = unit - gap
                const offsetX = symbol.cellX + 0.5 - (bounds.width * unit) / 2
                const offsetY = symbol.cellY + 0.5 - (bounds.height * unit) / 2
                const centerX = symbol.cellX + 0.5
                const centerY = symbol.cellY + 0.5
                return (
                  <g
                    key={`poly-${symbol.cellX}-${symbol.cellY}-${index}`}
                    transform={
                      symbol.rotatable ? `rotate(12 ${centerX} ${centerY})` : undefined
                    }
                  >
                    {symbol.shape.cells.map((cell, cellIndex) => (
                      <rect
                        key={`poly-cell-${cellIndex}`}
                        className={`polyomino-block ${symbol.negative ? 'negative' : ''}`}
                        x={offsetX + (cell.x - bounds.minX) * unit + gap / 2}
                        y={offsetY + (cell.y - bounds.minY) * unit + gap / 2}
                        width={block}
                        height={block}
                        style={
                          symbol.negative
                            ? eliminated.polyominoes.has(index)
                              ? { stroke: symbol.color, opacity: 0.24 }
                              : { stroke: symbol.color }
                            : eliminated.polyominoes.has(index)
                              ? { fill: symbol.color, opacity: 0.24 }
                              : { fill: symbol.color }
                        }
                        rx={0}
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}

          <g className={`end-group ${canCheck ? 'active' : ''}`}>
            <path
              className="end-hit"
              d={`M ${END.x} ${END.y} H ${END.x + END_CAP_LENGTH}`}
              onClick={handleCheck}
            />
            <path
              className="end-cap"
              d={`M ${END.x} ${END.y} H ${END.x + END_CAP_LENGTH}`}
              onClick={handleCheck}
            />
          </g>

          {pathPoints.length > 0 && <polyline className="path" points={pathPoints} />}

          <circle className={startClass} cx={START.x} cy={START.y} r={0.24} onClick={handleStartClick} />
        </svg>
      </section>

      <div className="puzzle-actions">
        <button className="btn primary" onClick={handleNewPuzzle}>
          New puzzle
        </button>
        <button className="btn ghost" onClick={handleSolve} disabled={result === 'success'}>
          Solve
        </button>
        <button className="btn ghost" onClick={handleViewLastSolved} disabled={!lastSolved}>
          Letztes gelöstes Puzzle
        </button>
        <p className="puzzle-hint">Right-click resets the path.</p>
      </div>
    </div>
  )
}

export default PuzzlePage
