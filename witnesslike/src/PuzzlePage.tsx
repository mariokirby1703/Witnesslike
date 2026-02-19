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
  findBestLoopyPathByRegions,
  findRandomPath,
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
const GENERATION_SOLVER_VISIT_BUDGET_HEAVY = 1400
const GENERATION_SOLVER_VISIT_BUDGET_LIGHT = 2600
const GENERATION_POLY_ONLY_SOLVER_VISIT_BUDGET = 2200
const MANUAL_SOLVER_VISIT_BUDGET = 12000
const GENERATION_RECOVERY_SOLVER_VISIT_BUDGET = 6000
const MAX_PENDING_RECOVERY_CANDIDATES = 5
const AUTO_SOLVE_BASE_DURATION_MS = 320
const AUTO_SOLVE_MS_PER_EDGE = 34
const END_CAP_POINT: Point = {
  x: END.x + END_CAP_LENGTH * Math.SQRT1_2,
  y: END.y - END_CAP_LENGTH * Math.SQRT1_2,
}
const END_CAP_PATH = `M ${END.x} ${END.y} L ${END_CAP_POINT.x} ${END_CAP_POINT.y}`

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

function colorWithAlpha(color: string, alpha: number) {
  const value = color.trim()
  const shortHexMatch = /^#([0-9a-fA-F]{3})$/.exec(value)
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('').map((digit) => parseInt(digit + digit, 16))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(value)
  if (hexMatch) {
    const raw = hexMatch[1]
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return color
}

function symbolGlowFilter(color: string) {
  const nearGlow = colorWithAlpha(color, 0.2)
  const farGlow = colorWithAlpha(color, 0.1)
  return `drop-shadow(0 0 0.13px ${nearGlow}) drop-shadow(0 0 0.34px ${farGlow})`
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
  const pathPolylineRef = useRef<SVGPolylineElement | null>(null)
  const solveTraceAnimationRef = useRef<number | null>(null)

  const selectedKinds = useMemo<TileKind[]>(
    () => selectedTiles.map((tile) => tile.kind).filter((kind) => kind !== 'placeholder'),
    [selectedTiles]
  )

  const allEdges = useMemo(() => listAllEdges(), [])

  const { puzzle, activeKinds, arrowTargets, colorSquares, starTargets, triangleTargets, polyominoSymbols, negatorTargets, hexTargets, solutionPath } = useMemo(() => {
    type GeneratedCandidate = {
      puzzle: Puzzle
      activeKinds: TileKind[]
      arrowTargets: ArrowTarget[]
      colorSquares: ColorSquare[]
      starTargets: StarTarget[]
      triangleTargets: TriangleTarget[]
      polyominoSymbols: PolyominoSymbol[]
      negatorTargets: NegatorTarget[]
      hexTargets: HexTarget[]
      solutionPath: Point[]
    }
    type PendingCandidate = {
      puzzle: Puzzle
      activeKinds: TileKind[]
      arrowTargets: ArrowTarget[]
      colorSquares: ColorSquare[]
      starTargets: StarTarget[]
      triangleTargets: TriangleTarget[]
      polyominoSymbols: PolyominoSymbol[]
      negatorTargets: NegatorTarget[]
      hexTargets: HexTarget[]
      solutionPathHint: Point[] | null
      score: number
    }
    const baseKinds = selectedKinds.length > 0 ? selectedKinds : (['gap-line'] as TileKind[])
    const minActive = baseKinds.length >= 2 ? 2 : 1
    const hasRequestedSymbols = baseKinds.some((kind) => kind !== 'gap-line')
    const hasHeavyKinds =
      baseKinds.includes('negative-polyomino') ||
      baseKinds.includes('rotated-negative-polyomino') ||
      baseKinds.includes('negator')
    const polyKinds = new Set<TileKind>([
      'polyomino',
      'rotated-polyomino',
      'negative-polyomino',
      'rotated-negative-polyomino',
    ])
    const isPolyOnlySelection =
      baseKinds.length > 0 && baseKinds.every((kind) => kind === 'gap-line' || polyKinds.has(kind))
    const wantsPositiveMixSelection =
      baseKinds.includes('polyomino') && baseKinds.includes('rotated-polyomino')
    const wantsNegativeMixSelection =
      baseKinds.includes('negative-polyomino') && baseKinds.includes('rotated-negative-polyomino')
    const generationAttempts = isPolyOnlySelection
      ? hasHeavyKinds
        ? 30
        : 24
      : hasHeavyKinds
        ? 52
        : 40
    const maxPendingCandidates = isPolyOnlySelection ? 3 : MAX_PENDING_RECOVERY_CANDIDATES
    const mustIncludeRotatedPolyomino =
      baseKinds.includes('polyomino') && baseKinds.includes('rotated-polyomino')
    let bestRelaxedCandidate: GeneratedCandidate | null = null
    let bestRelaxedScore = Number.NEGATIVE_INFINITY
    const pendingCandidates: PendingCandidate[] = []
    for (let attempt = 0; attempt < generationAttempts; attempt += 1) {
      const rng = mulberry32(seed + attempt * 313 + 11)
      const mustKeepAllSymbols =
        baseKinds.length >= 3 || wantsPositiveMixSelection || wantsNegativeMixSelection
      let active: TileKind[]

      if (baseKinds.length >= 2) {
        const strictAttempts = mustKeepAllSymbols
          ? Math.min(18, 8 + baseKinds.length * 2)
          : 18
        if (attempt < strictAttempts) {
          active = [...baseKinds]
        } else if (attempt < strictAttempts + 14) {
          active = shuffle(baseKinds, rng).slice(0, baseKinds.length - 1)
        } else {
          active = pickActiveKinds(baseKinds, rng)
        }
      } else {
        active = [...baseKinds]
      }

      if (!active.includes('polyomino') && !active.includes('rotated-polyomino')) {
        active = active.filter(
          (kind) => kind !== 'negative-polyomino' && kind !== 'rotated-negative-polyomino'
        )
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
      const hasNegativePolyKindsInAttempt =
        active.includes('negative-polyomino') || active.includes('rotated-negative-polyomino')
      const hasAnyPolyKindsInAttempt =
        active.includes('polyomino') ||
        active.includes('rotated-polyomino') ||
        hasNegativePolyKindsInAttempt
      const attemptPathSeed = hasNegativePolyKindsInAttempt
        ? findBestLoopyPathByRegions(edges, rng, 14, 8) ?? findRandomPath(edges, rng)
        : hasAnyPolyKindsInAttempt
          ? findBestLoopyPathByRegions(edges, rng, 14, 8) ?? findRandomPath(edges, rng)
          : findBestLoopyPathByRegions(edges, rng, hasHeavyKinds ? 26 : 18, 8) ??
            findRandomPath(edges, rng)
      let solutionPath: Point[] | null = attemptPathSeed

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
          colorSquarePool,
          solutionPath ?? undefined
        )

        if (!colorResult && active.includes('gap-line')) {
          const fullEdges = buildFullEdges()
          const retry = generateColorSquaresForEdges(
            fullEdges,
            seed + attempt * 2001 + 99,
            desiredColorCount,
            baseKinds.length,
            colorSquarePool,
            solutionPath ?? undefined
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
        active.includes('negative-polyomino') ||
        active.includes('rotated-negative-polyomino')
      ) {
        const baseUsedCells = new Set<string>(colorSquares.map((square) => `${square.cellX},${square.cellY}`))
        let usedPolyCells = new Set(baseUsedCells)
        const polyPalette = buildPolyominoPalette(
          rng,
          colorSquares,
          active.includes('stars')
        )
        const minRegions = 1
        const hasNegativePolySelection =
          active.includes('negative-polyomino') || active.includes('rotated-negative-polyomino')
        const negativeKindCount =
          (active.includes('negative-polyomino') ? 1 : 0) +
          (active.includes('rotated-negative-polyomino') ? 1 : 0)
        const reservedPositiveSlotsForNegative =
          negativeKindCount === 0 ? 0 : negativeKindCount === 2 ? 2 : 1
        let occupiedPositiveRegionIds = new Set<number>()

        if (active.includes('polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const fixedSlotsLeftRaw = MAX_POLYOMINO_SYMBOLS - currentPositiveCount
          const reserveForRotated =
            mustIncludeRotatedPolyomino && active.includes('rotated-polyomino')
              ? hasNegativePolySelection
                ? 1
                : 2
              : 0
          const fixedSlotsLeft = Math.max(
            0,
            fixedSlotsLeftRaw - reserveForRotated - reservedPositiveSlotsForNegative
          )
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
                  solutionPath ?? undefined,
                  occupiedPositiveRegionIds
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
                    solutionPath ?? undefined,
                    occupiedPositiveRegionIds
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
            for (const regionId of polyResult.usedRegionIds) {
              occupiedPositiveRegionIds.add(regionId)
            }
            solutionPath = solutionPath ?? polyResult.solutionPath
          } else {
            active = active.filter((kind) => kind !== 'polyomino')
          }
        }

        if (active.includes('rotated-polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const rotatedSlotsLeft = Math.max(
            0,
            MAX_POLYOMINO_SYMBOLS - currentPositiveCount - reservedPositiveSlotsForNegative
          )
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
                  solutionPath ?? undefined,
                  occupiedPositiveRegionIds
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
                    solutionPath ?? undefined,
                    occupiedPositiveRegionIds
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
            for (const regionId of rotatedResult.usedRegionIds) {
              occupiedPositiveRegionIds.add(regionId)
            }
            solutionPath = solutionPath ?? rotatedResult.solutionPath
          } else {
            active = active.filter((kind) => kind !== 'rotated-polyomino')
          }
        }

        if (
          mustIncludeRotatedPolyomino &&
          !polyominoSymbols.some((symbol) => !symbol.negative && symbol.rotatable)
        ) {
          active = active.filter((kind) => kind !== 'rotated-polyomino')
        }
        if (
          baseKinds.includes('polyomino') &&
          baseKinds.includes('rotated-polyomino') &&
          !polyominoSymbols.some((symbol) => !symbol.negative && !symbol.rotatable)
        ) {
          active = active.filter((kind) => kind !== 'polyomino')
        }

        if (
          active.includes('negative-polyomino') ||
          active.includes('rotated-negative-polyomino')
        ) {
          let remainingNegativeSlots = MAX_NEGATIVE_POLYOMINO_SYMBOLS
          let remainingPositiveSlots = Math.max(
            0,
            MAX_POLYOMINO_SYMBOLS - polyominoSymbols.filter((symbol) => !symbol.negative).length
          )
          const includeFixedNegative = active.includes('negative-polyomino')
          const includeRotatedNegative = active.includes('rotated-negative-polyomino')
          const pairedPositiveRotatable =
            active.includes('rotated-polyomino') && !active.includes('polyomino')
          let placedAnyFixedNegative = false
          let placedAnyRotatedNegative = false

          const runNegativeGeneration = (
            seedOffset: number,
            allowRotatedNegative: boolean,
            requireRotatedNegative: boolean,
            maxNegativeSymbols: number,
            maxExtraPositiveSymbols: number
          ) => {
            if (maxNegativeSymbols <= 0 || maxExtraPositiveSymbols <= 0) return null
            return generateNegativePolyominoesForEdges(
              edges,
              seed + attempt * 17041 + seedOffset,
              polyominoSymbols.filter((symbol) => !symbol.negative),
              usedPolyCells,
              polyPalette,
              active.includes('stars'),
              pairedPositiveRotatable,
              allowRotatedNegative,
              requireRotatedNegative,
              maxNegativeSymbols,
              maxExtraPositiveSymbols,
              solutionPath ?? undefined
            )
          }

          const appendNegativeResult = (
            negativeResult: NonNullable<ReturnType<typeof generateNegativePolyominoesForEdges>>
          ) => {
            polyominoSymbols = [
              ...polyominoSymbols,
              ...negativeResult.pairedPositiveSymbols,
              ...negativeResult.negativeSymbols,
            ]
            solutionPath = solutionPath ?? negativeResult.solutionPath
            remainingNegativeSlots = Math.max(
              0,
              remainingNegativeSlots - negativeResult.negativeSymbols.length
            )
            remainingPositiveSlots = Math.max(
              0,
              remainingPositiveSlots - negativeResult.pairedPositiveSymbols.length
            )
            if (negativeResult.negativeSymbols.some((symbol) => symbol.rotatable)) {
              placedAnyRotatedNegative = true
            }
            if (negativeResult.negativeSymbols.some((symbol) => !symbol.rotatable)) {
              placedAnyFixedNegative = true
            }
          }

          if (remainingPositiveSlots <= 0 || remainingNegativeSlots <= 0) {
            active = active.filter(
              (kind) => kind !== 'negative-polyomino' && kind !== 'rotated-negative-polyomino'
            )
          } else {
            if (includeFixedNegative && includeRotatedNegative) {
              if (remainingPositiveSlots > 0 && remainingNegativeSlots > 0) {
                const fixedMandatory = runNegativeGeneration(11, false, false, 1, 1)
                if (fixedMandatory) appendNegativeResult(fixedMandatory)
              }
              if (remainingPositiveSlots > 0 && remainingNegativeSlots > 0) {
                const rotatedMandatory = runNegativeGeneration(173, true, true, 1, 1)
                if (rotatedMandatory) appendNegativeResult(rotatedMandatory)
              }

              if (remainingPositiveSlots > 0 && remainingNegativeSlots > 0) {
                const extraMixed = runNegativeGeneration(
                  719,
                  true,
                  false,
                  remainingNegativeSlots,
                  remainingPositiveSlots
                )
                if (extraMixed) appendNegativeResult(extraMixed)
              }
            } else if (includeFixedNegative) {
              const fixedOnly = runNegativeGeneration(
                11,
                false,
                false,
                remainingNegativeSlots,
                remainingPositiveSlots
              )
              if (fixedOnly) appendNegativeResult(fixedOnly)
            } else if (includeRotatedNegative) {
              const rotatedOnly = runNegativeGeneration(
                173,
                true,
                true,
                remainingNegativeSlots,
                remainingPositiveSlots
              )
              if (rotatedOnly) appendNegativeResult(rotatedOnly)
            }

            if (includeFixedNegative && !placedAnyFixedNegative) {
              active = active.filter((kind) => kind !== 'negative-polyomino')
            }
            if (includeRotatedNegative && !placedAnyRotatedNegative) {
              active = active.filter((kind) => kind !== 'rotated-negative-polyomino')
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
            active.includes('negative-polyomino') ||
            active.includes('rotated-negative-polyomino')
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
        // Keep searching for a full match, but still evaluate this attempt as a relaxed fallback.
      }

      if (active.length < minActive) continue

      const symbolCount =
        arrowTargets.length +
        colorSquares.length +
        starTargets.length +
        triangleTargets.length +
        polyominoSymbols.length +
        negatorTargets.length +
        hexTargets.length
      if (hasRequestedSymbols && symbolCount === 0) continue

      const coveredKindCount = baseKinds.filter((kind) => active.includes(kind)).length
      const uniquePolyShapeCount = new Set(
        polyominoSymbols.map(
          (symbol) => `${symbol.negative ? 'n' : 'p'}:${symbol.rotatable ? 'r' : 'f'}:${symbol.shape.id}`
        )
      ).size
      const pendingScore =
        coveredKindCount * 100 +
        symbolCount * 10 +
        uniquePolyShapeCount * 4 +
        (solutionPath?.length ?? 0)

      let validatedPath: Point[] | null = null
      if (solutionPath && solutionPath.length >= 2) {
        const usedEdgesForSolution = edgesFromPath(solutionPath)
        const quickEvaluation = evaluatePathConstraints(
          solutionPath,
          usedEdgesForSolution,
          active,
          {
            arrowTargets,
            colorSquares,
            starTargets,
            triangleTargets,
            polyominoSymbols,
            negatorTargets,
            hexTargets,
          },
          'first'
        )
        if (quickEvaluation.ok) {
          validatedPath = solutionPath
        }
      }

      if (!validatedPath) {
        const activeNonGapKinds = active.filter((kind) => kind !== 'gap-line')
        const isPolyOnlyAttempt =
          activeNonGapKinds.length > 0 &&
          activeNonGapKinds.every(
            (kind) =>
              kind === 'polyomino' ||
              kind === 'rotated-polyomino' ||
              kind === 'negative-polyomino' ||
              kind === 'rotated-negative-polyomino'
          )
        const nearEndAttempts = attempt >= generationAttempts - 10
        const shouldRunFallbackSolver = isPolyOnlyAttempt
          ? (nearEndAttempts && attempt % 3 === 0) || attempt === generationAttempts - 1
          : nearEndAttempts || attempt % 8 === 0
        if (shouldRunFallbackSolver) {
          const combinedSolution = findAnyValidSolutionPath(
            edges,
            active,
            {
              arrowTargets,
              colorSquares,
              starTargets,
              triangleTargets,
              polyominoSymbols,
              negatorTargets,
              hexTargets,
            },
            isPolyOnlyAttempt
              ? GENERATION_POLY_ONLY_SOLVER_VISIT_BUDGET
              : hasHeavyKinds
                ? GENERATION_SOLVER_VISIT_BUDGET_HEAVY
                : GENERATION_SOLVER_VISIT_BUDGET_LIGHT
          )
          if (combinedSolution) {
            validatedPath = combinedSolution
          }
        }
      }
      if (!validatedPath) {
        pendingCandidates.push({
          puzzle: { edges },
          activeKinds: active,
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          polyominoSymbols,
          negatorTargets,
          hexTargets,
          solutionPathHint: solutionPath,
          score: pendingScore,
        })
        pendingCandidates.sort((a, b) => b.score - a.score)
        if (pendingCandidates.length > maxPendingCandidates) {
          pendingCandidates.length = maxPendingCandidates
        }
        continue
      }

      const candidate = {
        puzzle: { edges },
        activeKinds: active,
        arrowTargets,
        colorSquares,
        starTargets,
        triangleTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
        solutionPath: validatedPath,
      }

      const keepsAllRequestedKinds = !baseKinds.some((kind) => !active.includes(kind))
      if (!mustKeepAllSymbols || keepsAllRequestedKinds) {
        return candidate
      }

      const score = coveredKindCount * 100 + symbolCount * 10 + uniquePolyShapeCount * 4 + validatedPath.length
      if (score > bestRelaxedScore) {
        bestRelaxedScore = score
        bestRelaxedCandidate = candidate
      }
    }

    if (bestRelaxedCandidate) return bestRelaxedCandidate

    if (pendingCandidates.length > 0) {
      for (const pending of pendingCandidates) {
        let recoveredPath: Point[] | null = null
        if (pending.solutionPathHint && pending.solutionPathHint.length >= 2) {
          const usedEdgesForHint = edgesFromPath(pending.solutionPathHint)
          const hintEvaluation = evaluatePathConstraints(
            pending.solutionPathHint,
            usedEdgesForHint,
            pending.activeKinds,
            {
              arrowTargets: pending.arrowTargets,
              colorSquares: pending.colorSquares,
              starTargets: pending.starTargets,
              triangleTargets: pending.triangleTargets,
              polyominoSymbols: pending.polyominoSymbols,
              negatorTargets: pending.negatorTargets,
              hexTargets: pending.hexTargets,
            },
            'first'
          )
          if (hintEvaluation.ok) {
            recoveredPath = pending.solutionPathHint
          }
        }

        if (!recoveredPath) {
          const pendingNonGapKinds = pending.activeKinds.filter((kind) => kind !== 'gap-line')
          const pendingIsPolyOnly =
            pendingNonGapKinds.length > 0 &&
            pendingNonGapKinds.every(
              (kind) =>
                kind === 'polyomino' ||
                kind === 'rotated-polyomino' ||
                kind === 'negative-polyomino' ||
                kind === 'rotated-negative-polyomino'
            )
          recoveredPath = findAnyValidSolutionPath(
            pending.puzzle.edges,
            pending.activeKinds,
            {
              arrowTargets: pending.arrowTargets,
              colorSquares: pending.colorSquares,
              starTargets: pending.starTargets,
              triangleTargets: pending.triangleTargets,
              polyominoSymbols: pending.polyominoSymbols,
              negatorTargets: pending.negatorTargets,
              hexTargets: pending.hexTargets,
            },
            pendingIsPolyOnly ? 4500 : GENERATION_RECOVERY_SOLVER_VISIT_BUDGET
          )
        }

        if (recoveredPath) {
          return {
            puzzle: pending.puzzle,
            activeKinds: pending.activeKinds,
            arrowTargets: pending.arrowTargets,
            colorSquares: pending.colorSquares,
            starTargets: pending.starTargets,
            triangleTargets: pending.triangleTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
            solutionPath: recoveredPath,
          }
        }
      }
    }

    const requestedPolyKinds = new Set<TileKind>([
      'polyomino',
      'rotated-polyomino',
      'negative-polyomino',
      'rotated-negative-polyomino',
    ])
    const wantsPolyFallback = baseKinds.some((kind) => requestedPolyKinds.has(kind))
    if (wantsPolyFallback) {
      for (let fallbackAttempt = 0; fallbackAttempt < 6; fallbackAttempt += 1) {
        const polyFallbackEdges = baseKinds.includes('gap-line')
          ? generatePuzzle(seed + 4049 + fallbackAttempt * 977).edges
          : buildFullEdges()
        const polyFallbackRng = mulberry32(seed + 54013 + fallbackAttempt * 1493)
        const polyFallbackPalette = buildPolyominoPalette(polyFallbackRng, [], false)
        const polyFallbackUsedCells = new Set<string>()
        let polyFallbackOccupiedPositiveRegionIds = new Set<number>()
        let polyFallbackSymbols: PolyominoSymbol[] = []
        const polyFallbackPathSeed =
          findBestLoopyPathByRegions(polyFallbackEdges, polyFallbackRng, 10, 8) ??
          findRandomPath(polyFallbackEdges, polyFallbackRng)
        let polyFallbackPath: Point[] | null = polyFallbackPathSeed
        const fallbackMinRegions = 1
        const fallbackNegativeKindCount =
          (baseKinds.includes('negative-polyomino') ? 1 : 0) +
          (baseKinds.includes('rotated-negative-polyomino') ? 1 : 0)
        const fallbackReservedPositiveSlots =
          fallbackNegativeKindCount === 0 ? 0 : fallbackNegativeKindCount === 2 ? 2 : 1
        const fallbackPositiveCap = Math.max(1, MAX_POLYOMINO_SYMBOLS - fallbackReservedPositiveSlots)

        if (baseKinds.includes('polyomino')) {
          const fixedFallback = generatePolyominoesForEdges(
            polyFallbackEdges,
            seed + 9107 + fallbackAttempt * 701,
            fallbackMinRegions,
            polyFallbackUsedCells,
            polyFallbackPalette,
            fallbackPositiveCap,
            polyFallbackPath ?? undefined,
            polyFallbackOccupiedPositiveRegionIds
          )
          if (fixedFallback) {
            polyFallbackSymbols = [...polyFallbackSymbols, ...fixedFallback.symbols]
            for (const regionId of fixedFallback.usedRegionIds) {
              polyFallbackOccupiedPositiveRegionIds.add(regionId)
            }
            polyFallbackPath = polyFallbackPath ?? fixedFallback.solutionPath
          }
        }

        if (baseKinds.includes('rotated-polyomino')) {
          const currentPositiveCount = polyFallbackSymbols.filter((symbol) => !symbol.negative).length
          const rotatedSlots = Math.max(0, fallbackPositiveCap - currentPositiveCount)
          if (rotatedSlots > 0) {
            const rotatedFallback = generateRotatedPolyominoesForEdges(
              polyFallbackEdges,
              seed + 12121 + fallbackAttempt * 907,
              fallbackMinRegions,
              polyFallbackUsedCells,
              polyFallbackPalette,
              rotatedSlots,
              polyFallbackPath ?? undefined,
              polyFallbackOccupiedPositiveRegionIds
            )
            if (rotatedFallback) {
              polyFallbackSymbols = [...polyFallbackSymbols, ...rotatedFallback.symbols]
              for (const regionId of rotatedFallback.usedRegionIds) {
                polyFallbackOccupiedPositiveRegionIds.add(regionId)
              }
              polyFallbackPath = polyFallbackPath ?? rotatedFallback.solutionPath
            }
          }
        }

        if (
          baseKinds.includes('negative-polyomino') ||
          baseKinds.includes('rotated-negative-polyomino')
        ) {
          let fallbackNegativeSlots = MAX_NEGATIVE_POLYOMINO_SYMBOLS
          let fallbackPositiveSlots = Math.max(
            0,
            MAX_POLYOMINO_SYMBOLS - polyFallbackSymbols.filter((symbol) => !symbol.negative).length
          )
          const includeFixedNegativeFallback = baseKinds.includes('negative-polyomino')
          const includeRotatedNegativeFallback = baseKinds.includes('rotated-negative-polyomino')
          const pairedPositiveRotatableFallback =
            baseKinds.includes('rotated-polyomino') && !baseKinds.includes('polyomino')

          const runFallbackNegative = (
            seedOffset: number,
            allowRotatedNegative: boolean,
            requireRotatedNegative: boolean,
            maxNegativeSymbols: number,
            maxExtraPositiveSymbols: number
          ) => {
            if (maxNegativeSymbols <= 0 || maxExtraPositiveSymbols <= 0) return null
            return generateNegativePolyominoesForEdges(
              polyFallbackEdges,
              seed + 17041 + fallbackAttempt * 1117 + seedOffset,
              polyFallbackSymbols.filter((symbol) => !symbol.negative),
              polyFallbackUsedCells,
              polyFallbackPalette,
              false,
              pairedPositiveRotatableFallback,
              allowRotatedNegative,
              requireRotatedNegative,
              maxNegativeSymbols,
              maxExtraPositiveSymbols,
              polyFallbackPath ?? undefined
            )
          }

          const appendFallbackNegative = (
            negativeFallback: NonNullable<ReturnType<typeof generateNegativePolyominoesForEdges>>
          ) => {
            polyFallbackSymbols = [
              ...polyFallbackSymbols,
              ...negativeFallback.pairedPositiveSymbols,
              ...negativeFallback.negativeSymbols,
            ]
            polyFallbackPath = polyFallbackPath ?? negativeFallback.solutionPath
            fallbackNegativeSlots = Math.max(
              0,
              fallbackNegativeSlots - negativeFallback.negativeSymbols.length
            )
            fallbackPositiveSlots = Math.max(
              0,
              fallbackPositiveSlots - negativeFallback.pairedPositiveSymbols.length
            )
          }

          if (fallbackPositiveSlots > 0) {
            if (includeFixedNegativeFallback && includeRotatedNegativeFallback) {
              if (fallbackPositiveSlots > 0 && fallbackNegativeSlots > 0) {
                const fixedMandatory = runFallbackNegative(17, false, false, 1, 1)
                if (fixedMandatory) appendFallbackNegative(fixedMandatory)
              }
              if (fallbackPositiveSlots > 0 && fallbackNegativeSlots > 0) {
                const rotatedMandatory = runFallbackNegative(181, true, true, 1, 1)
                if (rotatedMandatory) appendFallbackNegative(rotatedMandatory)
              }
              if (fallbackPositiveSlots > 0 && fallbackNegativeSlots > 0) {
                const extraMixed = runFallbackNegative(
                  947,
                  true,
                  false,
                  fallbackNegativeSlots,
                  fallbackPositiveSlots
                )
                if (extraMixed) appendFallbackNegative(extraMixed)
              }
            } else if (includeFixedNegativeFallback) {
              const fixedOnly = runFallbackNegative(
                17,
                false,
                false,
                fallbackNegativeSlots,
                fallbackPositiveSlots
              )
              if (fixedOnly) appendFallbackNegative(fixedOnly)
            } else if (includeRotatedNegativeFallback) {
              const rotatedOnly = runFallbackNegative(
                181,
                true,
                true,
                fallbackNegativeSlots,
                fallbackPositiveSlots
              )
              if (rotatedOnly) appendFallbackNegative(rotatedOnly)
            }
          }
        }

        if (polyFallbackSymbols.length === 0) continue

        const polyFallbackKinds = new Set<TileKind>()
        if (baseKinds.includes('gap-line')) polyFallbackKinds.add('gap-line')
        if (polyFallbackSymbols.some((symbol) => !symbol.negative && !symbol.rotatable)) {
          polyFallbackKinds.add('polyomino')
        }
        if (polyFallbackSymbols.some((symbol) => !symbol.negative && symbol.rotatable)) {
          polyFallbackKinds.add('rotated-polyomino')
        }
        if (polyFallbackSymbols.some((symbol) => symbol.negative && !symbol.rotatable)) {
          polyFallbackKinds.add('negative-polyomino')
        }
        if (polyFallbackSymbols.some((symbol) => symbol.negative && symbol.rotatable)) {
          polyFallbackKinds.add('rotated-negative-polyomino')
        }
        const polyFallbackActiveKinds = Array.from(polyFallbackKinds)
        let validatedPolyFallbackPath: Point[] | null = null
        if (polyFallbackPath && polyFallbackPath.length >= 2 && polyFallbackActiveKinds.length > 0) {
          const usedEdgesForFallbackPath = edgesFromPath(polyFallbackPath)
          const fallbackEvaluation = evaluatePathConstraints(
            polyFallbackPath,
            usedEdgesForFallbackPath,
            polyFallbackActiveKinds,
            {
              arrowTargets: [],
              colorSquares: [],
              starTargets: [],
              triangleTargets: [],
              polyominoSymbols: polyFallbackSymbols,
              negatorTargets: [],
              hexTargets: [],
            },
            'first'
          )
          if (fallbackEvaluation.ok) {
            validatedPolyFallbackPath = polyFallbackPath
          }
        }
        if (!validatedPolyFallbackPath && polyFallbackActiveKinds.length > 0) {
          validatedPolyFallbackPath = findAnyValidSolutionPath(
            polyFallbackEdges,
            polyFallbackActiveKinds,
            {
              arrowTargets: [],
              colorSquares: [],
              starTargets: [],
              triangleTargets: [],
              polyominoSymbols: polyFallbackSymbols,
              negatorTargets: [],
              hexTargets: [],
            },
            GENERATION_RECOVERY_SOLVER_VISIT_BUDGET
          )
        }
        if (validatedPolyFallbackPath) {
          return {
            puzzle: { edges: polyFallbackEdges },
            activeKinds: polyFallbackActiveKinds,
            arrowTargets: [],
            colorSquares: [],
            starTargets: [],
            triangleTargets: [],
            polyominoSymbols: polyFallbackSymbols,
            negatorTargets: [],
            hexTargets: [],
            solutionPath: validatedPolyFallbackPath,
          }
        }
      }
    }

    const fallbackKinds = baseKinds.filter((kind) => kind !== 'negator')
    const safeFallbackKinds =
      fallbackKinds.length > 0
        ? fallbackKinds.slice(0, Math.min(fallbackKinds.length, Math.max(minActive, 1)))
        : (['gap-line'] as TileKind[])
    const fallbackEdges = safeFallbackKinds.includes('gap-line')
      ? generatePuzzle(seed).edges
      : buildFullEdges()
    const fallbackPuzzle = { edges: fallbackEdges }
    const fallbackHexTargets = safeFallbackKinds.includes('hexagon')
      ? generateHexTargets(fallbackEdges, seed + 7)
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
      solutionPath: null,
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
    if (solveTraceAnimationRef.current === null) return
    window.cancelAnimationFrame(solveTraceAnimationRef.current)
    solveTraceAnimationRef.current = null
    pathPolylineRef.current?.classList.remove('auto-solving')
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
      const closest = closestPointOnSegment(pointer, END, END_CAP_POINT)
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
    setPath(solvedPath)
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
    const solved =
      solutionPath ??
      findAnyValidSolutionPath(
        puzzle.edges,
        activeKinds,
        {
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          polyominoSymbols,
          negatorTargets,
          hexTargets,
        },
        MANUAL_SOLVER_VISIT_BUDGET
      )
    if (!solved || solved.length < 2) {
      setResult('fail')
      setLocked(false)
      setIsDrawing(false)
      setCursor(null)
      setEliminations(emptyEliminations())
      return
    }

    const solvedPath = solved
    setEliminations(emptyEliminations())
    setResult('idle')
    setLocked(true)
    setIsDrawing(false)
    setCursor(null)
    setPath([solvedPath[0]])

    const lastIndex = solvedPath.length - 1
    const edgeCount = Math.max(1, lastIndex)
    const totalDurationMs = AUTO_SOLVE_BASE_DURATION_MS + edgeCount * AUTO_SOLVE_MS_PER_EDGE
    const pointStrings = solvedPath.map((point) => `${point.x},${point.y}`)
    const prefixPointStrings: string[] = [pointStrings[0]]
    for (let i = 1; i < pointStrings.length; i += 1) {
      prefixPointStrings.push(`${prefixPointStrings[i - 1]} ${pointStrings[i]}`)
    }
    const segmentLengths: number[] = []
    const cumulativeLengths: number[] = [0]
    for (let i = 0; i < lastIndex; i += 1) {
      const a = solvedPath[i]
      const b = solvedPath[i + 1]
      const segmentLength = Math.hypot(b.x - a.x, b.y - a.y)
      segmentLengths.push(segmentLength)
      cumulativeLengths.push(cumulativeLengths[i] + segmentLength)
    }
    const totalDistance = cumulativeLengths[lastIndex]

    let revealIndex = 0
    let segmentIndex = 0
    let startTimestamp: number | null = null

    const setAnimatedPolyline = (distanceAlong: number) => {
      const clampedDistance = Math.max(0, Math.min(totalDistance, distanceAlong))
      while (
        segmentIndex < lastIndex - 1 &&
        cumulativeLengths[segmentIndex + 1] <= clampedDistance
      ) {
        segmentIndex += 1
      }
      const segmentStart = solvedPath[segmentIndex]
      const segmentEnd = solvedPath[segmentIndex + 1]
      const segmentStartDistance = cumulativeLengths[segmentIndex]
      const segmentLength = segmentLengths[segmentIndex] || 1
      const localT = Math.max(0, Math.min(1, (clampedDistance - segmentStartDistance) / segmentLength))
      const headX = segmentStart.x + (segmentEnd.x - segmentStart.x) * localT
      const headY = segmentStart.y + (segmentEnd.y - segmentStart.y) * localT
      const prefix = prefixPointStrings[segmentIndex]
      pathPolylineRef.current?.setAttribute('points', `${prefix} ${headX},${headY}`)
    }

    const animate = (timestamp: number) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp
        pathPolylineRef.current?.classList.add('auto-solving')
      }
      const elapsedMs = timestamp - startTimestamp
      const progress = Math.min(1, elapsedMs / totalDurationMs)
      setAnimatedPolyline(progress * totalDistance)
      const nextRevealIndex = Math.min(lastIndex, Math.floor(progress * lastIndex))

      if (nextRevealIndex !== revealIndex) {
        revealIndex = nextRevealIndex
      }

      if (progress >= 1) {
        pathPolylineRef.current?.setAttribute('points', prefixPointStrings[lastIndex])
        clearSolveTrace()
        applySolvedPath(solvedPath)
        return
      }

      solveTraceAnimationRef.current = window.requestAnimationFrame(animate)
    }

    solveTraceAnimationRef.current = window.requestAnimationFrame(animate)
  }

  const last = path[path.length - 1]
  const isConnected = path.length > 0 && path[0].x === START.x && path[0].y === START.y
  const canCheck = !!last && isConnected && last.x === END.x && last.y === END.y
  const displayPoints = [...path]
  if (isDrawing && cursor) {
    displayPoints.push(cursor)
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
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`arrow-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(${arrowDirectionAngle(target.direction)})`}
                    style={
                      eliminated.arrows.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
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
                  style={
                    eliminated.colorSquares.has(index)
                      ? { fill: square.color, opacity: 0.24, filter: symbolGlowFilter(square.color) }
                      : { fill: square.color, filter: symbolGlowFilter(square.color) }
                  }
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
                  style={
                    eliminated.stars.has(index)
                      ? { fill: star.color, opacity: 0.24, filter: symbolGlowFilter(star.color) }
                      : { fill: star.color, filter: symbolGlowFilter(star.color) }
                  }
                />
              ))}
            </g>
          )}
          {negatorTargets.length > 0 && (
            <g className="negators">
              {negatorTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`negator-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.negators.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <line className="negator-arm" x1="0" y1="0" x2="0" y2="-0.16" style={{ stroke: target.color }} />
                    <line className="negator-arm" x1="0" y1="0" x2="0.14" y2="0.085" style={{ stroke: target.color }} />
                    <line className="negator-arm" x1="0" y1="0" x2="-0.14" y2="0.085" style={{ stroke: target.color }} />
                  </g>
                )
              })}
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
                    style={
                      eliminated.triangles.has(index)
                        ? { fill: target.color, opacity: 0.24, filter: symbolGlowFilter(target.color) }
                        : { fill: target.color, filter: symbolGlowFilter(target.color) }
                    }
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
                const glowFilter = symbolGlowFilter(symbol.color)
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
                              ? { stroke: symbol.color, opacity: 0.24, filter: glowFilter }
                              : { stroke: symbol.color, filter: glowFilter }
                            : eliminated.polyominoes.has(index)
                              ? { fill: symbol.color, opacity: 0.24, filter: glowFilter }
                              : { fill: symbol.color, filter: glowFilter }
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
              d={END_CAP_PATH}
              onClick={handleCheck}
            />
            <path
              className="end-cap"
              d={END_CAP_PATH}
              onClick={handleCheck}
            />
          </g>

          {pathPoints.length > 0 && <polyline ref={pathPolylineRef} className="path" points={pathPoints} />}

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
