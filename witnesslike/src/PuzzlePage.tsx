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
  pathSignature,
  regionCountForPath,
  shapeBounds,
  shuffle,
  starPoints,
} from './puzzleUtils'
import {
  type EliminatedSymbolRef,
  evaluatePathConstraints,
  findAnyValidSolutionPath,
  findSimplestValidSolutionPath,
} from './puzzleSolver'
import type { ArrowTarget } from './symbols/arrows'
import { arrowDirectionAngle, generateArrowsForEdges } from './symbols/arrows'
import type { ColorSquare } from './symbols/colorSquares'
import { generateColorSquaresForEdges } from './symbols/colorSquares'
import type { CardinalTarget } from './symbols/cardinal'
import { generateCardinalsForEdges } from './symbols/cardinal'
import type { HexTarget } from './symbols/hexagon'
import { buildFullGridHexPath, generateHexTargets, shouldUseFullGridHex } from './symbols/hexagon'
import type { NegatorTarget } from './symbols/negator'
import { generateNegatorsForEdges } from './symbols/negator'
import type { DotTarget } from './symbols/dots'
import { generateDotsForEdges } from './symbols/dots'
import type { DiamondTarget } from './symbols/diamonds'
import { generateDiamondsForEdges } from './symbols/diamonds'
import type { GhostTarget } from './symbols/ghost'
import { generateGhostsForEdges } from './symbols/ghost'
import type { ChevronTarget } from './symbols/chevrons'
import { chevronDirectionAngle, generateChevronsForEdges } from './symbols/chevrons'
import type { MinesweeperNumberTarget } from './symbols/minesweeperNumbers'
import {
  generateMinesweeperNumbersForEdges,
  minesweeperDigitPixels,
} from './symbols/minesweeperNumbers'
import type { SentinelTarget } from './symbols/sentinel'
import { generateSentinelsForEdges, sentinelDirectionAngle } from './symbols/sentinel'
import type { SpinnerTarget } from './symbols/spinner'
import { generateSpinnersForEdges, spinnerDirectionScaleX } from './symbols/spinner'
import type { StarTarget } from './symbols/stars'
import { generateStarsForEdges } from './symbols/stars'
import type { TriangleTarget } from './symbols/triangles'
import { generateTrianglesForEdges } from './symbols/triangles'
import type { WaterDropletTarget } from './symbols/waterDroplet'
import {
  generateWaterDropletsForEdges,
  waterDropletDirectionAngle,
} from './symbols/waterDroplet'
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
const MANUAL_SOLVER_VISIT_BUDGET_FALLBACK = 80000
const GENERATION_RECOVERY_SOLVER_VISIT_BUDGET = 6000
const MAX_PENDING_RECOVERY_CANDIDATES = 5
const AUTO_SOLVE_BASE_DURATION_MS = 320
const AUTO_SOLVE_MS_PER_EDGE = 34
const TOTAL_GRID_EDGE_COUNT = listAllEdges().length
const RECENT_PATH_SIGNATURE_LIMIT = 40
const RECENT_PATH_SIGNATURE_AVOID_WINDOW = 18
const GENERATED_PUZZLE_KEY_HISTORY_LIMIT = 140
const REPEAT_TRACE_RELAX_LAST_ATTEMPTS = 14
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
  dots: number[]
  diamonds: number[]
  chevrons: number[]
  minesweeper: number[]
  waterDroplets: number[]
  cardinals: number[]
  spinners: number[]
  sentinels: number[]
  ghosts: number[]
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
    dots: [],
    diamonds: [],
    chevrons: [],
    minesweeper: [],
    waterDroplets: [],
    cardinals: [],
    spinners: [],
    sentinels: [],
    ghosts: [],
    polyominoes: [],
    hexagons: [],
  }
}

function mapEliminations(
  eliminatedNegatorIndexes: number[],
  eliminatedSymbols: EliminatedSymbolRef[]
): Eliminations {
  const mapped = emptyEliminations()
  mapped.negators = [...eliminatedNegatorIndexes]
  for (const symbol of eliminatedSymbols) {
    if (symbol.kind === 'arrow') mapped.arrows.push(symbol.index)
    if (symbol.kind === 'color-square') mapped.colorSquares.push(symbol.index)
    if (symbol.kind === 'star') mapped.stars.push(symbol.index)
    if (symbol.kind === 'triangle') mapped.triangles.push(symbol.index)
    if (symbol.kind === 'dot') mapped.dots.push(symbol.index)
    if (symbol.kind === 'diamond') mapped.diamonds.push(symbol.index)
    if (symbol.kind === 'chevron') mapped.chevrons.push(symbol.index)
    if (symbol.kind === 'minesweeper') mapped.minesweeper.push(symbol.index)
    if (symbol.kind === 'water-droplet') mapped.waterDroplets.push(symbol.index)
    if (symbol.kind === 'cardinal') mapped.cardinals.push(symbol.index)
    if (symbol.kind === 'spinner') mapped.spinners.push(symbol.index)
    if (symbol.kind === 'sentinel') mapped.sentinels.push(symbol.index)
    if (symbol.kind === 'ghost') mapped.ghosts.push(symbol.index)
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

function generatePuzzleKeepingPath(seed: number, requiredPath: Point[]): Puzzle {
  const requiredEdges = edgesFromPath(requiredPath)
  const allEdgeKeys = listAllEdges().map((edge) => edge.key)
  const removableEdgeKeys = allEdgeKeys.filter((key) => !requiredEdges.has(key))
  if (removableEdgeKeys.length === 0) {
    return { edges: buildFullEdges() }
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = mulberry32(seed + attempt * 97)
    const edges = buildFullEdges()
    const gapRatio = 0.12 + rng() * 0.12
    const gapCount = Math.min(
      removableEdgeKeys.length,
      Math.floor(allEdgeKeys.length * gapRatio)
    )
    const shuffledRemovable = shuffle(removableEdgeKeys, rng)
    for (let i = 0; i < gapCount; i += 1) {
      edges.delete(shuffledRemovable[i])
    }
    if (hasPath(edges)) {
      return { edges }
    }
  }

  return { edges: buildFullEdges() }
}

function trianglePoints(centerX: number, centerY: number, size: number) {
  const halfWidth = size * 0.9
  return `${centerX},${centerY - size} ${centerX - halfWidth},${centerY + size * 0.72} ${centerX + halfWidth},${centerY + size * 0.72}`
}

function diamondPoints(centerX: number, centerY: number, radius: number) {
  return `${centerX},${centerY - radius} ${centerX + radius},${centerY} ${centerX},${centerY + radius} ${centerX - radius},${centerY}`
}

function chevronPoints(centerX: number, centerY: number, size: number) {
  const halfHeight = size * 1.05
  const tailX = centerX - size * 0.95
  const shoulderX = centerX + size * 0.12
  const tipX = centerX + size - 0.01
  const notchX = centerX - size * 0.25
  return `${tailX},${centerY - halfHeight} ${shoulderX},${centerY - halfHeight} ${tipX},${centerY} ${shoulderX},${centerY + halfHeight} ${tailX},${centerY + halfHeight} ${notchX},${centerY}`
}

function countPathTurns(path: Point[]) {
  if (path.length < 3) return 0
  let turns = 0
  let prevDx = path[1].x - path[0].x
  let prevDy = path[1].y - path[0].y
  for (let i = 2; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (dx !== prevDx || dy !== prevDy) {
      turns += 1
    }
    prevDx = dx
    prevDy = dy
  }
  return turns
}

function longestPathStraightRun(path: Point[]) {
  if (path.length < 2) return 0
  let longest = 1
  let currentRun = 1
  let prevDx = path[1].x - path[0].x
  let prevDy = path[1].y - path[0].y
  for (let i = 2; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (dx === prevDx && dy === prevDy) {
      currentRun += 1
    } else {
      if (currentRun > longest) longest = currentRun
      currentRun = 1
      prevDx = dx
      prevDy = dy
    }
  }
  if (currentRun > longest) longest = currentRun
  return longest
}

function meetsWildnessTarget(path: Point[], activeKinds: TileKind[]) {
  const activeSymbolCount = activeKinds.filter((kind) => kind !== 'gap-line').length
  const turns = countPathTurns(path)
  const longestRun = longestPathStraightRun(path)
  const length = path.length

  if (activeSymbolCount >= 4) {
    const moderatelyWild = turns >= 7 && longestRun <= 8 && length >= 12
    const altBalanced = turns >= 6 && longestRun <= 7 && length >= 13
    return moderatelyWild || altBalanced
  }
  if (activeSymbolCount === 3) {
    return turns >= 7 && longestRun <= 7 && length >= 12
  }
  if (activeSymbolCount === 2) {
    return turns >= 5 && longestRun <= 8 && length >= 10
  }
  return turns >= 3 && length >= 8
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

function colorLuminance(color: string) {
  const value = color.trim()
  const shortHexMatch = /^#([0-9a-fA-F]{3})$/.exec(value)
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('').map((digit) => parseInt(digit + digit, 16))
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }

  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(value)
  if (hexMatch) {
    const raw = hexMatch[1]
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }

  return null
}

function ghostEyeColor(ghostColor: string) {
  const luminance = colorLuminance(ghostColor)
  if (luminance !== null && luminance < 0.36) return '#f6f7fb'
  return '#101318'
}

function waterDropletAccentColors(dropletColor: string) {
  const luminance = colorLuminance(dropletColor)
  if (luminance !== null && luminance > 0.82) {
    return {
      rim: 'rgba(16, 28, 43, 0.42)',
      gloss: 'rgba(16, 28, 43, 0.26)',
      bubble: 'rgba(16, 28, 43, 0.18)',
    }
  }
  return {
    rim: colorWithAlpha(dropletColor, 0.56),
    gloss: 'rgba(243, 252, 255, 0.36)',
    bubble: 'rgba(243, 252, 255, 0.24)',
  }
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
  dotTargets: DotTarget[],
  diamondTargets: DiamondTarget[],
  chevronTargets: ChevronTarget[],
  minesweeperTargets: MinesweeperNumberTarget[],
  waterDropletTargets: WaterDropletTarget[],
  cardinalTargets: CardinalTarget[],
  spinnerTargets: SpinnerTarget[],
  sentinelTargets: SentinelTarget[],
  ghostTargets: GhostTarget[],
  polyominoSymbols: PolyominoSymbol[],
  negatorTargets: NegatorTarget[],
  includeNegatorColors = true
) {
  const colors = new Set<string>()
  for (const arrow of arrowTargets) colors.add(arrow.color)
  for (const square of colorSquares) colors.add(square.color)
  for (const star of starTargets) colors.add(star.color)
  for (const triangle of triangleTargets) colors.add(triangle.color)
  for (const dot of dotTargets) colors.add(dot.color)
  for (const diamond of diamondTargets) colors.add(diamond.color)
  for (const chevron of chevronTargets) colors.add(chevron.color)
  for (const mine of minesweeperTargets) colors.add(mine.color)
  for (const droplet of waterDropletTargets) colors.add(droplet.color)
  for (const cardinal of cardinalTargets) colors.add(cardinal.color)
  for (const spinner of spinnerTargets) colors.add(spinner.color)
  for (const sentinel of sentinelTargets) colors.add(sentinel.color)
  for (const ghost of ghostTargets) colors.add(ghost.color)
  for (const symbol of polyominoSymbols) colors.add(symbol.color)
  if (includeNegatorColors) {
    for (const negator of negatorTargets) colors.add(negator.color)
  }
  return colors.size
}

type GeneratedSymbolSnapshot = {
  edges: Set<string>
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
  sentinelTargets: SentinelTarget[]
  ghostTargets: GhostTarget[]
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  hexTargets: HexTarget[]
}

function hasGeneratedSymbolForKind(kind: TileKind, snapshot: GeneratedSymbolSnapshot) {
  if (kind === 'gap-line') return snapshot.edges.size < TOTAL_GRID_EDGE_COUNT
  if (kind === 'hexagon') return snapshot.hexTargets.length > 0
  if (kind === 'color-squares') return snapshot.colorSquares.length > 0
  if (kind === 'stars') return snapshot.starTargets.length > 0
  if (kind === 'arrows') return snapshot.arrowTargets.length > 0
  if (kind === 'dots') return snapshot.dotTargets.length > 0
  if (kind === 'diamonds') return snapshot.diamondTargets.length > 0
  if (kind === 'chevrons') return snapshot.chevronTargets.length > 0
  if (kind === 'minesweeper-numbers') return snapshot.minesweeperTargets.length > 0
  if (kind === 'water-droplet') return snapshot.waterDropletTargets.length > 0
  if (kind === 'cardinal') return snapshot.cardinalTargets.length > 0
  if (kind === 'spinner') return snapshot.spinnerTargets.length > 0
  if (kind === 'sentinel') return snapshot.sentinelTargets.length > 0
  if (kind === 'ghost') return snapshot.ghostTargets.length > 0
  if (kind === 'triangles') return snapshot.triangleTargets.length > 0
  if (kind === 'negator') return snapshot.negatorTargets.length > 0
  if (kind === 'polyomino') {
    return snapshot.polyominoSymbols.some((symbol) => !symbol.negative && !symbol.rotatable)
  }
  if (kind === 'rotated-polyomino') {
    return snapshot.polyominoSymbols.some((symbol) => !symbol.negative && symbol.rotatable)
  }
  if (kind === 'negative-polyomino') {
    return snapshot.polyominoSymbols.some((symbol) => symbol.negative && !symbol.rotatable)
  }
  if (kind === 'rotated-negative-polyomino') {
    return snapshot.polyominoSymbols.some((symbol) => symbol.negative && symbol.rotatable)
  }
  return false
}

function isPathTraceRecentlyUsed(path: Point[], recentPathSignatures: ReadonlySet<string>) {
  if (recentPathSignatures.size === 0) return false
  const signature = pathSignature(path)
  return signature.length > 0 && recentPathSignatures.has(signature)
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
  const recentSolutionSignaturesRef = useRef<string[]>([])
  const generatedPuzzleKeysRef = useRef<string[]>([])

  const selectedKinds = useMemo<TileKind[]>(
    () => selectedTiles.map((tile) => tile.kind).filter((kind) => kind !== 'placeholder'),
    [selectedTiles]
  )
  const selectedKindsKey = selectedKinds.join('|') || 'gap-line'

  const allEdges = useMemo(() => listAllEdges(), [])

  const {
    puzzle,
    activeKinds,
    arrowTargets,
    colorSquares,
    starTargets,
    triangleTargets,
    dotTargets,
    diamondTargets,
    chevronTargets,
    minesweeperTargets,
    waterDropletTargets,
    cardinalTargets,
    spinnerTargets,
    sentinelTargets,
    ghostTargets,
    polyominoSymbols,
    negatorTargets,
    hexTargets,
    solutionPath,
  } = useMemo(() => {
    type PendingCandidate = {
      puzzle: Puzzle
      activeKinds: TileKind[]
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
      sentinelTargets: SentinelTarget[]
      ghostTargets: GhostTarget[]
      polyominoSymbols: PolyominoSymbol[]
      negatorTargets: NegatorTarget[]
      hexTargets: HexTarget[]
      solutionPathHint: Point[] | null
      score: number
    }
    const baseKinds = selectedKinds.length > 0 ? selectedKinds : (['gap-line'] as TileKind[])
    const generationKey = `${seed}:${selectedKindsKey}`
    const isReplayGeneration = generatedPuzzleKeysRef.current.includes(generationKey)
    const recentPathSignatures = isReplayGeneration
      ? []
      : recentSolutionSignaturesRef.current.slice(0, RECENT_PATH_SIGNATURE_AVOID_WINDOW)
    const recentPathSignatureSet = new Set(recentPathSignatures)
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
    const selectedSymbolCount = baseKinds.filter((kind) => kind !== 'gap-line').length
    const generationAttempts = isPolyOnlySelection
      ? hasHeavyKinds
        ? 140
        : 110
      : selectedSymbolCount >= 4
        ? hasHeavyKinds
          ? 260
          : 210
        : selectedSymbolCount === 3
          ? hasHeavyKinds
            ? 200
            : 160
          : hasHeavyKinds
            ? 140
            : 110
    const maxPendingCandidates = Math.max(
      isPolyOnlySelection ? 6 : MAX_PENDING_RECOVERY_CANDIDATES,
      selectedSymbolCount >= 4 ? 12 : selectedSymbolCount === 3 ? 10 : 8
    )
    const mustIncludeRotatedPolyomino =
      baseKinds.includes('polyomino') && baseKinds.includes('rotated-polyomino')
    const pendingCandidates: PendingCandidate[] = []
    attemptLoop: for (let attempt = 0; attempt < generationAttempts; attempt += 1) {
      const rng = mulberry32(seed + attempt * 313 + 11)
      const active: TileKind[] = [...baseKinds]

      if (
        (active.includes('negative-polyomino') || active.includes('rotated-negative-polyomino')) &&
        !active.includes('polyomino') &&
        !active.includes('rotated-polyomino')
      ) {
        continue attemptLoop
      }

      const hexSeed = seed + attempt * 7
      const shouldForceFullGridHex = active.includes('hexagon') && shouldUseFullGridHex(hexSeed)
      const forcedFullGridHexPath = shouldForceFullGridHex
        ? buildFullGridHexPath(seed + attempt * 11839 + 17)
        : null

      let edges = active.includes('gap-line')
        ? shouldForceFullGridHex && forcedFullGridHexPath
          ? generatePuzzleKeepingPath(seed + attempt * 131, forcedFullGridHexPath).edges
          : generatePuzzle(seed + attempt * 131).edges
        : buildFullEdges()

      let arrowTargets: ArrowTarget[] = []
      let colorSquares: ColorSquare[] = []
      let starTargets: StarTarget[] = []
      let triangleTargets: TriangleTarget[] = []
      let dotTargets: DotTarget[] = []
      let diamondTargets: DiamondTarget[] = []
      let chevronTargets: ChevronTarget[] = []
      let minesweeperTargets: MinesweeperNumberTarget[] = []
      let waterDropletTargets: WaterDropletTarget[] = []
      let cardinalTargets: CardinalTarget[] = []
      let spinnerTargets: SpinnerTarget[] = []
      let sentinelTargets: SentinelTarget[] = []
      let ghostTargets: GhostTarget[] = []
      let polyominoSymbols: PolyominoSymbol[] = []
      let negatorTargets: NegatorTarget[] = []
      const hasNegativePolyKindsInAttempt =
        active.includes('negative-polyomino') || active.includes('rotated-negative-polyomino')
      const hasAnyPolyKindsInAttempt =
        active.includes('polyomino') ||
        active.includes('rotated-polyomino') ||
        hasNegativePolyKindsInAttempt
      const activeSymbolCount = active.filter((kind) => kind !== 'gap-line').length
      const baseWildAttempts =
        activeSymbolCount >= 4
          ? hasHeavyKinds
            ? 82
            : 66
          : activeSymbolCount === 3
            ? hasHeavyKinds
              ? 74
              : 58
            : activeSymbolCount === 2
              ? hasHeavyKinds
                ? 54
                : 42
              : hasHeavyKinds
                ? 40
                : 32
      const baseWildMinLength =
        activeSymbolCount >= 4
          ? 12
          : activeSymbolCount === 3
            ? 12
            : activeSymbolCount === 2
              ? 10
              : 9
      const loopyAttempts = hasAnyPolyKindsInAttempt
        ? Math.max(22, Math.floor(baseWildAttempts * 0.8))
        : baseWildAttempts
      const loopyMinLength = hasAnyPolyKindsInAttempt
        ? Math.max(9, baseWildMinLength - 1)
        : baseWildMinLength
      const attemptPathSeed = shouldForceFullGridHex && forcedFullGridHexPath
        ? forcedFullGridHexPath
        : findBestLoopyPathByRegions(
            edges,
            rng,
            loopyAttempts,
            loopyMinLength,
            recentPathSignatureSet
          ) ??
          findRandomPath(edges, rng)
      let solutionPath: Point[] | null = attemptPathSeed
      if (active.includes('ghost')) {
        if (!solutionPath) {
          continue attemptLoop
        }
        const ghostRegionCount = regionCountForPath(solutionPath)
        if (ghostRegionCount < 2 || ghostRegionCount > 5) {
          continue attemptLoop
        }
      }

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

        if (colorResult) {
          colorSquares = colorResult.squares
          solutionPath = shouldForceFullGridHex
            ? solutionPath ?? colorResult.solutionPath
            : colorResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('ghost')) {
        const blockedGhostCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
        ])
        const preferredGhostColors = active.includes('stars')
          ? Array.from(
              new Set([
                ...colorSquares.map((square) => square.color),
              ])
            ).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const ghostResult = generateGhostsForEdges(
          edges,
          seed + attempt * 30967,
          blockedGhostCells,
          active.includes('stars'),
          baseKinds.length,
          preferredGhostColors,
          solutionPath ?? undefined
        )
        if (ghostResult) {
          ghostTargets = ghostResult.targets
          solutionPath = ghostResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (
        active.includes('polyomino') ||
        active.includes('rotated-polyomino') ||
        active.includes('negative-polyomino') ||
        active.includes('rotated-negative-polyomino')
      ) {
        const baseUsedCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
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
        const occupiedPositiveRegionIds = new Set<number>()

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
            continue attemptLoop
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

          if (polyResult) {
            polyominoSymbols = [...polyominoSymbols, ...polyResult.symbols]
            usedPolyCells = usedForFixed
            for (const regionId of polyResult.usedRegionIds) {
              occupiedPositiveRegionIds.add(regionId)
            }
            solutionPath = solutionPath ?? polyResult.solutionPath
          } else {
            continue attemptLoop
          }
        }

        if (active.includes('rotated-polyomino')) {
          const currentPositiveCount = polyominoSymbols.filter((symbol) => !symbol.negative).length
          const rotatedSlotsLeft = Math.max(
            0,
            MAX_POLYOMINO_SYMBOLS - currentPositiveCount - reservedPositiveSlotsForNegative
          )
          if (rotatedSlotsLeft <= 0) {
            continue attemptLoop
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

          if (rotatedResult) {
            polyominoSymbols = [...polyominoSymbols, ...rotatedResult.symbols]
            usedPolyCells = usedForRotated
            for (const regionId of rotatedResult.usedRegionIds) {
              occupiedPositiveRegionIds.add(regionId)
            }
            solutionPath = solutionPath ?? rotatedResult.solutionPath
          } else {
            continue attemptLoop
          }
        }

        if (
          mustIncludeRotatedPolyomino &&
          !polyominoSymbols.some((symbol) => !symbol.negative && symbol.rotatable)
        ) {
          continue attemptLoop
        }
        if (
          baseKinds.includes('polyomino') &&
          baseKinds.includes('rotated-polyomino') &&
          !polyominoSymbols.some((symbol) => !symbol.negative && !symbol.rotatable)
        ) {
          continue attemptLoop
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
            continue attemptLoop
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
              continue attemptLoop
            }
            if (includeRotatedNegative && !placedAnyRotatedNegative) {
              continue attemptLoop
            }
          }
        }
      }

      if (active.includes('triangles')) {
        const blockedTriangleCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredTriangleColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...ghostTargets.map((target) => target.color),
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
          continue attemptLoop
        }
      }

      if (active.includes('dots')) {
        const blockedDotCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredDotColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const dotResult = generateDotsForEdges(
          edges,
          seed + attempt * 24137,
          baseKinds.length,
          blockedDotCells,
          active.includes('stars'),
          preferredDotColors,
          solutionPath ?? undefined
        )
        if (dotResult) {
          dotTargets = dotResult.targets
          solutionPath = solutionPath ?? dotResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('diamonds')) {
        const blockedDiamondCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredDiamondColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const diamondResult = generateDiamondsForEdges(
          edges,
          seed + attempt * 24361,
          baseKinds.length,
          blockedDiamondCells,
          active.includes('stars'),
          preferredDiamondColors,
          solutionPath ?? undefined
        )
        if (diamondResult) {
          diamondTargets = diamondResult.targets
          solutionPath = solutionPath ?? diamondResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('arrows')) {
        const blockedArrowCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredArrowColors = active.includes('stars')
          ? Array.from(new Set([
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...ghostTargets.map((target) => target.color),
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
          continue attemptLoop
        }
      }

      if (active.includes('chevrons')) {
        const blockedChevronCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredChevronColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const chevronResult = generateChevronsForEdges(
          edges,
          seed + attempt * 26699,
          baseKinds.length,
          blockedChevronCells,
          active.includes('stars'),
          preferredChevronColors,
          solutionPath ?? undefined
        )
        if (chevronResult) {
          chevronTargets = chevronResult.targets
          solutionPath = solutionPath ?? chevronResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('minesweeper-numbers')) {
        const blockedMinesweeperCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...starTargets.map((star) => `${star.cellX},${star.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredMinesweeperColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...chevronTargets.map((chevron) => chevron.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const minesweeperResult = generateMinesweeperNumbersForEdges(
          edges,
          seed + attempt * 27599,
          baseKinds.length,
          blockedMinesweeperCells,
          active.includes('stars'),
          preferredMinesweeperColors,
          solutionPath ?? undefined
        )
        if (minesweeperResult) {
          minesweeperTargets = minesweeperResult.targets
          solutionPath = solutionPath ?? minesweeperResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('water-droplet')) {
        const blockedWaterCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredWaterColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...cardinalTargets.map((target) => target.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...chevronTargets.map((chevron) => chevron.color),
              ...minesweeperTargets.map((target) => target.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const waterResult = generateWaterDropletsForEdges(
          edges,
          seed + attempt * 30259,
          selectedSymbolCount,
          blockedWaterCells,
          active.includes('stars'),
          preferredWaterColors,
          solutionPath ?? undefined
        )
        if (waterResult) {
          waterDropletTargets = waterResult.targets
          solutionPath = solutionPath ?? waterResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('cardinal')) {
        const blockedCardinalCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredCardinalColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...chevronTargets.map((chevron) => chevron.color),
              ...minesweeperTargets.map((target) => target.color),
              ...waterDropletTargets.map((target) => target.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const cardinalResult = generateCardinalsForEdges(
          edges,
          seed + attempt * 28931,
          baseKinds.length,
          blockedCardinalCells,
          active.includes('stars'),
          preferredCardinalColors,
          solutionPath ?? undefined
        )
        if (cardinalResult) {
          cardinalTargets = cardinalResult.targets
          solutionPath = solutionPath ?? cardinalResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('spinner')) {
        const blockedSpinnerCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...starTargets.map((star) => `${star.cellX},${star.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredSpinnerColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...chevronTargets.map((chevron) => chevron.color),
              ...minesweeperTargets.map((target) => target.color),
              ...waterDropletTargets.map((target) => target.color),
              ...cardinalTargets.map((target) => target.color),
              ...ghostTargets.map((target) => target.color),
              ...sentinelTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const spinnerResult = generateSpinnersForEdges(
          edges,
          seed + attempt * 30773,
          baseKinds.length,
          blockedSpinnerCells,
          active.includes('stars'),
          preferredSpinnerColors,
          solutionPath ?? undefined
        )
        if (spinnerResult) {
          spinnerTargets = spinnerResult.targets
          solutionPath = solutionPath ?? spinnerResult.solutionPath
        } else {
          continue attemptLoop
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
          active.includes('dots') ? dotTargets : [],
          active.includes('diamonds') ? diamondTargets : [],
          active.includes('chevrons') ? chevronTargets : [],
          active.includes('minesweeper-numbers') ? minesweeperTargets : [],
          active.includes('water-droplet') ? waterDropletTargets : [],
          active.includes('cardinal') ? cardinalTargets : [],
          active.includes('spinner') ? spinnerTargets : [],
          active.includes('ghost') ? ghostTargets : [],
          active.includes('negator'),
          solutionPath ?? undefined,
          baseKinds.length
        )
        if (starResult) {
          starTargets = starResult.stars
          solutionPath = solutionPath ?? starResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      let hexTargets: HexTarget[] = []
      if (active.includes('hexagon')) {
        hexTargets = generateHexTargets(edges, hexSeed, solutionPath ?? undefined, {
          forceFullGrid: shouldForceFullGridHex,
        })
      }

      if (active.includes('sentinel')) {
        const blockedSentinelCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...starTargets.map((star) => `${star.cellX},${star.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredSentinelColors = active.includes('stars')
          ? Array.from(new Set([
              ...arrowTargets.map((arrow) => arrow.color),
              ...colorSquares.map((square) => square.color),
              ...starTargets.map((star) => star.color),
              ...triangleTargets.map((triangle) => triangle.color),
              ...dotTargets.map((dot) => dot.color),
              ...diamondTargets.map((diamond) => diamond.color),
              ...chevronTargets.map((chevron) => chevron.color),
              ...minesweeperTargets.map((target) => target.color),
              ...waterDropletTargets.map((target) => target.color),
              ...cardinalTargets.map((target) => target.color),
              ...spinnerTargets.map((target) => target.color),
              ...ghostTargets.map((target) => target.color),
              ...polyominoSymbols.map((symbol) => symbol.color),
            ])).slice(0, MAX_SYMBOL_COLORS)
          : undefined
        const sentinelResult = generateSentinelsForEdges(
          edges,
          seed + attempt * 31033,
          baseKinds.length,
          blockedSentinelCells,
          active.includes('stars'),
          {
            arrowTargets,
            colorSquares,
            starTargets,
            triangleTargets,
            dotTargets,
            diamondTargets,
            chevronTargets,
            minesweeperTargets,
            waterDropletTargets,
            cardinalTargets,
            spinnerTargets,
            ghostTargets,
            polyominoSymbols,
            negatorTargets,
            hexTargets,
          },
          preferredSentinelColors,
          solutionPath ?? undefined
        )
        if (sentinelResult) {
          sentinelTargets = sentinelResult.targets
          solutionPath = solutionPath ?? sentinelResult.solutionPath
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('negator')) {
        const removableSymbolCount =
          arrowTargets.length +
          colorSquares.length +
          starTargets.length +
          triangleTargets.length +
          dotTargets.length +
          diamondTargets.length +
          chevronTargets.length +
          minesweeperTargets.length +
          waterDropletTargets.length +
          cardinalTargets.length +
          spinnerTargets.length +
          sentinelTargets.length +
          ghostTargets.length +
          polyominoSymbols.length +
          hexTargets.length
        if (removableSymbolCount === 0) {
          continue attemptLoop
        }
        if (active.includes('negator')) {
          const usedNegatorCells = new Set<string>([
            ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
            ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
            ...starTargets.map((star) => `${star.cellX},${star.cellY}`),
            ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
            ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
            ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
            ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
            ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
            ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
          ])
          const preferredNegatorColors = active.includes('stars')
            ? Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...starTargets.map((star) => star.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
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
            dotTargets,
            diamondTargets,
            chevronTargets,
            minesweeperTargets,
            waterDropletTargets,
            cardinalTargets,
            polyominoSymbols,
            hexTargets,
            sentinelTargets,
            spinnerTargets,
            ghostTargets,
            active.includes('stars'),
            preferredNegatorColors,
            solutionPath ?? undefined
          )
          if (negatorResult) {
            negatorTargets = negatorResult.negators
            solutionPath = solutionPath ?? negatorResult.solutionPath
          } else {
            continue attemptLoop
          }
        }
      }

      const generatedSnapshot: GeneratedSymbolSnapshot = {
        edges,
        arrowTargets,
        colorSquares,
        starTargets,
        triangleTargets,
        dotTargets,
        diamondTargets,
        chevronTargets,
        minesweeperTargets,
        waterDropletTargets,
        cardinalTargets,
        spinnerTargets,
        sentinelTargets,
        ghostTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
      }
      if (!active.every((kind) => hasGeneratedSymbolForKind(kind, generatedSnapshot))) {
        continue attemptLoop
      }

      if (
        active.includes('stars') &&
        countSymbolColors(
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          dotTargets,
          diamondTargets,
          chevronTargets,
          minesweeperTargets,
          waterDropletTargets,
          cardinalTargets,
          spinnerTargets,
          sentinelTargets,
          ghostTargets,
          polyominoSymbols,
          negatorTargets,
          true
        ) > MAX_SYMBOL_COLORS
      ) {
        continue
      }

      if (active.length < minActive) continue

      const symbolCount =
        arrowTargets.length +
        colorSquares.length +
        starTargets.length +
        triangleTargets.length +
        dotTargets.length +
        diamondTargets.length +
        chevronTargets.length +
        minesweeperTargets.length +
        waterDropletTargets.length +
        cardinalTargets.length +
        spinnerTargets.length +
        sentinelTargets.length +
        ghostTargets.length +
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
            dotTargets,
            diamondTargets,
            chevronTargets,
            minesweeperTargets,
            waterDropletTargets,
            cardinalTargets,
            spinnerTargets,
            sentinelTargets,
            ghostTargets,
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
              dotTargets,
              diamondTargets,
              chevronTargets,
              minesweeperTargets,
              waterDropletTargets,
              cardinalTargets,
              spinnerTargets,
              sentinelTargets,
              ghostTargets,
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
      if (validatedPath && !meetsWildnessTarget(validatedPath, active)) {
        validatedPath = null
      }
      const nearEndRepeatRelaxation = attempt >= generationAttempts - REPEAT_TRACE_RELAX_LAST_ATTEMPTS
      if (
        validatedPath &&
        !isReplayGeneration &&
        isPathTraceRecentlyUsed(validatedPath, recentPathSignatureSet) &&
        !nearEndRepeatRelaxation
      ) {
        continue attemptLoop
      }
      if (!validatedPath) {
        pendingCandidates.push({
          puzzle: { edges },
          activeKinds: active,
          arrowTargets,
          colorSquares,
          starTargets,
          triangleTargets,
          dotTargets,
          diamondTargets,
          chevronTargets,
          minesweeperTargets,
          waterDropletTargets,
          cardinalTargets,
          spinnerTargets,
          sentinelTargets,
          ghostTargets,
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
        dotTargets,
        diamondTargets,
        chevronTargets,
        minesweeperTargets,
        waterDropletTargets,
        cardinalTargets,
        spinnerTargets,
        sentinelTargets,
        ghostTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
        solutionPath: validatedPath,
      }
      return candidate
    }

    if (pendingCandidates.length > 0) {
      for (let pendingIndex = 0; pendingIndex < pendingCandidates.length; pendingIndex += 1) {
        const pending = pendingCandidates[pendingIndex]
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
              dotTargets: pending.dotTargets,
              diamondTargets: pending.diamondTargets,
              chevronTargets: pending.chevronTargets,
              minesweeperTargets: pending.minesweeperTargets,
              waterDropletTargets: pending.waterDropletTargets,
              cardinalTargets: pending.cardinalTargets,
              spinnerTargets: pending.spinnerTargets,
              sentinelTargets: pending.sentinelTargets,
              ghostTargets: pending.ghostTargets,
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
              dotTargets: pending.dotTargets,
              diamondTargets: pending.diamondTargets,
              chevronTargets: pending.chevronTargets,
              minesweeperTargets: pending.minesweeperTargets,
              waterDropletTargets: pending.waterDropletTargets,
              cardinalTargets: pending.cardinalTargets,
              spinnerTargets: pending.spinnerTargets,
              sentinelTargets: pending.sentinelTargets,
              ghostTargets: pending.ghostTargets,
              polyominoSymbols: pending.polyominoSymbols,
              negatorTargets: pending.negatorTargets,
              hexTargets: pending.hexTargets,
            },
            pendingIsPolyOnly ? 4500 : GENERATION_RECOVERY_SOLVER_VISIT_BUDGET
          )
        }

        if (recoveredPath && !meetsWildnessTarget(recoveredPath, pending.activeKinds)) {
          recoveredPath = null
        }
        const allowRepeatOnRecovery = pendingIndex >= pendingCandidates.length - 2
        if (
          recoveredPath &&
          !isReplayGeneration &&
          isPathTraceRecentlyUsed(recoveredPath, recentPathSignatureSet) &&
          !allowRepeatOnRecovery
        ) {
          recoveredPath = null
        }

        if (recoveredPath) {
          return {
            puzzle: pending.puzzle,
            activeKinds: pending.activeKinds,
            arrowTargets: pending.arrowTargets,
            colorSquares: pending.colorSquares,
            starTargets: pending.starTargets,
            triangleTargets: pending.triangleTargets,
            dotTargets: pending.dotTargets,
            diamondTargets: pending.diamondTargets,
            chevronTargets: pending.chevronTargets,
            minesweeperTargets: pending.minesweeperTargets,
            waterDropletTargets: pending.waterDropletTargets,
            cardinalTargets: pending.cardinalTargets,
            spinnerTargets: pending.spinnerTargets,
            sentinelTargets: pending.sentinelTargets,
            ghostTargets: pending.ghostTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
            solutionPath: recoveredPath,
          }
        }
      }

      for (let pendingIndex = 0; pendingIndex < pendingCandidates.length; pendingIndex += 1) {
        const pending = pendingCandidates[pendingIndex]
        const hardRecoveredPath = findAnyValidSolutionPath(
          pending.puzzle.edges,
          pending.activeKinds,
          {
            arrowTargets: pending.arrowTargets,
            colorSquares: pending.colorSquares,
            starTargets: pending.starTargets,
            triangleTargets: pending.triangleTargets,
            dotTargets: pending.dotTargets,
            diamondTargets: pending.diamondTargets,
            chevronTargets: pending.chevronTargets,
            minesweeperTargets: pending.minesweeperTargets,
            waterDropletTargets: pending.waterDropletTargets,
            cardinalTargets: pending.cardinalTargets,
            spinnerTargets: pending.spinnerTargets,
            sentinelTargets: pending.sentinelTargets,
            ghostTargets: pending.ghostTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
          },
          MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
        )
        if (
          hardRecoveredPath &&
          !isReplayGeneration &&
          isPathTraceRecentlyUsed(hardRecoveredPath, recentPathSignatureSet) &&
          pendingIndex < pendingCandidates.length - 1
        ) {
          continue
        }
        if (hardRecoveredPath) {
          return {
            puzzle: pending.puzzle,
            activeKinds: pending.activeKinds,
            arrowTargets: pending.arrowTargets,
            colorSquares: pending.colorSquares,
            starTargets: pending.starTargets,
            triangleTargets: pending.triangleTargets,
            dotTargets: pending.dotTargets,
            diamondTargets: pending.diamondTargets,
            chevronTargets: pending.chevronTargets,
            minesweeperTargets: pending.minesweeperTargets,
            waterDropletTargets: pending.waterDropletTargets,
            cardinalTargets: pending.cardinalTargets,
            spinnerTargets: pending.spinnerTargets,
            sentinelTargets: pending.sentinelTargets,
            ghostTargets: pending.ghostTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
            solutionPath: hardRecoveredPath,
          }
        }
      }

      const strictEmergencyPending = pendingCandidates[0]
      let strictEmergencyPath: Point[] | null = null
      if (
        strictEmergencyPending.solutionPathHint &&
        strictEmergencyPending.solutionPathHint.length >= 2
      ) {
        const usedEdgesForHint = edgesFromPath(strictEmergencyPending.solutionPathHint)
        const hintEvaluation = evaluatePathConstraints(
          strictEmergencyPending.solutionPathHint,
          usedEdgesForHint,
          strictEmergencyPending.activeKinds,
          {
            arrowTargets: strictEmergencyPending.arrowTargets,
            colorSquares: strictEmergencyPending.colorSquares,
            starTargets: strictEmergencyPending.starTargets,
            triangleTargets: strictEmergencyPending.triangleTargets,
            dotTargets: strictEmergencyPending.dotTargets,
            diamondTargets: strictEmergencyPending.diamondTargets,
            chevronTargets: strictEmergencyPending.chevronTargets,
            minesweeperTargets: strictEmergencyPending.minesweeperTargets,
            waterDropletTargets: strictEmergencyPending.waterDropletTargets,
            cardinalTargets: strictEmergencyPending.cardinalTargets,
            spinnerTargets: strictEmergencyPending.spinnerTargets,
            sentinelTargets: strictEmergencyPending.sentinelTargets,
            ghostTargets: strictEmergencyPending.ghostTargets,
            polyominoSymbols: strictEmergencyPending.polyominoSymbols,
            negatorTargets: strictEmergencyPending.negatorTargets,
            hexTargets: strictEmergencyPending.hexTargets,
          },
          'first'
        )
        if (hintEvaluation.ok) {
          strictEmergencyPath = strictEmergencyPending.solutionPathHint
        }
      }
      if (!strictEmergencyPath) {
        strictEmergencyPath = findAnyValidSolutionPath(
          strictEmergencyPending.puzzle.edges,
          strictEmergencyPending.activeKinds,
          {
            arrowTargets: strictEmergencyPending.arrowTargets,
            colorSquares: strictEmergencyPending.colorSquares,
            starTargets: strictEmergencyPending.starTargets,
            triangleTargets: strictEmergencyPending.triangleTargets,
            dotTargets: strictEmergencyPending.dotTargets,
            diamondTargets: strictEmergencyPending.diamondTargets,
            chevronTargets: strictEmergencyPending.chevronTargets,
            minesweeperTargets: strictEmergencyPending.minesweeperTargets,
            waterDropletTargets: strictEmergencyPending.waterDropletTargets,
            cardinalTargets: strictEmergencyPending.cardinalTargets,
            spinnerTargets: strictEmergencyPending.spinnerTargets,
            sentinelTargets: strictEmergencyPending.sentinelTargets,
            ghostTargets: strictEmergencyPending.ghostTargets,
            polyominoSymbols: strictEmergencyPending.polyominoSymbols,
            negatorTargets: strictEmergencyPending.negatorTargets,
            hexTargets: strictEmergencyPending.hexTargets,
          },
          MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 2
        )
      }
      if (strictEmergencyPath) {
        return {
          puzzle: strictEmergencyPending.puzzle,
          activeKinds: strictEmergencyPending.activeKinds,
          arrowTargets: strictEmergencyPending.arrowTargets,
          colorSquares: strictEmergencyPending.colorSquares,
          starTargets: strictEmergencyPending.starTargets,
          triangleTargets: strictEmergencyPending.triangleTargets,
          dotTargets: strictEmergencyPending.dotTargets,
          diamondTargets: strictEmergencyPending.diamondTargets,
          chevronTargets: strictEmergencyPending.chevronTargets,
          minesweeperTargets: strictEmergencyPending.minesweeperTargets,
          waterDropletTargets: strictEmergencyPending.waterDropletTargets,
          cardinalTargets: strictEmergencyPending.cardinalTargets,
          spinnerTargets: strictEmergencyPending.spinnerTargets,
          sentinelTargets: strictEmergencyPending.sentinelTargets,
          ghostTargets: strictEmergencyPending.ghostTargets,
          polyominoSymbols: strictEmergencyPending.polyominoSymbols,
          negatorTargets: strictEmergencyPending.negatorTargets,
          hexTargets: strictEmergencyPending.hexTargets,
          solutionPath: strictEmergencyPath,
        }
      }
    }

    throw new Error('Failed to generate a puzzle containing all selected symbols.')

  }, [seed, selectedKinds, selectedKindsKey])

  useEffect(() => {
    const key = `${seed}:${selectedKindsKey}`
    const history = generatedPuzzleKeysRef.current
    if (!history.includes(key)) {
      history.push(key)
      if (history.length > GENERATED_PUZZLE_KEY_HISTORY_LIMIT) {
        history.splice(0, history.length - GENERATED_PUZZLE_KEY_HISTORY_LIMIT)
      }
    }
  }, [seed, selectedKindsKey])

  useEffect(() => {
    const signature = pathSignature(solutionPath)
    if (!signature) return
    const recent = recentSolutionSignaturesRef.current
    const deduped = [signature, ...recent.filter((entry) => entry !== signature)]
    if (deduped.length > RECENT_PATH_SIGNATURE_LIMIT) {
      deduped.length = RECENT_PATH_SIGNATURE_LIMIT
    }
    recentSolutionSignaturesRef.current = deduped
  }, [seed, solutionPath])

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
      dots: [...lastSolved.eliminations.dots],
      diamonds: [...lastSolved.eliminations.diamonds],
      chevrons: [...lastSolved.eliminations.chevrons],
      minesweeper: [...lastSolved.eliminations.minesweeper],
      waterDroplets: [...lastSolved.eliminations.waterDroplets],
      cardinals: [...lastSolved.eliminations.cardinals],
      spinners: [...lastSolved.eliminations.spinners],
      sentinels: [...lastSolved.eliminations.sentinels],
      ghosts: [...lastSolved.eliminations.ghosts],
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
      dotTargets,
      diamondTargets,
      chevronTargets,
      minesweeperTargets,
      waterDropletTargets,
      cardinalTargets,
      spinnerTargets,
      sentinelTargets,
      ghostTargets,
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
        dots: [...solvedEliminations.dots],
        diamonds: [...solvedEliminations.diamonds],
        chevrons: [...solvedEliminations.chevrons],
        minesweeper: [...solvedEliminations.minesweeper],
        waterDroplets: [...solvedEliminations.waterDroplets],
        cardinals: [...solvedEliminations.cardinals],
        spinners: [...solvedEliminations.spinners],
        sentinels: [...solvedEliminations.sentinels],
        ghosts: [...solvedEliminations.ghosts],
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
    const symbols = {
      arrowTargets,
      colorSquares,
      starTargets,
      triangleTargets,
      dotTargets,
      diamondTargets,
      chevronTargets,
      minesweeperTargets,
      waterDropletTargets,
      cardinalTargets,
      spinnerTargets,
      sentinelTargets,
      ghostTargets,
      polyominoSymbols,
      negatorTargets,
      hexTargets,
    }
    let solved: Point[] | null = null
    solved = findSimplestValidSolutionPath(
      puzzle.edges,
      activeKinds,
      symbols,
      MANUAL_SOLVER_VISIT_BUDGET
    )
    if (!solved) {
      solved = findSimplestValidSolutionPath(
        puzzle.edges,
        activeKinds,
        symbols,
        MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
      )
    }
    if (!solved && solutionPath && solutionPath.length >= 2) {
      const hintedEdges = edgesFromPath(solutionPath)
      const hintedEvaluation = evaluatePathConstraints(
        solutionPath,
        hintedEdges,
        activeKinds,
        symbols,
        'first'
      )
      if (hintedEvaluation.ok) {
        solved = solutionPath
      }
    }
    if (!solved) {
      solved = findAnyValidSolutionPath(
        puzzle.edges,
        activeKinds,
        symbols,
        MANUAL_SOLVER_VISIT_BUDGET
      )
    }
    if (!solved) {
      solved = findAnyValidSolutionPath(
        puzzle.edges,
        activeKinds,
        symbols,
        MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
      )
    }
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
      dots: new Set(eliminations.dots),
      diamonds: new Set(eliminations.diamonds),
      chevrons: new Set(eliminations.chevrons),
      minesweeper: new Set(eliminations.minesweeper),
      waterDroplets: new Set(eliminations.waterDroplets),
      cardinals: new Set(eliminations.cardinals),
      spinners: new Set(eliminations.spinners),
      sentinels: new Set(eliminations.sentinels),
      ghosts: new Set(eliminations.ghosts),
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
          {chevronTargets.length > 0 && (
            <g className="chevrons">
              {chevronTargets.map((target, index) => {
                const offsets =
                  target.count === 1
                    ? [0]
                    : target.count === 2
                      ? [-0.09, 0.09]
                      : [-0.18, 0, 0.18]
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`chevron-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(${chevronDirectionAngle(target.direction)})`}
                    style={
                      eliminated.chevrons.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    {offsets.map((offset, chevronIndex) => (
                      <polygon
                        key={`chevron-mark-${target.cellX}-${target.cellY}-${index}-${chevronIndex}`}
                        className="chevron-target"
                        points={chevronPoints(offset, 0, 0.122)}
                        style={{ fill: target.color }}
                      />
                    ))}
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
          {dotTargets.length > 0 && (
            <g className="dots">
              {dotTargets.map((target, index) => {
                const dotRadius = 0.085
                const positions =
                  target.count === 1
                    ? [{ x: 0, y: 0 }]
                    : target.count === 2
                      ? [{ x: -0.10, y: 0 }, { x: 0.10, y: 0 }]
                      : target.count === 3
                        ? [{ x: -0.20, y: 0 }, { x: 0, y: 0 }, { x: 0.20, y: 0 }]
                        : [
                            { x: -0.10, y: -0.10 },
                            { x: 0.10, y: -0.10 },
                            { x: -0.10, y: 0.10 },
                            { x: 0.10, y: 0.10 },
                          ]
                return (
                  <g key={`dot-${target.cellX}-${target.cellY}-${index}`}>
                    {positions.map((offset, dotIndex) => (
                      <circle
                        key={`dot-mark-${target.cellX}-${target.cellY}-${index}-${dotIndex}`}
                        className="dot-target"
                        cx={target.cellX + 0.5 + offset.x}
                        cy={target.cellY + 0.5 + offset.y}
                        r={dotRadius}
                        style={
                          eliminated.dots.has(index)
                            ? { fill: target.color, opacity: 0.24, filter: symbolGlowFilter(target.color) }
                            : { fill: target.color, filter: symbolGlowFilter(target.color) }
                        }
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}
          {diamondTargets.length > 0 && (
            <g className="diamonds">
              {diamondTargets.map((target, index) => {
                const radius = 0.09
                const positions =
                  target.count === 1
                    ? [{ x: 0, y: 0 }]
                    : target.count === 2
                      ? [{ x: -0.11, y: 0 }, { x: 0.11, y: 0 }]
                      : target.count === 3
                        ? [{ x: -0.2, y: 0 }, { x: 0, y: 0 }, { x: 0.2, y: 0 }]
                        : [
                            { x: -0.11, y: -0.11 },
                            { x: 0.11, y: -0.11 },
                            { x: -0.11, y: 0.11 },
                            { x: 0.11, y: 0.11 },
                          ]
                return (
                  <g key={`diamond-${target.cellX}-${target.cellY}-${index}`}>
                    {positions.map((offset, diamondIndex) => (
                      <polygon
                        key={`diamond-mark-${target.cellX}-${target.cellY}-${index}-${diamondIndex}`}
                        className="diamond-target"
                        points={diamondPoints(
                          target.cellX + 0.5 + offset.x,
                          target.cellY + 0.5 + offset.y,
                          radius
                        )}
                        style={
                          eliminated.diamonds.has(index)
                            ? { fill: target.color, opacity: 0.24, filter: symbolGlowFilter(target.color) }
                            : { fill: target.color, filter: symbolGlowFilter(target.color) }
                        }
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}
          {minesweeperTargets.length > 0 && (
            <g className="minesweeper-targets">
              {minesweeperTargets.map((target, index) => {
                const pixels = minesweeperDigitPixels(target.value)
                const unit = 0.05
                const width = 5 * unit
                const height = 7 * unit
                const x = target.cellX + 0.5 - width / 2
                const y = target.cellY + 0.5 - height / 2
                const shadowOffset = unit * 0.26
                return (
                  <g
                    key={`mine-${target.cellX}-${target.cellY}-${index}`}
                    style={eliminated.minesweeper.has(index) ? { opacity: 0.24 } : undefined}
                  >
                    {pixels.map((pixel, pixelIndex) => (
                      <rect
                        key={`mine-shadow-${index}-${pixelIndex}`}
                        className="mine-number-shadow"
                        x={x + pixel.x * unit + shadowOffset}
                        y={y + pixel.y * unit + shadowOffset}
                        width={unit}
                        height={unit}
                        rx={0}
                      />
                    ))}
                    {pixels.map((pixel, pixelIndex) => (
                      <rect
                        key={`mine-fill-${index}-${pixelIndex}`}
                        className="mine-number-fill"
                        x={x + pixel.x * unit}
                        y={y + pixel.y * unit}
                        width={unit}
                        height={unit}
                        rx={0}
                        style={{ fill: target.color }}
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}
          {waterDropletTargets.length > 0 && (
            <g className="water-droplets">
              {waterDropletTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const dropletPath =
                  'M 0 -0.2 C 0.17 -0.07 0.24 0.07 0.16 0.2 C 0.09 0.31 -0.09 0.31 -0.16 0.2 C -0.24 0.07 -0.17 -0.07 0 -0.2 Z'
                const accentColors = waterDropletAccentColors(target.color)
                const centerYOffset = -0.055
                return (
                  <g
                    key={`water-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(${waterDropletDirectionAngle(target.direction)}) translate(0 ${centerYOffset})`}
                    style={
                      eliminated.waterDroplets.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <path
                      className="water-droplet"
                      d={dropletPath}
                      style={{ fill: target.color }}
                    />
                    <path
                      className="water-droplet-rim"
                      d={dropletPath}
                      style={{ stroke: accentColors.rim }}
                    />
                    <ellipse
                      className="water-droplet-gloss"
                      cx={-0.045}
                      cy={-0.065}
                      rx={0.054}
                      ry={0.036}
                      transform="rotate(-26)"
                      style={{ fill: accentColors.gloss }}
                    />
                    <circle
                      className="water-droplet-bubble"
                      cx={0.06}
                      cy={0.088}
                      r={0.022}
                      style={{ fill: accentColors.bubble }}
                    />
                  </g>
                )
              })}
            </g>
          )}
          {spinnerTargets.length > 0 && (
            <g className="spinners">
              {spinnerTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`spinner-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) scale(0.0086) translate(-50 -50)`}
                    style={
                      eliminated.spinners.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <g
                      transform={
                        spinnerDirectionScaleX(target.direction) < 0
                          ? 'translate(100 0) scale(-1 1)'
                          : undefined
                      }
                    >
                      <circle
                        className="tile-spinner-ring"
                        cx="50"
                        cy="50"
                        r="28"
                        pathLength="100"
                        strokeDasharray="86 14"
                        transform="rotate(-10 50 50)"
                        style={{ stroke: target.color }}
                      />
                      <polygon
                        className="tile-spinner-head"
                        points="62.8,22.6 69.1,30.7 59.6,29.3"
                        style={{ stroke: target.color }}
                      />
                    </g>
                  </g>
                )
              })}
            </g>
          )}
          {sentinelTargets.length > 0 && (
            <g className="sentinels">
              {sentinelTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`sentinel-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(${sentinelDirectionAngle(target.direction)})`}
                    style={
                      eliminated.sentinels.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <path
                      className="sentinel-arc"
                      d="M -0.17 0.095 A 0.17 0.17 0 0 1 0.17 0.095"
                      style={{ stroke: target.color }}
                    />
                    <path
                      className="sentinel-core"
                      d="M -0.058 0.095 A 0.058 0.058 0 0 1 0.058 0.095 Z"
                      style={{ fill: target.color }}
                    />
                  </g>
                )
              })}
            </g>
          )}
          {ghostTargets.length > 0 && (
            <g className="ghosts">
              {ghostTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const eyeColor = ghostEyeColor(target.color)
                return (
                  <g
                    key={`ghost-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.ghosts.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <g transform="scale(0.0062) translate(-50 -48)">
                      <path
                        className="ghost-body"
                        d="M 16 80 L 24 34 C 28 20 38 12 50 12 C 62 12 72 20 76 34 L 84 80 L 68 72 L 58 84 L 50 74 L 42 84 L 32 72 Z"
                        style={{ fill: target.color }}
                      />
                      <circle className="ghost-eye" cx={37} cy={45} r={5.3} style={{ fill: eyeColor }} />
                      <circle className="ghost-eye" cx={63} cy={45} r={5.3} style={{ fill: eyeColor }} />
                    </g>
                  </g>
                )
              })}
            </g>
          )}
          {cardinalTargets.length > 0 && (
            <g className="cardinals">
              {cardinalTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`cardinal-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.cardinals.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <rect className="cardinal-body" x={-0.04} y={-0.146} width={0.08} height={0.11} rx={0.03} style={{ fill: target.color }} />
                    <rect className="cardinal-body" x={-0.04} y={0.036} width={0.08} height={0.11} rx={0.03} style={{ fill: target.color }} />
                    <rect className="cardinal-body" x={-0.146} y={-0.04} width={0.11} height={0.08} rx={0.03} style={{ fill: target.color }} />
                    <rect className="cardinal-body" x={0.036} y={-0.04} width={0.11} height={0.08} rx={0.03} style={{ fill: target.color }} />
                    <polyline className="cardinal-chevron" points="-0.085,-0.164 0,-0.248 0.085,-0.164" style={{ stroke: target.color }} />
                    <polyline className="cardinal-chevron" points="0.164,-0.085 0.248,0 0.164,0.085" style={{ stroke: target.color }} />
                    <polyline className="cardinal-chevron" points="0.085,0.164 0,0.248 -0.085,0.164" style={{ stroke: target.color }} />
                    <polyline className="cardinal-chevron" points="-0.164,0.085 -0.248,0 -0.164,-0.085" style={{ stroke: target.color }} />
                  </g>
                )
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
        <div className="puzzle-buttons">
          <button className="btn primary" onClick={handleNewPuzzle}>
            New puzzle
          </button>
          <button className="btn ghost" onClick={handleSolve} disabled={result === 'success'}>
            Solve
          </button>
          <button className="btn ghost" onClick={handleViewLastSolved} disabled={!lastSolved}>
            Last solved puzzle
          </button>
        </div>
        <p className="puzzle-hint">Right-click resets the path.</p>
      </div>
    </div>
  )
}

export default PuzzlePage
