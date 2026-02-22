import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tile, TileKind } from './HomePage'
import { END, END_CAP_LENGTH, GAP_SIZE, START, VIEWBOX } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
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
import { checkGhosts, generateGhostsForEdges } from './symbols/ghost'
import type { CrystalTarget } from './symbols/crystals'
import { collectFailingCrystalIndexes, generateCrystalsForEdges } from './symbols/crystals'
import type { ChipTarget } from './symbols/chips'
import { generateChipsForEdges } from './symbols/chips'
import type { DiceTarget } from './symbols/dice'
import { generateDiceForEdges } from './symbols/dice'
import type { BlackHoleTarget } from './symbols/blackHoles'
import { generateBlackHolesForEdges } from './symbols/blackHoles'
import type { OpenPentagonTarget } from './symbols/openPentagons'
import { generateOpenPentagonsForEdges } from './symbols/openPentagons'
import type { TallyMarkTarget } from './symbols/tallyMarks'
import {
  checkTallyMarks,
  generateTallyMarksForEdges,
  recalculateTallyMarkTargets,
} from './symbols/tallyMarks'
import type { EyeTarget } from './symbols/eyes'
import { generateEyesForEdges, resolveEyeEffects } from './symbols/eyes'
import type { CompassTarget } from './symbols/compass'
import { generateCompassesForEdges } from './symbols/compass'
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
  crystals: number[]
  chips: number[]
  dice: number[]
  blackHoles: number[]
  openPentagons: number[]
  tallyMarks: number[]
  eyes: number[]
  compasses: number[]
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
    crystals: [],
    chips: [],
    dice: [],
    blackHoles: [],
    openPentagons: [],
    tallyMarks: [],
    eyes: [],
    compasses: [],
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
    if (symbol.kind === 'crystal') mapped.crystals.push(symbol.index)
    if (symbol.kind === 'chip') mapped.chips.push(symbol.index)
    if (symbol.kind === 'dice') mapped.dice.push(symbol.index)
    if (symbol.kind === 'black-hole') mapped.blackHoles.push(symbol.index)
    if (symbol.kind === 'open-pentagon') mapped.openPentagons.push(symbol.index)
    if (symbol.kind === 'tally-mark') mapped.tallyMarks.push(symbol.index)
    if (symbol.kind === 'eye') mapped.eyes.push(symbol.index)
    if (symbol.kind === 'compass') mapped.compasses.push(symbol.index)
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

function openPentagonPoints(centerX: number, centerY: number, size: number) {
  const radius = size * 0.62
  const startAngleDeg = 126
  const stepDeg = 72
  const points = Array.from({ length: 5 }, (_, index) => startAngleDeg + stepDeg * index).map((angleDeg) => {
    const angle = (angleDeg * Math.PI) / 180
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    return `${x},${y}`
  })
  return points.join(' ')
}

function eyeDiamondPoints(centerX: number, centerY: number, size: number) {
  const halfWidth = size * 0.98
  const halfHeight = size * 0.64
  return `${centerX - halfWidth},${centerY} ${centerX},${centerY - halfHeight} ${centerX + halfWidth},${centerY} ${centerX},${centerY + halfHeight}`
}

function eyePupilOffset(direction: EyeTarget['direction']) {
  if (direction === 'left') return { x: -0.056, y: 0 }
  if (direction === 'up') return { x: 0, y: -0.04 }
  if (direction === 'down') return { x: 0, y: 0.04 }
  return { x: 0.056, y: 0 }
}

function tallyMarkSegments(
  count: number,
  groupWidth: number,
  groupGap: number,
  topY: number,
  bottomY: number
) {
  const normalizedCount = Math.max(0, Math.floor(count))
  if (normalizedCount === 0) return []
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  const rowCounts: number[] = []
  let remaining = normalizedCount
  while (remaining > 0) {
    const rowCount = Math.min(10, remaining)
    rowCounts.push(rowCount)
    remaining -= rowCount
  }
  const totalHeight = bottomY - topY
  const rowGap = rowCounts.length > 1 ? totalHeight * 0.2 : 0
  const rowHeight = (totalHeight - rowGap * (rowCounts.length - 1)) / rowCounts.length

  const addGroup = (
    groupIndex: number,
    markCount: number,
    withSlash: boolean,
    startX: number,
    rowTop: number,
    rowBottom: number
  ) => {
    const groupX = startX + groupIndex * (groupWidth + groupGap)
    const markTotal = Math.min(4, markCount)
    if (markTotal > 0) {
      const markSpacing = groupWidth / 3.4
      const marksSpan = (markTotal - 1) * markSpacing
      const firstX = groupX + (groupWidth - marksSpan) / 2
      for (let markIndex = 0; markIndex < markTotal; markIndex += 1) {
        const x = firstX + markIndex * markSpacing
        segments.push({ x1: x, y1: rowTop, x2: x, y2: rowBottom })
      }
    }
    if (withSlash) {
      const rowHeightLocal = rowBottom - rowTop
      segments.push({
        x1: groupX + groupWidth * 0.02,
        y1: rowBottom - rowHeightLocal * 0.06,
        x2: groupX + groupWidth * 0.98,
        y2: rowTop + rowHeightLocal * 0.06,
      })
    }
  }

  rowCounts.forEach((rowCount, rowIndex) => {
    const fullGroups = Math.floor(rowCount / 5)
    const remainder = rowCount % 5
    const groupCount = fullGroups + (remainder > 0 ? 1 : 0)
    const totalWidth = groupCount * groupWidth + (groupCount - 1) * groupGap
    const startX = -totalWidth / 2
    const rowTop = topY + rowIndex * (rowHeight + rowGap)
    const rowBottom = rowTop + rowHeight
    for (let groupIndex = 0; groupIndex < fullGroups; groupIndex += 1) {
      addGroup(groupIndex, 4, true, startX, rowTop, rowBottom)
    }
    if (remainder > 0) {
      addGroup(fullGroups, remainder, false, startX, rowTop, rowBottom)
    }
  })
  return segments
}

function rosettePath(
  centerX: number,
  centerY: number,
  baseRadius: number,
  waveAmplitude: number,
  waveCount: number,
  wavePhase = 0,
  samples = 64
) {
  const points: string[] = []
  for (let i = 0; i <= samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2
    const radius = baseRadius + waveAmplitude * Math.cos(theta * waveCount + wavePhase)
    const x = centerX + radius * Math.cos(theta)
    const y = centerY + radius * Math.sin(theta)
    points.push(`${x},${y}`)
  }
  if (points.length === 0) return ''
  return `M ${points[0]} L ${points.slice(1).join(' ')} Z`
}

function dicePipOffsets(value: number) {
  const tl = { x: -0.078, y: -0.078 }
  const tc = { x: 0, y: -0.078 }
  const tr = { x: 0.078, y: -0.078 }
  const ml = { x: -0.078, y: 0 }
  const c = { x: 0, y: 0 }
  const mr = { x: 0.078, y: 0 }
  const bl = { x: -0.078, y: 0.078 }
  const bc = { x: 0, y: 0.078 }
  const br = { x: 0.078, y: 0.078 }
  if (value <= 1) return [c]
  if (value === 2) return [tl, br]
  if (value === 3) return [tl, c, br]
  if (value === 4) return [tl, tr, bl, br]
  if (value === 5) return [tl, tr, c, bl, br]
  if (value === 6) return [tl, tr, ml, mr, bl, br]
  if (value === 7) return [tl, tr, ml, c, mr, bl, br]
  if (value === 8) return [tl, tc, tr, ml, mr, bl, bc, br]
  return [tl, tc, tr, ml, c, mr, bl, bc, br]
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

function adjustColor(color: string, amount: number) {
  const value = color.trim()
  const shortHexMatch = /^#([0-9a-fA-F]{3})$/.exec(value)
  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(value)

  const channels = shortHexMatch
    ? shortHexMatch[1].split('').map((digit) => parseInt(digit + digit, 16))
    : hexMatch
      ? [
          parseInt(hexMatch[1].slice(0, 2), 16),
          parseInt(hexMatch[1].slice(2, 4), 16),
          parseInt(hexMatch[1].slice(4, 6), 16),
        ]
      : null

  if (!channels) return color

  const clamp = (value: number) => Math.max(0, Math.min(255, value))
  const mapChannel = (channel: number) => {
    if (amount >= 0) return clamp(Math.round(channel + (255 - channel) * amount))
    return clamp(Math.round(channel * (1 + amount)))
  }

  const [r, g, b] = channels.map(mapChannel)
  return `rgb(${r}, ${g}, ${b})`
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

function crystalFacetColors(crystalColor: string) {
  const luminance = colorLuminance(crystalColor)
  const extraDark = luminance !== null && luminance > 0.82
  return {
    topLeft: adjustColor(crystalColor, extraDark ? 0.06 : 0.16),
    topRight: adjustColor(crystalColor, extraDark ? 0.03 : 0.08),
    left: adjustColor(crystalColor, extraDark ? -0.14 : -0.06),
    right: adjustColor(crystalColor, extraDark ? -0.24 : -0.14),
    centerLeft: adjustColor(crystalColor, extraDark ? 0.02 : 0.1),
    centerRight: adjustColor(crystalColor, extraDark ? -0.06 : -0.02),
    bottomLeft: adjustColor(crystalColor, extraDark ? -0.08 : -0.02),
    bottomRight: adjustColor(crystalColor, extraDark ? -0.26 : -0.18),
  }
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

function biasPreferredColors(preferredColors: string[], rng: () => number) {
  const unique = Array.from(new Set(preferredColors)).slice(0, MAX_SYMBOL_COLORS)
  if (unique.length === 0) return unique
  if (unique.length === 1) {
    if (rng() >= 0.72) return unique
    const fallback = shuffle(
      COLOR_PALETTE.filter((color) => color !== unique[0]),
      rng
    )
    const extraColor = fallback[0]
    return extraColor ? [unique[0], extraColor] : unique
  }
  if (unique.length === 2 && rng() < 0.28) {
    const fallback = shuffle(
      COLOR_PALETTE.filter((color) => !unique.includes(color)),
      rng
    )
    const extraColor = fallback[0]
    return extraColor ? [...unique, extraColor] : unique
  }
  return unique
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
  crystalTargets: CrystalTarget[],
  chipTargets: ChipTarget[],
  diceTargets: DiceTarget[],
  blackHoleTargets: BlackHoleTarget[],
  openPentagonTargets: OpenPentagonTarget[],
  eyeTargets: EyeTarget[],
  tallyTargets: TallyMarkTarget[],
  compassTargets: CompassTarget[],
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
  for (const crystal of crystalTargets) colors.add(crystal.color)
  for (const chip of chipTargets) colors.add(chip.color)
  for (const dice of diceTargets) colors.add(dice.color)
  for (const blackHole of blackHoleTargets) colors.add(blackHole.color)
  for (const openPentagon of openPentagonTargets) colors.add(openPentagon.color)
  for (const eye of eyeTargets) colors.add(eye.color)
  for (const tally of tallyTargets) colors.add(tally.color)
  for (const compass of compassTargets) colors.add(compass.color)
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
  crystalTargets: CrystalTarget[]
  chipTargets: ChipTarget[]
  diceTargets: DiceTarget[]
  blackHoleTargets: BlackHoleTarget[]
  openPentagonTargets: OpenPentagonTarget[]
  eyeTargets: EyeTarget[]
  tallyTargets: TallyMarkTarget[]
  compassTargets: CompassTarget[]
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
  if (kind === 'crystals') return snapshot.crystalTargets.length > 0
  if (kind === 'chips') return snapshot.chipTargets.length > 0
  if (kind === 'dice') return snapshot.diceTargets.length > 0
  if (kind === 'black-holes') return snapshot.blackHoleTargets.length > 0
  if (kind === 'open-pentagons') return snapshot.openPentagonTargets.length > 0
  if (kind === 'eyes') return snapshot.eyeTargets.length > 0
  if (kind === 'tally-marks') return snapshot.tallyTargets.length > 0
  if (kind === 'compasses') return snapshot.compassTargets.length > 0
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
    () => selectedTiles.map((tile) => tile.kind),
    [selectedTiles]
  )
  const selectedKindsKey = selectedKinds.join('|') || 'gap-line'

  const allEdges = useMemo(() => listAllEdges(), [])

  const generated = useMemo(() => {
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
      crystalTargets: CrystalTarget[]
      chipTargets: ChipTarget[]
      diceTargets: DiceTarget[]
      blackHoleTargets: BlackHoleTarget[]
      openPentagonTargets: OpenPentagonTarget[]
      eyeTargets: EyeTarget[]
      tallyTargets: TallyMarkTarget[]
      compassTargets: CompassTarget[]
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
    const selectedSymbolCount = baseKinds.filter((kind) => kind !== 'gap-line').length
    const hasEyeComboPressure =
      baseKinds.includes('eyes') &&
      (
        selectedSymbolCount >= 3 ||
        baseKinds.includes('ghost') ||
        baseKinds.includes('crystals') ||
        baseKinds.includes('tally-marks') ||
        baseKinds.includes('compasses') ||
        baseKinds.includes('open-pentagons') ||
        baseKinds.includes('black-holes') ||
        baseKinds.includes('chips') ||
        baseKinds.includes('negator')
      )
    const hasHeavyKinds =
      baseKinds.includes('negative-polyomino') ||
      baseKinds.includes('rotated-negative-polyomino') ||
      baseKinds.includes('negator') ||
      hasEyeComboPressure
    const hasCrystalNegatorPair =
      baseKinds.includes('crystals') && baseKinds.includes('negator')
    const hasEyeCrystalNegatorCombo =
      baseKinds.includes('eyes') &&
      baseKinds.includes('crystals') &&
      baseKinds.includes('negator') &&
      !baseKinds.includes('ghost')
    const hasNegatorCrystalGhostCombo =
      baseKinds.includes('negator') &&
      baseKinds.includes('crystals') &&
      baseKinds.includes('ghost')
    const hasStressCombo =
      hasCrystalNegatorPair &&
      (baseKinds.includes('chips') || baseKinds.includes('ghost') || baseKinds.includes('dice'))
    const hasPolyKindsRequested =
      baseKinds.includes('polyomino') ||
      baseKinds.includes('rotated-polyomino') ||
      baseKinds.includes('negative-polyomino') ||
      baseKinds.includes('rotated-negative-polyomino')
    const hasNegatorGhostCrystalPolyCombo =
      baseKinds.includes('negator') &&
      baseKinds.includes('ghost') &&
      baseKinds.includes('crystals') &&
      hasPolyKindsRequested
    const enforceWildness = !hasStressCombo
    const avoidRecentPathReuse = !hasStressCombo
    const polyKinds = new Set<TileKind>([
      'polyomino',
      'rotated-polyomino',
      'negative-polyomino',
      'rotated-negative-polyomino',
    ])
    const isPolyOnlySelection =
      baseKinds.length > 0 && baseKinds.every((kind) => kind === 'gap-line' || polyKinds.has(kind))
    let generationAttempts = isPolyOnlySelection
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
    if (hasCrystalNegatorPair) {
      generationAttempts +=
        selectedSymbolCount <= 2 ? 560 : selectedSymbolCount === 3 ? 320 : 170
    }
    if (hasStressCombo) {
      generationAttempts = Math.min(generationAttempts, selectedSymbolCount >= 4 ? 340 : 300)
    }
    if (hasNegatorCrystalGhostCombo) {
      generationAttempts = Math.min(generationAttempts, selectedSymbolCount <= 3 ? 110 : 150)
    }
    if (hasNegatorGhostCrystalPolyCombo) {
      generationAttempts = Math.min(generationAttempts, selectedSymbolCount >= 4 ? 240 : 210)
    }
    if (hasEyeCrystalNegatorCombo) {
      generationAttempts = Math.min(generationAttempts, selectedSymbolCount >= 3 ? 260 : 220)
    }
    const maxPendingCandidatesBase = Math.max(
      isPolyOnlySelection ? 6 : MAX_PENDING_RECOVERY_CANDIDATES,
      selectedSymbolCount >= 4 ? 12 : selectedSymbolCount === 3 ? 10 : 8
    ) + (hasCrystalNegatorPair ? 4 : 0)
    const maxPendingCandidates = hasNegatorGhostCrystalPolyCombo
      ? Math.min(6, maxPendingCandidatesBase)
      : hasNegatorCrystalGhostCombo
        ? Math.min(5, maxPendingCandidatesBase)
      : hasStressCombo
        ? Math.min(7, maxPendingCandidatesBase)
        : maxPendingCandidatesBase
    const mustIncludeRotatedPolyomino =
      baseKinds.includes('polyomino') && baseKinds.includes('rotated-polyomino')
    type PartialCandidate = Omit<PendingCandidate, 'solutionPathHint' | 'score'> & {
      solutionPath: Point[]
    }
    const pendingCandidates: PendingCandidate[] = []
    let bestPartialCandidate: PartialCandidate | null = null
    let bestPartialScore = Number.NEGATIVE_INFINITY
    const buildCandidateFromPending = (pending: PendingCandidate, solvedPath: Point[]) => ({
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
      crystalTargets: pending.crystalTargets,
      chipTargets: pending.chipTargets,
      diceTargets: pending.diceTargets,
      blackHoleTargets: pending.blackHoleTargets,
      openPentagonTargets: pending.openPentagonTargets,
      eyeTargets: pending.eyeTargets,
      tallyTargets: pending.tallyTargets,
      compassTargets: pending.compassTargets,
      polyominoSymbols: pending.polyominoSymbols,
      negatorTargets: pending.negatorTargets,
      hexTargets: pending.hexTargets,
      solutionPath: solvedPath,
    })
    const generationSeedOffsets = hasNegatorCrystalGhostCombo
      ? [0, 1_000_003]
      : hasNegatorGhostCrystalPolyCombo
      ? [0, 1_000_003]
      : hasStressCombo
        ? [0, 1_000_003, 2_000_006]
      : hasCrystalNegatorPair
        ? [0, 1_000_003, 2_000_006]
      : [0, 1_000_003]
    const generationStartMs = Date.now()
    const generationSoftTimeLimitMs = hasNegatorCrystalGhostCombo
      ? 1_250
      : hasNegatorGhostCrystalPolyCombo
      ? 1_650
      : hasStressCombo
        ? 2_250
      : hasEyeCrystalNegatorCombo
        ? 2_100
        : Number.POSITIVE_INFINITY
    generationSeedLoop: for (const generationSeedOffset of generationSeedOffsets) {
      const generationSeed = seed + generationSeedOffset
      attemptLoop: for (let attempt = 0; attempt < generationAttempts; attempt += 1) {
      if (
        Date.now() - generationStartMs > generationSoftTimeLimitMs &&
        (pendingCandidates.length > 0 || hasNegatorCrystalGhostCombo || hasEyeCrystalNegatorCombo)
      ) {
        break generationSeedLoop
      }
      const rng = mulberry32(generationSeed + attempt * 313 + 11)
      const active: TileKind[] = [...baseKinds]
      const colorRuleActive =
        active.includes('stars') ||
        active.includes('chips') ||
        active.includes('black-holes') ||
        active.includes('open-pentagons')

      if (
        (active.includes('negative-polyomino') || active.includes('rotated-negative-polyomino')) &&
        !active.includes('polyomino') &&
        !active.includes('rotated-polyomino')
      ) {
        continue attemptLoop
      }

      const hexSeed = generationSeed + attempt * 7
      const shouldForceFullGridHex = active.includes('hexagon') && shouldUseFullGridHex(hexSeed)
      const forcedFullGridHexPath = shouldForceFullGridHex
        ? buildFullGridHexPath(generationSeed + attempt * 11839 + 17)
        : null

      let edges = active.includes('gap-line')
        ? shouldForceFullGridHex && forcedFullGridHexPath
          ? generatePuzzleKeepingPath(generationSeed + attempt * 131, forcedFullGridHexPath).edges
          : generatePuzzle(generationSeed + attempt * 131).edges
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
      let crystalTargets: CrystalTarget[] = []
      let chipTargets: ChipTarget[] = []
      let diceTargets: DiceTarget[] = []
      let blackHoleTargets: BlackHoleTarget[] = []
      let openPentagonTargets: OpenPentagonTarget[] = []
      let eyeTargets: EyeTarget[] = []
      let tallyTargets: TallyMarkTarget[] = []
      let compassTargets: CompassTarget[] = []
      let polyominoSymbols: PolyominoSymbol[] = []
      let negatorTargets: NegatorTarget[] = []
      const maybeCapturePartialCandidate = () => {
        if (!hasStressCombo) return
        if (!solutionPath || solutionPath.length < 2) return

        const snapshot: GeneratedSymbolSnapshot = {
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
          crystalTargets,
          chipTargets,
          diceTargets,
          blackHoleTargets,
          openPentagonTargets,
          eyeTargets,
          tallyTargets,
          compassTargets,
          polyominoSymbols,
          negatorTargets,
          hexTargets: [],
        }
        const partialActiveKinds = active.filter((kind) => hasGeneratedSymbolForKind(kind, snapshot))
        const nonGapKindCount = partialActiveKinds.filter((kind) => kind !== 'gap-line').length
        if (nonGapKindCount === 0) return

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
          crystalTargets.length +
          chipTargets.length +
          diceTargets.length +
          blackHoleTargets.length +
          openPentagonTargets.length +
          eyeTargets.length +
          tallyTargets.length +
          compassTargets.length +
          polyominoSymbols.length +
          negatorTargets.length
        const score = nonGapKindCount * 100 + symbolCount * 10 + solutionPath.length
        if (score <= bestPartialScore) return

        bestPartialScore = score
        bestPartialCandidate = {
          puzzle: { edges: new Set(edges) },
          activeKinds: [...partialActiveKinds],
          arrowTargets: [...arrowTargets],
          colorSquares: [...colorSquares],
          starTargets: [...starTargets],
          triangleTargets: [...triangleTargets],
          dotTargets: [...dotTargets],
          diamondTargets: [...diamondTargets],
          chevronTargets: [...chevronTargets],
          minesweeperTargets: [...minesweeperTargets],
          waterDropletTargets: [...waterDropletTargets],
          cardinalTargets: [...cardinalTargets],
          spinnerTargets: [...spinnerTargets],
          sentinelTargets: [...sentinelTargets],
          ghostTargets: [...ghostTargets],
          crystalTargets: [...crystalTargets],
          chipTargets: [...chipTargets],
          diceTargets: [...diceTargets],
          blackHoleTargets: [...blackHoleTargets],
          openPentagonTargets: [...openPentagonTargets],
          eyeTargets: [...eyeTargets],
          tallyTargets: [...tallyTargets],
          compassTargets: [...compassTargets],
          polyominoSymbols: [...polyominoSymbols],
          negatorTargets: [...negatorTargets],
          hexTargets: [],
          solutionPath: solutionPath.map((point) => ({ ...point })),
        }
      }
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
      const tunedLoopyAttempts = hasNegatorCrystalGhostCombo
        ? Math.min(loopyAttempts, activeSymbolCount <= 3 ? 36 : 48)
        : hasNegatorGhostCrystalPolyCombo
        ? Math.max(loopyAttempts, activeSymbolCount <= 2 ? 86 : activeSymbolCount === 3 ? 72 : 58)
        : hasStressCombo
          ? Math.max(loopyAttempts, activeSymbolCount <= 2 ? 120 : activeSymbolCount === 3 ? 96 : 76)
          : hasCrystalNegatorPair
            ? Math.max(loopyAttempts, activeSymbolCount <= 2 ? 160 : activeSymbolCount === 3 ? 134 : 98)
            : loopyAttempts
      const loopyMinLength = hasAnyPolyKindsInAttempt
        ? Math.max(9, baseWildMinLength - 1)
        : baseWildMinLength
      const attemptPathSeed = shouldForceFullGridHex && forcedFullGridHexPath
        ? forcedFullGridHexPath
        : findBestLoopyPathByRegions(
            edges,
            rng,
            tunedLoopyAttempts,
            loopyMinLength,
            recentPathSignatureSet
          ) ??
          findRandomPath(edges, rng)
      let solutionPath: Point[] | null = attemptPathSeed
      if (active.includes('color-squares')) {
        const colorSquarePool = colorRuleActive
          ? undefined
          : buildColorSquarePool(rng)
        const baseDesiredColorCount = colorRuleActive ? 2 : rng() < 0.5 ? 2 : 3
        const desiredColorCount = Math.max(
          1,
          Math.min(baseDesiredColorCount, colorSquarePool?.length ?? baseDesiredColorCount)
        )
        let colorResult = generateColorSquaresForEdges(
          edges,
          generationSeed + attempt * 2001,
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

      const requiresNegatorCrystalGhostSafety =
        active.includes('negator') && active.includes('crystals') && active.includes('ghost')
      const crystalGenerationSymbolCount =
        active.includes('eyes') &&
        active.includes('crystals') &&
        active.includes('negator') &&
        !active.includes('ghost')
          ? Math.max(baseKinds.length, 4)
          : baseKinds.length

      if (active.includes('crystals') && !active.includes('eyes')) {
        const blockedCrystalCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
        ])
        const preferredCrystalColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(
                new Set([
                  ...colorSquares.map((square) => square.color),
                ])
              ).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const crystalResult = generateCrystalsForEdges(
          edges,
          generationSeed + attempt * 31241,
          blockedCrystalCells,
          colorRuleActive,
          crystalGenerationSymbolCount,
          preferredCrystalColors,
          solutionPath ?? undefined,
          active.includes('negator'),
          requiresNegatorCrystalGhostSafety
        )
        if (crystalResult) {
          crystalTargets = crystalResult.targets
          solutionPath = crystalResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('ghost') && !active.includes('eyes')) {
        const blockedGhostCells = new Set<string>([
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const preferredGhostColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(
                new Set([
                  ...colorSquares.map((square) => square.color),
                  ...crystalTargets.map((target) => target.color),
                ])
              ).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const ghostPlacementAttempts = requiresNegatorCrystalGhostSafety ? 4 : 1
        let acceptedGhostTargets: GhostTarget[] | null = null
        let acceptedGhostPath: Point[] | null = null
        for (let ghostAttempt = 0; ghostAttempt < ghostPlacementAttempts; ghostAttempt += 1) {
          const ghostResult = generateGhostsForEdges(
            edges,
            generationSeed + attempt * 30967 + ghostAttempt * 173,
            blockedGhostCells,
            colorRuleActive,
            baseKinds.length,
            preferredGhostColors,
            solutionPath ?? undefined,
            active.includes('crystals') && !requiresNegatorCrystalGhostSafety
          )
          if (!ghostResult) continue

          if (requiresNegatorCrystalGhostSafety) {
            const candidateUsedEdges = edgesFromPath(ghostResult.solutionPath)
            const failingCrystalIndexes = Array.from(
              collectFailingCrystalIndexes(candidateUsedEdges, crystalTargets)
            )
            if (failingCrystalIndexes.length !== 1) {
              continue
            }

            const regions = buildCellRegions(candidateUsedEdges)
            const occupiedCells = new Set<string>([
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
              ...ghostResult.targets.map((target) => `${target.cellX},${target.cellY}`),
              ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
            ])
            const failingCrystalRegions = new Set<number>()
            for (const crystalIndex of failingCrystalIndexes) {
              const crystal = crystalTargets[crystalIndex]
              if (!crystal) continue
              const region = regions.get(`${crystal.cellX},${crystal.cellY}`)
              if (region !== undefined) failingCrystalRegions.add(region)
            }

            let hasSpareNegatorCell = true
            for (const region of failingCrystalRegions) {
              let regionHasSpare = false
              for (let y = 0; y < 4; y += 1) {
                for (let x = 0; x < 4; x += 1) {
                  if (regions.get(`${x},${y}`) !== region) continue
                  if (!occupiedCells.has(`${x},${y}`)) {
                    regionHasSpare = true
                    break
                  }
                }
                if (regionHasSpare) break
              }
              if (!regionHasSpare) {
                hasSpareNegatorCell = false
                break
              }
            }
            if (!hasSpareNegatorCell) continue
          }

          acceptedGhostTargets = ghostResult.targets
          acceptedGhostPath = ghostResult.solutionPath
          break
        }
        if (acceptedGhostTargets && acceptedGhostPath) {
          ghostTargets = acceptedGhostTargets
          solutionPath = acceptedGhostPath
          maybeCapturePartialCandidate()
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        let usedPolyCells = new Set(baseUsedCells)
        const polyPalette = buildPolyominoPalette(
          rng,
          colorSquares,
          colorRuleActive
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
                  generationSeed + attempt * 9107,
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
                  generationSeed + attempt * 12121,
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
              generationSeed + attempt * 17041 + seedOffset,
              polyominoSymbols.filter((symbol) => !symbol.negative),
              usedPolyCells,
              polyPalette,
              colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredTriangleColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...colorSquares.map((square) => square.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const triangleResult = generateTrianglesForEdges(
          edges,
          generationSeed + attempt * 23011,
          baseKinds.length,
          blockedTriangleCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredDotColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const dotResult = generateDotsForEdges(
          edges,
          generationSeed + attempt * 24137,
          baseKinds.length,
          blockedDotCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredDiamondColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const diamondResult = generateDiamondsForEdges(
          edges,
          generationSeed + attempt * 24361,
          baseKinds.length,
          blockedDiamondCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredArrowColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const arrowResult = generateArrowsForEdges(
          edges,
          generationSeed + attempt * 26053,
          baseKinds.length,
          blockedArrowCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredChevronColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const chevronResult = generateChevronsForEdges(
          edges,
          generationSeed + attempt * 26699,
          baseKinds.length,
          blockedChevronCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredMinesweeperColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const minesweeperResult = generateMinesweeperNumbersForEdges(
          edges,
          generationSeed + attempt * 27599,
          baseKinds.length,
          blockedMinesweeperCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredWaterColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...cardinalTargets.map((target) => target.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const waterResult = generateWaterDropletsForEdges(
          edges,
          generationSeed + attempt * 30259,
          selectedSymbolCount,
          blockedWaterCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredCardinalColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const cardinalResult = generateCardinalsForEdges(
          edges,
          generationSeed + attempt * 28931,
          baseKinds.length,
          blockedCardinalCells,
          colorRuleActive,
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredSpinnerColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
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
                ...crystalTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const spinnerResult = generateSpinnersForEdges(
          edges,
          generationSeed + attempt * 30773,
          baseKinds.length,
          blockedSpinnerCells,
          colorRuleActive,
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

      if (active.includes('dice')) {
        const blockedDiceCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredDiceColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const diceResult = generateDiceForEdges(
          edges,
          generationSeed + attempt * 30893,
          baseKinds.length,
          blockedDiceCells,
          colorRuleActive,
          preferredDiceColors,
          solutionPath ?? undefined
        )
        if (diceResult) {
          diceTargets = diceResult.targets
          solutionPath = solutionPath ?? diceResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('tally-marks') && !active.includes('eyes')) {
        const blockedTallyCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredTallyColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const tallyResult = generateTallyMarksForEdges(
          edges,
          generationSeed + attempt * 30957,
          baseKinds.length,
          blockedTallyCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            eyeTargets,
            polyominoSymbols,
            negatorTargets,
            tallyTargets,
          },
          preferredTallyColors,
          solutionPath ?? undefined
        )
        if (tallyResult) {
          tallyTargets = tallyResult.targets
          solutionPath = solutionPath ?? tallyResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('eyes')) {
        const blockedEyeCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...openPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredEyeColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...starTargets.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...openPentagonTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const eyeResult = generateEyesForEdges(
          edges,
          generationSeed + attempt * 31157,
          baseKinds.length,
          blockedEyeCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            tallyTargets,
            polyominoSymbols,
            negatorTargets,
            eyeTargets,
          },
          preferredEyeColors,
          solutionPath ?? undefined
        )
        if (eyeResult) {
          eyeTargets = eyeResult.targets
          solutionPath = solutionPath ?? eyeResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('eyes') && active.includes('crystals')) {
        const blockedCrystalCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const preferredCrystalColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...starTargets.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...polyominoSymbols.map((target) => target.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const crystalResult = generateCrystalsForEdges(
          edges,
          generationSeed + attempt * 31241,
          blockedCrystalCells,
          colorRuleActive,
          crystalGenerationSymbolCount,
          preferredCrystalColors,
          solutionPath ?? undefined,
          active.includes('negator'),
          requiresNegatorCrystalGhostSafety
        )
        if (!crystalResult) {
          continue attemptLoop
        }
        const crystalEffectiveUsedEdges = resolveEyeEffects(
          edgesFromPath(crystalResult.solutionPath),
          eyeTargets
        ).effectiveUsedEdges
        const failingCrystalCount = collectFailingCrystalIndexes(
          crystalEffectiveUsedEdges,
          crystalResult.targets
        ).size
        if (
          (!requiresNegatorCrystalGhostSafety && failingCrystalCount > 0) ||
          (requiresNegatorCrystalGhostSafety && failingCrystalCount === 0)
        ) {
          continue attemptLoop
        }
        crystalTargets = crystalResult.targets
        solutionPath = crystalResult.solutionPath
        maybeCapturePartialCandidate()
      }

      if (active.includes('eyes') && active.includes('ghost')) {
        const blockedGhostCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const preferredGhostColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...starTargets.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...polyominoSymbols.map((target) => target.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const ghostPlacementAttempts = requiresNegatorCrystalGhostSafety ? 4 : 1
        let acceptedGhostTargets: GhostTarget[] | null = null
        let acceptedGhostPath: Point[] | null = null
        for (let ghostAttempt = 0; ghostAttempt < ghostPlacementAttempts; ghostAttempt += 1) {
          const ghostResult = generateGhostsForEdges(
            edges,
            generationSeed + attempt * 30967 + ghostAttempt * 173,
            blockedGhostCells,
            colorRuleActive,
            baseKinds.length,
            preferredGhostColors,
            solutionPath ?? undefined,
            active.includes('crystals') && !requiresNegatorCrystalGhostSafety
          )
          if (!ghostResult) continue
          const candidateUsedEdges = resolveEyeEffects(
            edgesFromPath(ghostResult.solutionPath),
            eyeTargets
          ).effectiveUsedEdges
          if (!checkGhosts(candidateUsedEdges, ghostResult.targets)) {
            continue
          }
          if (requiresNegatorCrystalGhostSafety) {
            const failingCrystalIndexes = Array.from(
              collectFailingCrystalIndexes(candidateUsedEdges, crystalTargets)
            )
            if (failingCrystalIndexes.length !== 1) {
              continue
            }
            const regions = buildCellRegions(candidateUsedEdges)
            const occupiedCells = new Set<string>([
              ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
              ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...ghostResult.targets.map((target) => `${target.cellX},${target.cellY}`),
              ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
              ...polyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
            ])
            const failingCrystalRegions = new Set<number>()
            for (const crystalIndex of failingCrystalIndexes) {
              const crystal = crystalTargets[crystalIndex]
              if (!crystal) continue
              const region = regions.get(`${crystal.cellX},${crystal.cellY}`)
              if (region !== undefined) failingCrystalRegions.add(region)
            }
            let hasSpareNegatorCell = true
            for (const region of failingCrystalRegions) {
              let regionHasSpare = false
              for (let y = 0; y < 4; y += 1) {
                for (let x = 0; x < 4; x += 1) {
                  if (regions.get(`${x},${y}`) !== region) continue
                  if (!occupiedCells.has(`${x},${y}`)) {
                    regionHasSpare = true
                    break
                  }
                }
                if (regionHasSpare) break
              }
              if (!regionHasSpare) {
                hasSpareNegatorCell = false
                break
              }
            }
            if (!hasSpareNegatorCell) continue
          }
          acceptedGhostTargets = ghostResult.targets
          acceptedGhostPath = ghostResult.solutionPath
          break
        }
        if (!acceptedGhostTargets || !acceptedGhostPath) {
          continue attemptLoop
        }
        ghostTargets = acceptedGhostTargets
        solutionPath = acceptedGhostPath
        maybeCapturePartialCandidate()
      }

      if (active.includes('eyes') && active.includes('tally-marks')) {
        const blockedTallyCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const preferredTallyColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...polyominoSymbols.map((target) => target.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const tallyResult = generateTallyMarksForEdges(
          edges,
          generationSeed + attempt * 30957,
          baseKinds.length,
          blockedTallyCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            eyeTargets,
            polyominoSymbols,
            negatorTargets,
            tallyTargets,
          },
          preferredTallyColors,
          solutionPath ?? undefined
        )
        if (!tallyResult) {
          continue attemptLoop
        }
        const tallyEffectiveUsedEdges = resolveEyeEffects(
          edgesFromPath(tallyResult.solutionPath),
          eyeTargets
        ).effectiveUsedEdges
        if (!checkTallyMarks(tallyEffectiveUsedEdges, tallyResult.targets)) {
          continue attemptLoop
        }
        tallyTargets = tallyResult.targets
        solutionPath = solutionPath ?? tallyResult.solutionPath
        maybeCapturePartialCandidate()
      }

      if (active.includes('compasses')) {
        const blockedCompassCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...openPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const preferredCompassColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...starTargets.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...openPentagonTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...polyominoSymbols.map((target) => target.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const compassResult = generateCompassesForEdges(
          edges,
          generationSeed + attempt * 31199,
          baseKinds.length,
          blockedCompassCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            tallyTargets,
            eyeTargets,
            polyominoSymbols,
            negatorTargets,
            compassTargets,
          },
          preferredCompassColors,
          solutionPath ?? undefined
        )
        if (compassResult) {
          compassTargets = compassResult.targets
          solutionPath = solutionPath ?? compassResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('black-holes')) {
        const blockedBlackHoleCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredBlackHoleColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const blackHoleResult = generateBlackHolesForEdges(
          edges,
          generationSeed + attempt * 31129,
          baseKinds.length,
          blockedBlackHoleCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            eyeTargets,
            tallyTargets,
            compassTargets,
            polyominoSymbols,
            negatorTargets,
            blackHoleTargets,
          },
          preferredBlackHoleColors,
          solutionPath ?? undefined
        )
        if (blackHoleResult) {
          blackHoleTargets = blackHoleResult.targets
          solutionPath = solutionPath ?? blackHoleResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('chips')) {
        const blockedChipCells = new Set<string>([
          ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
          ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
          ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
          ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
          ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
          ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredChipColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((arrow) => arrow.color),
                ...colorSquares.map((square) => square.color),
                ...triangleTargets.map((triangle) => triangle.color),
                ...dotTargets.map((dot) => dot.color),
                ...diamondTargets.map((diamond) => diamond.color),
                ...chevronTargets.map((chevron) => chevron.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const chipResult = generateChipsForEdges(
          edges,
          generationSeed + attempt * 30989,
          baseKinds.length,
          blockedChipCells,
          colorRuleActive,
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
            crystalTargets,
            blackHoleTargets,
            eyeTargets,
            diceTargets,
            tallyTargets,
            compassTargets,
            polyominoSymbols,
            negatorTargets,
          },
          preferredChipColors,
          solutionPath ?? undefined
        )
        if (chipResult) {
          chipTargets = chipResult.targets
          solutionPath = solutionPath ?? chipResult.solutionPath
          maybeCapturePartialCandidate()
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
          generationSeed + attempt * 5003,
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
          active.includes('crystals') ? crystalTargets : [],
          active.includes('chips') ? chipTargets : [],
          active.includes('dice') ? diceTargets : [],
          active.includes('black-holes') ? blackHoleTargets : [],
          active.includes('tally-marks') ? tallyTargets : [],
          active.includes('eyes') ? eyeTargets : [],
          active.includes('negator'),
          solutionPath ?? undefined,
          baseKinds.length,
          active.includes('compasses') ? compassTargets : []
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredSentinelColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
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
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const sentinelResult = generateSentinelsForEdges(
          edges,
          generationSeed + attempt * 31033,
          baseKinds.length,
          blockedSentinelCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            eyeTargets,
            tallyTargets,
            compassTargets,
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

      if (active.includes('open-pentagons')) {
        const blockedOpenPentagonCells = new Set<string>([
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredOpenPentagonColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
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
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const openPentagonResult = generateOpenPentagonsForEdges(
          edges,
          generationSeed + attempt * 31123,
          baseKinds.length,
          blockedOpenPentagonCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            eyeTargets,
            tallyTargets,
            compassTargets,
            polyominoSymbols,
            negatorTargets,
          },
          preferredOpenPentagonColors,
          solutionPath ?? undefined
        )
        if (openPentagonResult) {
          openPentagonTargets = openPentagonResult.targets
          solutionPath = solutionPath ?? openPentagonResult.solutionPath
          maybeCapturePartialCandidate()
        } else {
          continue attemptLoop
        }
      }

      if (active.includes('eyes') && eyeTargets.length === 0) {
        const blockedEyeCells = new Set<string>([
          ...arrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...colorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...starTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...triangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...dotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...minesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...waterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...cardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...spinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...sentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...ghostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...openPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredEyeColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
                ...arrowTargets.map((target) => target.color),
                ...colorSquares.map((target) => target.color),
                ...starTargets.map((target) => target.color),
                ...triangleTargets.map((target) => target.color),
                ...dotTargets.map((target) => target.color),
                ...diamondTargets.map((target) => target.color),
                ...chevronTargets.map((target) => target.color),
                ...minesweeperTargets.map((target) => target.color),
                ...waterDropletTargets.map((target) => target.color),
                ...cardinalTargets.map((target) => target.color),
                ...spinnerTargets.map((target) => target.color),
                ...sentinelTargets.map((target) => target.color),
                ...ghostTargets.map((target) => target.color),
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...openPentagonTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : undefined
        const eyeResult = generateEyesForEdges(
          edges,
          generationSeed + attempt * 31157,
          baseKinds.length,
          blockedEyeCells,
          colorRuleActive,
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            tallyTargets,
            compassTargets,
            polyominoSymbols,
            negatorTargets,
            eyeTargets,
          },
          preferredEyeColors,
          solutionPath ?? undefined
        )
        if (eyeResult) {
          eyeTargets = eyeResult.targets
          solutionPath = solutionPath ?? eyeResult.solutionPath
          maybeCapturePartialCandidate()
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
          crystalTargets.length +
          chipTargets.length +
          diceTargets.length +
          blackHoleTargets.length +
          openPentagonTargets.length +
          eyeTargets.length +
          tallyTargets.length +
          compassTargets.length +
          polyominoSymbols.length +
          hexTargets.length
        if (removableSymbolCount === 0) {
          continue attemptLoop
        }
        if (
          active.includes('crystals') &&
          crystalTargets.length < 3
        ) {
          continue attemptLoop
        }
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
          ...crystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...chipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...diceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...blackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...openPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...eyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...tallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...compassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...polyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const preferredNegatorColors = colorRuleActive
          ? biasPreferredColors(
              Array.from(new Set([
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
                ...crystalTargets.map((target) => target.color),
                ...chipTargets.map((target) => target.color),
                ...diceTargets.map((target) => target.color),
                ...blackHoleTargets.map((target) => target.color),
                ...openPentagonTargets.map((target) => target.color),
                ...eyeTargets.map((target) => target.color),
                ...tallyTargets.map((target) => target.color),
                ...compassTargets.map((target) => target.color),
                ...polyominoSymbols.map((symbol) => symbol.color),
              ])).slice(0, MAX_SYMBOL_COLORS),
              rng
            )
          : []
        const negatorPlacementAttempts = hasNegatorGhostCrystalPolyCombo
          ? 6
          : hasStressCombo
            ? 10
            : hasCrystalNegatorPair
              ? 7
              : selectedSymbolCount >= 3
                ? 4
                : 2
        const shouldValidateNegatorPlacement =
          hasStressCombo || hasCrystalNegatorPair || selectedSymbolCount >= 3
        const quickNegatorRecoveryBudget = hasStressCombo ? 2200 : 1400
        let acceptedNegators: NegatorTarget[] | null = null
        let acceptedNegatorPath: Point[] | null = null

        for (let negatorAttempt = 0; negatorAttempt < negatorPlacementAttempts; negatorAttempt += 1) {
          const negatorResult = generateNegatorsForEdges(
            edges,
            generationSeed + attempt * 29017 + negatorAttempt * 911,
            new Set(usedNegatorCells),
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            tallyTargets,
            eyeTargets,
            compassTargets,
            colorRuleActive,
            preferredNegatorColors,
            solutionPath ?? undefined
          )
          if (!negatorResult) continue
          const candidatePath = solutionPath ?? negatorResult.solutionPath
          if (!candidatePath || candidatePath.length < 2) continue

          if (!shouldValidateNegatorPlacement) {
            acceptedNegators = negatorResult.negators
            acceptedNegatorPath = candidatePath
            break
          }

          const candidateSymbols = {
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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            eyeTargets,
            tallyTargets,
            compassTargets,
            polyominoSymbols,
            negatorTargets: negatorResult.negators,
            hexTargets,
          }
          const candidateUsedEdges = edgesFromPath(candidatePath)
          const candidateEvaluation = evaluatePathConstraints(
            candidatePath,
            candidateUsedEdges,
            active,
            candidateSymbols,
            'first'
          )
          if (candidateEvaluation.ok) {
            acceptedNegators = negatorResult.negators
            acceptedNegatorPath = candidatePath
            break
          }
          if (negatorAttempt === 0 && (hasStressCombo || hasCrystalNegatorPair)) {
            const recoveredCandidatePath = findAnyValidSolutionPath(
              edges,
              active,
              candidateSymbols,
              quickNegatorRecoveryBudget
            )
            if (recoveredCandidatePath) {
              acceptedNegators = negatorResult.negators
              acceptedNegatorPath = recoveredCandidatePath
              break
            }
          }
        }

        if (!acceptedNegators || !acceptedNegatorPath) {
          continue attemptLoop
        }
        negatorTargets = acceptedNegators
        solutionPath = acceptedNegatorPath
        maybeCapturePartialCandidate()
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
        crystalTargets,
        chipTargets,
        diceTargets,
        blackHoleTargets,
        openPentagonTargets,
        eyeTargets,
        tallyTargets,
        compassTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
      }
      if (!active.every((kind) => hasGeneratedSymbolForKind(kind, generatedSnapshot))) {
        continue attemptLoop
      }

      if (
        colorRuleActive &&
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
          crystalTargets,
          chipTargets,
          diceTargets,
          blackHoleTargets,
          openPentagonTargets,
          eyeTargets,
          tallyTargets,
          compassTargets,
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
        crystalTargets.length +
        chipTargets.length +
        diceTargets.length +
        blackHoleTargets.length +
        openPentagonTargets.length +
        eyeTargets.length +
        tallyTargets.length +
        compassTargets.length +
        polyominoSymbols.length +
        negatorTargets.length +
        hexTargets.length
      if (hasRequestedSymbols && symbolCount === 0) continue
      if (active.includes('chips') && symbolCount < 5) continue

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
            crystalTargets,
            chipTargets,
            diceTargets,
            blackHoleTargets,
            openPentagonTargets,
            eyeTargets,
            tallyTargets,
            compassTargets,
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
          : hasStressCombo
            ? (nearEndAttempts && attempt % 2 === 0) || attempt === generationAttempts - 1
            : nearEndAttempts || attempt % 8 === 0
        if (shouldRunFallbackSolver) {
          const isEyeHeavyAttempt =
            active.includes('eyes') &&
            (
              activeNonGapKinds.length >= 3 ||
              active.includes('ghost') ||
              active.includes('crystals') ||
              active.includes('tally-marks') ||
              active.includes('compasses') ||
              active.includes('open-pentagons') ||
              active.includes('black-holes') ||
              active.includes('chips') ||
              active.includes('negator')
            )
          const fallbackVisitBudgetBase = isPolyOnlyAttempt
            ? GENERATION_POLY_ONLY_SOLVER_VISIT_BUDGET
            : hasHeavyKinds
              ? GENERATION_SOLVER_VISIT_BUDGET_HEAVY
              : GENERATION_SOLVER_VISIT_BUDGET_LIGHT
          const fallbackVisitBudget = isEyeHeavyAttempt
            ? Math.floor(fallbackVisitBudgetBase * 1.85)
            : fallbackVisitBudgetBase
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
              crystalTargets,
              chipTargets,
              diceTargets,
              blackHoleTargets,
              openPentagonTargets,
              eyeTargets,
              tallyTargets,
              compassTargets,
              polyominoSymbols,
              negatorTargets,
              hexTargets,
            },
            fallbackVisitBudget
          )
          if (combinedSolution) {
            validatedPath = combinedSolution
          }
        }
      }
      if (validatedPath && enforceWildness && !meetsWildnessTarget(validatedPath, active)) {
        validatedPath = null
      }
      const nearEndRepeatRelaxation = attempt >= generationAttempts - REPEAT_TRACE_RELAX_LAST_ATTEMPTS
      if (
        validatedPath &&
        avoidRecentPathReuse &&
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
          crystalTargets,
          chipTargets,
          diceTargets,
          blackHoleTargets,
          openPentagonTargets,
          eyeTargets,
          tallyTargets,
          compassTargets,
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
        crystalTargets,
        chipTargets,
        diceTargets,
        blackHoleTargets,
        openPentagonTargets,
        eyeTargets,
        tallyTargets,
        compassTargets,
        polyominoSymbols,
        negatorTargets,
        hexTargets,
        solutionPath: validatedPath,
      }
      return candidate
    }

    if (pendingCandidates.length > 0) {
      const recoveryBudgetBase = hasNegatorGhostCrystalPolyCombo
        ? Math.floor(GENERATION_RECOVERY_SOLVER_VISIT_BUDGET * 1.25)
        : hasNegatorCrystalGhostCombo
          ? Math.floor(GENERATION_RECOVERY_SOLVER_VISIT_BUDGET * 0.95)
        : hasStressCombo
          ? Math.floor(GENERATION_RECOVERY_SOLVER_VISIT_BUDGET * 1.8)
          : hasCrystalNegatorPair
            ? Math.floor(GENERATION_RECOVERY_SOLVER_VISIT_BUDGET * 2.5)
            : GENERATION_RECOVERY_SOLVER_VISIT_BUDGET
      const fallbackBudgetBase = hasNegatorGhostCrystalPolyCombo
        ? Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.2)
        : hasNegatorCrystalGhostCombo
          ? Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 0.9)
        : hasStressCombo
          ? Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.8)
          : hasCrystalNegatorPair
            ? Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 2.5)
            : MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
      for (let pendingIndex = 0; pendingIndex < pendingCandidates.length; pendingIndex += 1) {
        const pending = pendingCandidates[pendingIndex]
        const pendingNonGapKinds = pending.activeKinds.filter((kind) => kind !== 'gap-line')
        const pendingHasEyePressure =
          pending.activeKinds.includes('eyes') &&
          (
            pendingNonGapKinds.length >= 3 ||
            pending.activeKinds.includes('ghost') ||
            pending.activeKinds.includes('crystals') ||
            pending.activeKinds.includes('tally-marks') ||
            pending.activeKinds.includes('compasses') ||
            pending.activeKinds.includes('open-pentagons') ||
            pending.activeKinds.includes('black-holes') ||
            pending.activeKinds.includes('chips') ||
            pending.activeKinds.includes('negator')
          )
        const pendingRecoveryBudget = pendingHasEyePressure
          ? Math.floor(recoveryBudgetBase * 1.75)
          : recoveryBudgetBase
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
              crystalTargets: pending.crystalTargets,
              chipTargets: pending.chipTargets,
              diceTargets: pending.diceTargets,
              blackHoleTargets: pending.blackHoleTargets,
              openPentagonTargets: pending.openPentagonTargets,
              eyeTargets: pending.eyeTargets,
              tallyTargets: pending.tallyTargets,
              compassTargets: pending.compassTargets,
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
              crystalTargets: pending.crystalTargets,
              chipTargets: pending.chipTargets,
              diceTargets: pending.diceTargets,
              blackHoleTargets: pending.blackHoleTargets,
              openPentagonTargets: pending.openPentagonTargets,
              eyeTargets: pending.eyeTargets,
              tallyTargets: pending.tallyTargets,
              compassTargets: pending.compassTargets,
              polyominoSymbols: pending.polyominoSymbols,
              negatorTargets: pending.negatorTargets,
              hexTargets: pending.hexTargets,
            },
            pendingIsPolyOnly ? Math.max(4500, pendingRecoveryBudget) : pendingRecoveryBudget
          )
        }

        if (recoveredPath && enforceWildness && !meetsWildnessTarget(recoveredPath, pending.activeKinds)) {
          recoveredPath = null
        }
        const allowRepeatOnRecovery = pendingIndex >= pendingCandidates.length - 2
        if (
          recoveredPath &&
          avoidRecentPathReuse &&
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
            crystalTargets: pending.crystalTargets,
            chipTargets: pending.chipTargets,
            diceTargets: pending.diceTargets,
            blackHoleTargets: pending.blackHoleTargets,
            openPentagonTargets: pending.openPentagonTargets,
            eyeTargets: pending.eyeTargets,
            tallyTargets: pending.tallyTargets,
            compassTargets: pending.compassTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
            solutionPath: recoveredPath,
          }
        }
      }

      for (let pendingIndex = 0; pendingIndex < pendingCandidates.length; pendingIndex += 1) {
        const pending = pendingCandidates[pendingIndex]
        const pendingNonGapKinds = pending.activeKinds.filter((kind) => kind !== 'gap-line')
        const pendingHasEyePressure =
          pending.activeKinds.includes('eyes') &&
          (
            pendingNonGapKinds.length >= 3 ||
            pending.activeKinds.includes('ghost') ||
            pending.activeKinds.includes('crystals') ||
            pending.activeKinds.includes('tally-marks') ||
            pending.activeKinds.includes('compasses') ||
            pending.activeKinds.includes('open-pentagons') ||
            pending.activeKinds.includes('black-holes') ||
            pending.activeKinds.includes('chips') ||
            pending.activeKinds.includes('negator')
          )
        const pendingFallbackBudget = pendingHasEyePressure
          ? Math.floor(fallbackBudgetBase * 1.65)
          : fallbackBudgetBase
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
            crystalTargets: pending.crystalTargets,
            chipTargets: pending.chipTargets,
            diceTargets: pending.diceTargets,
            blackHoleTargets: pending.blackHoleTargets,
            openPentagonTargets: pending.openPentagonTargets,
            eyeTargets: pending.eyeTargets,
            tallyTargets: pending.tallyTargets,
            compassTargets: pending.compassTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
          },
          pendingFallbackBudget
        )
        if (
          hardRecoveredPath &&
          avoidRecentPathReuse &&
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
            crystalTargets: pending.crystalTargets,
            chipTargets: pending.chipTargets,
            diceTargets: pending.diceTargets,
            blackHoleTargets: pending.blackHoleTargets,
            openPentagonTargets: pending.openPentagonTargets,
            eyeTargets: pending.eyeTargets,
            tallyTargets: pending.tallyTargets,
            compassTargets: pending.compassTargets,
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
            crystalTargets: strictEmergencyPending.crystalTargets,
            chipTargets: strictEmergencyPending.chipTargets,
            diceTargets: strictEmergencyPending.diceTargets,
            blackHoleTargets: strictEmergencyPending.blackHoleTargets,
            openPentagonTargets: strictEmergencyPending.openPentagonTargets,
            eyeTargets: strictEmergencyPending.eyeTargets,
            tallyTargets: strictEmergencyPending.tallyTargets,
            compassTargets: strictEmergencyPending.compassTargets,
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
            crystalTargets: strictEmergencyPending.crystalTargets,
            chipTargets: strictEmergencyPending.chipTargets,
            diceTargets: strictEmergencyPending.diceTargets,
            blackHoleTargets: strictEmergencyPending.blackHoleTargets,
            openPentagonTargets: strictEmergencyPending.openPentagonTargets,
            eyeTargets: strictEmergencyPending.eyeTargets,
            tallyTargets: strictEmergencyPending.tallyTargets,
            compassTargets: strictEmergencyPending.compassTargets,
            polyominoSymbols: strictEmergencyPending.polyominoSymbols,
            negatorTargets: strictEmergencyPending.negatorTargets,
            hexTargets: strictEmergencyPending.hexTargets,
          },
          fallbackBudgetBase * 2
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
          crystalTargets: strictEmergencyPending.crystalTargets,
          chipTargets: strictEmergencyPending.chipTargets,
          diceTargets: strictEmergencyPending.diceTargets,
          blackHoleTargets: strictEmergencyPending.blackHoleTargets,
          openPentagonTargets: strictEmergencyPending.openPentagonTargets,
          eyeTargets: strictEmergencyPending.eyeTargets,
          tallyTargets: strictEmergencyPending.tallyTargets,
          compassTargets: strictEmergencyPending.compassTargets,
          polyominoSymbols: strictEmergencyPending.polyominoSymbols,
          negatorTargets: strictEmergencyPending.negatorTargets,
          hexTargets: strictEmergencyPending.hexTargets,
          solutionPath: strictEmergencyPath,
        }
      }

      if (hasCrystalNegatorPair && !hasEyeCrystalNegatorCombo) {
        const ultraBudget = hasNegatorGhostCrystalPolyCombo
          ? Math.max(Math.floor(fallbackBudgetBase * 1.25), 140_000)
          : hasNegatorCrystalGhostCombo
            ? Math.max(Math.floor(fallbackBudgetBase * 1.1), 95_000)
          : hasStressCombo
            ? Math.max(fallbackBudgetBase * 2, 280_000)
            : Math.max(fallbackBudgetBase * 4, 680_000)
        const ultraCandidates = pendingCandidates.slice(
          0,
          Math.min(
            hasNegatorGhostCrystalPolyCombo ? 1 : hasNegatorCrystalGhostCombo ? 1 : hasStressCombo ? 1 : 3,
            pendingCandidates.length
          )
        )
        for (const ultraPending of ultraCandidates) {
          const ultraPath = findAnyValidSolutionPath(
            ultraPending.puzzle.edges,
            ultraPending.activeKinds,
            {
              arrowTargets: ultraPending.arrowTargets,
              colorSquares: ultraPending.colorSquares,
              starTargets: ultraPending.starTargets,
              triangleTargets: ultraPending.triangleTargets,
              dotTargets: ultraPending.dotTargets,
              diamondTargets: ultraPending.diamondTargets,
              chevronTargets: ultraPending.chevronTargets,
              minesweeperTargets: ultraPending.minesweeperTargets,
              waterDropletTargets: ultraPending.waterDropletTargets,
              cardinalTargets: ultraPending.cardinalTargets,
              spinnerTargets: ultraPending.spinnerTargets,
              sentinelTargets: ultraPending.sentinelTargets,
              ghostTargets: ultraPending.ghostTargets,
              crystalTargets: ultraPending.crystalTargets,
              chipTargets: ultraPending.chipTargets,
              diceTargets: ultraPending.diceTargets,
              blackHoleTargets: ultraPending.blackHoleTargets,
              openPentagonTargets: ultraPending.openPentagonTargets,
              eyeTargets: ultraPending.eyeTargets,
              tallyTargets: ultraPending.tallyTargets,
              compassTargets: ultraPending.compassTargets,
              polyominoSymbols: ultraPending.polyominoSymbols,
              negatorTargets: ultraPending.negatorTargets,
              hexTargets: ultraPending.hexTargets,
            },
            ultraBudget
          )
          if (!ultraPath) continue
          return {
            puzzle: ultraPending.puzzle,
            activeKinds: ultraPending.activeKinds,
            arrowTargets: ultraPending.arrowTargets,
            colorSquares: ultraPending.colorSquares,
            starTargets: ultraPending.starTargets,
            triangleTargets: ultraPending.triangleTargets,
            dotTargets: ultraPending.dotTargets,
            diamondTargets: ultraPending.diamondTargets,
            chevronTargets: ultraPending.chevronTargets,
            minesweeperTargets: ultraPending.minesweeperTargets,
            waterDropletTargets: ultraPending.waterDropletTargets,
            cardinalTargets: ultraPending.cardinalTargets,
            spinnerTargets: ultraPending.spinnerTargets,
            sentinelTargets: ultraPending.sentinelTargets,
            ghostTargets: ultraPending.ghostTargets,
            crystalTargets: ultraPending.crystalTargets,
            chipTargets: ultraPending.chipTargets,
            diceTargets: ultraPending.diceTargets,
            blackHoleTargets: ultraPending.blackHoleTargets,
            openPentagonTargets: ultraPending.openPentagonTargets,
            eyeTargets: ultraPending.eyeTargets,
            tallyTargets: ultraPending.tallyTargets,
            compassTargets: ultraPending.compassTargets,
            polyominoSymbols: ultraPending.polyominoSymbols,
            negatorTargets: ultraPending.negatorTargets,
            hexTargets: ultraPending.hexTargets,
            solutionPath: ultraPath,
          }
        }
      }
    }
    }

    if (pendingCandidates.length > 0) {
      for (const pending of pendingCandidates) {
        if (!pending.solutionPathHint || pending.solutionPathHint.length < 2) continue
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
            crystalTargets: pending.crystalTargets,
            chipTargets: pending.chipTargets,
            diceTargets: pending.diceTargets,
            blackHoleTargets: pending.blackHoleTargets,
            openPentagonTargets: pending.openPentagonTargets,
            eyeTargets: pending.eyeTargets,
            tallyTargets: pending.tallyTargets,
            compassTargets: pending.compassTargets,
            polyominoSymbols: pending.polyominoSymbols,
            negatorTargets: pending.negatorTargets,
            hexTargets: pending.hexTargets,
          },
          'first'
        )
        if (hintEvaluation.ok) {
          return buildCandidateFromPending(pending, pending.solutionPathHint)
        }
      }

      const fallbackPending = pendingCandidates[0]
      const emergencyBudget = hasNegatorGhostCrystalPolyCombo
        ? Math.max(150_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.5))
        : hasNegatorCrystalGhostCombo
          ? Math.max(90_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.1))
        : hasStressCombo
          ? Math.max(220_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 2.2))
          : hasCrystalNegatorPair
            ? Math.max(200_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 2.6))
            : MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
      const emergencyPath = findAnyValidSolutionPath(
        fallbackPending.puzzle.edges,
        fallbackPending.activeKinds,
        {
          arrowTargets: fallbackPending.arrowTargets,
          colorSquares: fallbackPending.colorSquares,
          starTargets: fallbackPending.starTargets,
          triangleTargets: fallbackPending.triangleTargets,
          dotTargets: fallbackPending.dotTargets,
          diamondTargets: fallbackPending.diamondTargets,
          chevronTargets: fallbackPending.chevronTargets,
          minesweeperTargets: fallbackPending.minesweeperTargets,
          waterDropletTargets: fallbackPending.waterDropletTargets,
          cardinalTargets: fallbackPending.cardinalTargets,
          spinnerTargets: fallbackPending.spinnerTargets,
          sentinelTargets: fallbackPending.sentinelTargets,
          ghostTargets: fallbackPending.ghostTargets,
          crystalTargets: fallbackPending.crystalTargets,
          chipTargets: fallbackPending.chipTargets,
          diceTargets: fallbackPending.diceTargets,
          blackHoleTargets: fallbackPending.blackHoleTargets,
          openPentagonTargets: fallbackPending.openPentagonTargets,
          eyeTargets: fallbackPending.eyeTargets,
          tallyTargets: fallbackPending.tallyTargets,
          compassTargets: fallbackPending.compassTargets,
          polyominoSymbols: fallbackPending.polyominoSymbols,
          negatorTargets: fallbackPending.negatorTargets,
          hexTargets: fallbackPending.hexTargets,
        },
        emergencyBudget
      )
      if (emergencyPath) {
        return buildCandidateFromPending(fallbackPending, emergencyPath)
      }
      if (fallbackPending.solutionPathHint && fallbackPending.solutionPathHint.length >= 2) {
        console.warn(
          `Generation fallback discarded unsolved hint path (seed=${seed}, kinds=${selectedKindsKey}).`
        )
      }
    }

    const partialFallbackCandidate = bestPartialCandidate as PartialCandidate | null
    if (partialFallbackCandidate) {
      const partialSymbols = {
        arrowTargets: partialFallbackCandidate.arrowTargets,
        colorSquares: partialFallbackCandidate.colorSquares,
        starTargets: partialFallbackCandidate.starTargets,
        triangleTargets: partialFallbackCandidate.triangleTargets,
        dotTargets: partialFallbackCandidate.dotTargets,
        diamondTargets: partialFallbackCandidate.diamondTargets,
        chevronTargets: partialFallbackCandidate.chevronTargets,
        minesweeperTargets: partialFallbackCandidate.minesweeperTargets,
        waterDropletTargets: partialFallbackCandidate.waterDropletTargets,
        cardinalTargets: partialFallbackCandidate.cardinalTargets,
        spinnerTargets: partialFallbackCandidate.spinnerTargets,
        sentinelTargets: partialFallbackCandidate.sentinelTargets,
        ghostTargets: partialFallbackCandidate.ghostTargets,
        crystalTargets: partialFallbackCandidate.crystalTargets,
        chipTargets: partialFallbackCandidate.chipTargets,
        diceTargets: partialFallbackCandidate.diceTargets,
        blackHoleTargets: partialFallbackCandidate.blackHoleTargets,
        openPentagonTargets: partialFallbackCandidate.openPentagonTargets,
        eyeTargets: partialFallbackCandidate.eyeTargets,
        tallyTargets: partialFallbackCandidate.tallyTargets,
        compassTargets: partialFallbackCandidate.compassTargets,
        polyominoSymbols: partialFallbackCandidate.polyominoSymbols,
        negatorTargets: partialFallbackCandidate.negatorTargets,
        hexTargets: partialFallbackCandidate.hexTargets,
      }
      const partialUsedEdges = edgesFromPath(partialFallbackCandidate.solutionPath)
      const partialEvaluation = evaluatePathConstraints(
        partialFallbackCandidate.solutionPath,
        partialUsedEdges,
        partialFallbackCandidate.activeKinds,
        partialSymbols,
        'first'
      )
      if (partialEvaluation.ok) {
        console.warn(
          `Generation fallback used partial candidate (seed=${seed}, kinds=${selectedKindsKey}).`
        )
        return partialFallbackCandidate
      }
      const partialSolveBudget = hasNegatorGhostCrystalPolyCombo
        ? Math.max(110_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.15))
        : hasNegatorCrystalGhostCombo
          ? Math.max(85_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 0.95))
        : hasStressCombo
          ? Math.max(160_000, Math.floor(MANUAL_SOLVER_VISIT_BUDGET_FALLBACK * 1.4))
          : MANUAL_SOLVER_VISIT_BUDGET_FALLBACK
      const partialSolvedPath = findAnyValidSolutionPath(
        partialFallbackCandidate.puzzle.edges,
        partialFallbackCandidate.activeKinds,
        partialSymbols,
        partialSolveBudget
      )
      if (partialSolvedPath) {
        console.warn(
          `Generation fallback solved partial candidate (seed=${seed}, kinds=${selectedKindsKey}).`
        )
        return {
          ...partialFallbackCandidate,
          solutionPath: partialSolvedPath,
        }
      }
      console.warn(
        `Generation fallback discarded unsolved partial candidate (seed=${seed}, kinds=${selectedKindsKey}).`
      )
    }

    console.warn(
      `Generation emergency fallback triggered (seed=${seed}, kinds=${selectedKindsKey}).`
    )
    const emergencyPuzzle = baseKinds.includes('gap-line')
      ? generatePuzzle(seed + 7_777_777)
      : { edges: buildFullEdges() }
    const emergencyRng = mulberry32(seed + 9_999_999)
    let emergencyPath =
      findBestLoopyPathByRegions(emergencyPuzzle.edges, emergencyRng, 26, 9) ??
      findRandomPath(emergencyPuzzle.edges, emergencyRng) ??
      [START, END]
    let emergencyArrowTargets: ArrowTarget[] = []
    let emergencyColorSquares: ColorSquare[] = []
    let emergencyStarTargets: StarTarget[] = []
    let emergencyTriangleTargets: TriangleTarget[] = []
    let emergencyDotTargets: DotTarget[] = []
    let emergencyDiamondTargets: DiamondTarget[] = []
    let emergencyChevronTargets: ChevronTarget[] = []
    let emergencyMinesweeperTargets: MinesweeperNumberTarget[] = []
    let emergencyWaterDropletTargets: WaterDropletTarget[] = []
    let emergencyCardinalTargets: CardinalTarget[] = []
    let emergencySpinnerTargets: SpinnerTarget[] = []
    let emergencySentinelTargets: SentinelTarget[] = []
    let emergencyGhostTargets: GhostTarget[] = []
    let emergencyCrystalTargets: CrystalTarget[] = []
    let emergencyChipTargets: ChipTarget[] = []
    let emergencyDiceTargets: DiceTarget[] = []
    let emergencyBlackHoleTargets: BlackHoleTarget[] = []
    let emergencyOpenPentagonTargets: OpenPentagonTarget[] = []
    let emergencyEyeTargets: EyeTarget[] = []
    let emergencyTallyTargets: TallyMarkTarget[] = []
    let emergencyCompassTargets: CompassTarget[] = []
    let emergencyPolyominoSymbols: PolyominoSymbol[] = []
    let emergencyNegatorTargets: NegatorTarget[] = []
    let emergencyHexTargets: HexTarget[] = []
    const emergencyColorRuleActive =
      baseKinds.includes('stars') ||
      baseKinds.includes('chips') ||
      baseKinds.includes('black-holes') ||
      baseKinds.includes('open-pentagons')
    const emergencyRequiresNegatorCrystalGhostSafety =
      baseKinds.includes('negator') && baseKinds.includes('crystals') && baseKinds.includes('ghost')
    const emergencyCrystalGenerationSymbolCount =
      hasEyeCrystalNegatorCombo ? Math.max(baseKinds.length, 4) : baseKinds.length

    if (baseKinds.includes('crystals')) {
      const emergencyCrystalAttempts = emergencyRequiresNegatorCrystalGhostSafety
        ? 16
        : hasEyeCrystalNegatorCombo
          ? 52
          : 28
      for (let attempt = 0; attempt < emergencyCrystalAttempts; attempt += 1) {
        const crystalResult = generateCrystalsForEdges(
          emergencyPuzzle.edges,
          seed + 8_000_111 + attempt * 197,
          new Set<string>(),
          emergencyColorRuleActive,
          emergencyCrystalGenerationSymbolCount,
          undefined,
          emergencyPath ?? undefined,
          baseKinds.includes('negator'),
          emergencyRequiresNegatorCrystalGhostSafety
        )
        if (!crystalResult) continue
        emergencyCrystalTargets = crystalResult.targets
        emergencyPath = crystalResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('ghost')) {
      const emergencyGhostAttempts = emergencyRequiresNegatorCrystalGhostSafety ? 12 : 28
      for (let attempt = 0; attempt < emergencyGhostAttempts; attempt += 1) {
        const blockedGhostCells = new Set<string>([
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const ghostResult = generateGhostsForEdges(
          emergencyPuzzle.edges,
          seed + 8_100_121 + attempt * 211,
          blockedGhostCells,
          emergencyColorRuleActive,
          baseKinds.length,
          undefined,
          emergencyPath ?? undefined,
          baseKinds.includes('crystals') && !emergencyRequiresNegatorCrystalGhostSafety
        )
        if (!ghostResult) continue
        emergencyGhostTargets = ghostResult.targets
        emergencyPath = ghostResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('dice')) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const blockedDiceCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const diceResult = generateDiceForEdges(
          emergencyPuzzle.edges,
          seed + 8_200_191 + attempt * 223,
          baseKinds.length,
          blockedDiceCells,
          emergencyColorRuleActive,
          undefined,
          emergencyPath ?? undefined
        )
        if (!diceResult) continue
        emergencyDiceTargets = diceResult.targets
        emergencyPath = emergencyPath ?? diceResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('tally-marks') && !baseKinds.includes('eyes')) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const blockedTallyCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const tallyResult = generateTallyMarksForEdges(
          emergencyPuzzle.edges,
          seed + 8_220_197 + attempt * 229,
          baseKinds.length,
          blockedTallyCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            chipTargets: emergencyChipTargets,
            diceTargets: emergencyDiceTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
            openPentagonTargets: emergencyOpenPentagonTargets,
            eyeTargets: emergencyEyeTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
            tallyTargets: emergencyTallyTargets,
            compassTargets: emergencyCompassTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!tallyResult) continue
        emergencyTallyTargets = tallyResult.targets
        emergencyPath = emergencyPath ?? tallyResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('compasses')) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const blockedCompassCells = new Set<string>([
          ...emergencyArrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyColorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyStarTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTriangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyMinesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyWaterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySpinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyOpenPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyEyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyPolyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const compassResult = generateCompassesForEdges(
          emergencyPuzzle.edges,
          seed + 8_240_203 + attempt * 233,
          baseKinds.length,
          blockedCompassCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            chipTargets: emergencyChipTargets,
            diceTargets: emergencyDiceTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
            openPentagonTargets: emergencyOpenPentagonTargets,
            tallyTargets: emergencyTallyTargets,
            eyeTargets: emergencyEyeTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
            compassTargets: emergencyCompassTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!compassResult) continue
        emergencyCompassTargets = compassResult.targets
        emergencyPath = emergencyPath ?? compassResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('black-holes')) {
      for (let attempt = 0; attempt < 28; attempt += 1) {
        const blockedBlackHoleCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const blackHoleResult = generateBlackHolesForEdges(
          emergencyPuzzle.edges,
          seed + 8_250_211 + attempt * 227,
          baseKinds.length,
          blockedBlackHoleCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            chipTargets: emergencyChipTargets,
            diceTargets: emergencyDiceTargets,
            tallyTargets: emergencyTallyTargets,
            compassTargets: emergencyCompassTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!blackHoleResult) continue
        emergencyBlackHoleTargets = blackHoleResult.targets
        emergencyPath = emergencyPath ?? blackHoleResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('chips')) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const blockedChipCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const chipResult = generateChipsForEdges(
          emergencyPuzzle.edges,
          seed + 8_300_233 + attempt * 239,
          baseKinds.length,
          blockedChipCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
            diceTargets: emergencyDiceTargets,
            tallyTargets: emergencyTallyTargets,
            compassTargets: emergencyCompassTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!chipResult) continue
        emergencyChipTargets = chipResult.targets
        emergencyPath = emergencyPath ?? chipResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('eyes')) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const blockedEyeCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyOpenPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyPolyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const eyeResult = generateEyesForEdges(
          emergencyPuzzle.edges,
          seed + 8_350_251 + attempt * 241,
          baseKinds.length,
          blockedEyeCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            chipTargets: emergencyChipTargets,
            diceTargets: emergencyDiceTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
            openPentagonTargets: emergencyOpenPentagonTargets,
            eyeTargets: emergencyEyeTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
            tallyTargets: emergencyTallyTargets,
            compassTargets: emergencyCompassTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!eyeResult) continue
        emergencyEyeTargets = eyeResult.targets
        emergencyPath = emergencyPath ?? eyeResult.solutionPath
        break
      }
    }
    if (hasEyeCrystalNegatorCombo && emergencyCrystalTargets.length < 3) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const blockedCrystalCells = new Set<string>([
          ...emergencyArrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyColorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyStarTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTriangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyMinesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyWaterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySpinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyOpenPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyEyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyPolyominoSymbols.map((target) => `${target.cellX},${target.cellY}`),
        ])
        const crystalResult = generateCrystalsForEdges(
          emergencyPuzzle.edges,
          seed + 8_360_257 + attempt * 239,
          blockedCrystalCells,
          emergencyColorRuleActive,
          emergencyCrystalGenerationSymbolCount,
          undefined,
          emergencyPath ?? undefined,
          true,
          false
        )
        if (!crystalResult) continue
        emergencyCrystalTargets = crystalResult.targets
        emergencyPath = crystalResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('eyes') && baseKinds.includes('tally-marks')) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const blockedTallyCells = new Set<string>([
          ...emergencyArrowTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyColorSquares.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyStarTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTriangleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDotTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiamondTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChevronTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyMinesweeperTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyWaterDropletTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCardinalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySpinnerTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencySentinelTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyOpenPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyEyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyPolyominoSymbols.map((symbol) => `${symbol.cellX},${symbol.cellY}`),
        ])
        const tallyResult = generateTallyMarksForEdges(
          emergencyPuzzle.edges,
          seed + 8_220_197 + attempt * 229,
          baseKinds.length,
          blockedTallyCells,
          emergencyColorRuleActive,
          {
            arrowTargets: emergencyArrowTargets,
            colorSquares: emergencyColorSquares,
            starTargets: emergencyStarTargets,
            triangleTargets: emergencyTriangleTargets,
            dotTargets: emergencyDotTargets,
            diamondTargets: emergencyDiamondTargets,
            chevronTargets: emergencyChevronTargets,
            minesweeperTargets: emergencyMinesweeperTargets,
            waterDropletTargets: emergencyWaterDropletTargets,
            cardinalTargets: emergencyCardinalTargets,
            spinnerTargets: emergencySpinnerTargets,
            sentinelTargets: emergencySentinelTargets,
            ghostTargets: emergencyGhostTargets,
            crystalTargets: emergencyCrystalTargets,
            chipTargets: emergencyChipTargets,
            diceTargets: emergencyDiceTargets,
            blackHoleTargets: emergencyBlackHoleTargets,
            openPentagonTargets: emergencyOpenPentagonTargets,
            eyeTargets: emergencyEyeTargets,
            polyominoSymbols: emergencyPolyominoSymbols,
            negatorTargets: emergencyNegatorTargets,
            tallyTargets: emergencyTallyTargets,
            compassTargets: emergencyCompassTargets,
          },
          undefined,
          emergencyPath ?? undefined
        )
        if (!tallyResult) continue
        const tallyEffectiveUsedEdges = resolveEyeEffects(
          edgesFromPath(tallyResult.solutionPath),
          emergencyEyeTargets
        ).effectiveUsedEdges
        if (!checkTallyMarks(tallyEffectiveUsedEdges, tallyResult.targets)) continue
        emergencyTallyTargets = tallyResult.targets
        emergencyPath = emergencyPath ?? tallyResult.solutionPath
        break
      }
    }

    if (baseKinds.includes('negator')) {
      if (baseKinds.includes('crystals') && emergencyCrystalTargets.length < 3) {
        // Keep negator+crystal combos meaningful in emergency mode too.
      } else {
      const emergencyRemovableCount =
        emergencyGhostTargets.length +
        emergencyCrystalTargets.length +
        emergencyChipTargets.length +
        emergencyDiceTargets.length +
        emergencyBlackHoleTargets.length +
        emergencyOpenPentagonTargets.length +
        emergencyEyeTargets.length +
        emergencyTallyTargets.length +
        emergencyCompassTargets.length
      if (emergencyRemovableCount > 0) {
        const usedNegatorCells = new Set<string>([
          ...emergencyGhostTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCrystalTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyChipTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyDiceTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyBlackHoleTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyOpenPentagonTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyEyeTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyTallyTargets.map((target) => `${target.cellX},${target.cellY}`),
          ...emergencyCompassTargets.map((target) => `${target.cellX},${target.cellY}`),
        ])
        for (let attempt = 0; attempt < 16; attempt += 1) {
          // Emergency path: allow extra retries so we prefer a non-empty fallback puzzle.
          const negatorResult = generateNegatorsForEdges(
            emergencyPuzzle.edges,
            seed + 8_400_271 + attempt * 251,
            usedNegatorCells,
            emergencyArrowTargets,
            emergencyColorSquares,
            emergencyStarTargets,
            emergencyTriangleTargets,
            emergencyDotTargets,
            emergencyDiamondTargets,
            emergencyChevronTargets,
            emergencyMinesweeperTargets,
            emergencyWaterDropletTargets,
            emergencyCardinalTargets,
            emergencyPolyominoSymbols,
            emergencyHexTargets,
            emergencySentinelTargets,
            emergencySpinnerTargets,
            emergencyGhostTargets,
            emergencyCrystalTargets,
            emergencyChipTargets,
            emergencyDiceTargets,
            emergencyBlackHoleTargets,
            emergencyOpenPentagonTargets,
            emergencyTallyTargets,
            emergencyEyeTargets,
            emergencyCompassTargets,
            emergencyColorRuleActive,
            [],
            emergencyPath ?? undefined
          )
          if (!negatorResult) continue
          emergencyNegatorTargets = negatorResult.negators
          emergencyPath = emergencyPath ?? negatorResult.solutionPath
          break
        }
      }
      }
    }

    const emergencySnapshot: GeneratedSymbolSnapshot = {
      edges: emergencyPuzzle.edges,
      arrowTargets: emergencyArrowTargets,
      colorSquares: emergencyColorSquares,
      starTargets: emergencyStarTargets,
      triangleTargets: emergencyTriangleTargets,
      dotTargets: emergencyDotTargets,
      diamondTargets: emergencyDiamondTargets,
      chevronTargets: emergencyChevronTargets,
      minesweeperTargets: emergencyMinesweeperTargets,
      waterDropletTargets: emergencyWaterDropletTargets,
      cardinalTargets: emergencyCardinalTargets,
      spinnerTargets: emergencySpinnerTargets,
      sentinelTargets: emergencySentinelTargets,
      ghostTargets: emergencyGhostTargets,
      crystalTargets: emergencyCrystalTargets,
      chipTargets: emergencyChipTargets,
      diceTargets: emergencyDiceTargets,
      blackHoleTargets: emergencyBlackHoleTargets,
      openPentagonTargets: emergencyOpenPentagonTargets,
      eyeTargets: emergencyEyeTargets,
      tallyTargets: emergencyTallyTargets,
      compassTargets: emergencyCompassTargets,
      polyominoSymbols: emergencyPolyominoSymbols,
      negatorTargets: emergencyNegatorTargets,
      hexTargets: emergencyHexTargets,
    }
    const emergencyActiveKinds = baseKinds.filter((kind) =>
      hasGeneratedSymbolForKind(kind, emergencySnapshot)
    )
    const emergencySymbols = {
      arrowTargets: emergencyArrowTargets,
      colorSquares: emergencyColorSquares,
      starTargets: emergencyStarTargets,
      triangleTargets: emergencyTriangleTargets,
      dotTargets: emergencyDotTargets,
      diamondTargets: emergencyDiamondTargets,
      chevronTargets: emergencyChevronTargets,
      minesweeperTargets: emergencyMinesweeperTargets,
      waterDropletTargets: emergencyWaterDropletTargets,
      cardinalTargets: emergencyCardinalTargets,
      spinnerTargets: emergencySpinnerTargets,
      sentinelTargets: emergencySentinelTargets,
      ghostTargets: emergencyGhostTargets,
      crystalTargets: emergencyCrystalTargets,
      chipTargets: emergencyChipTargets,
      diceTargets: emergencyDiceTargets,
      blackHoleTargets: emergencyBlackHoleTargets,
      openPentagonTargets: emergencyOpenPentagonTargets,
      eyeTargets: emergencyEyeTargets,
      tallyTargets: emergencyTallyTargets,
      compassTargets: emergencyCompassTargets,
      polyominoSymbols: emergencyPolyominoSymbols,
      negatorTargets: emergencyNegatorTargets,
      hexTargets: emergencyHexTargets,
    }
    const emergencyHasSymbols = emergencyActiveKinds.some((kind) => kind !== 'gap-line')
    if (emergencyHasSymbols) {
      let validatedEmergencyPath: Point[] | null = null
      if (emergencyPath && emergencyPath.length >= 2) {
        const emergencyUsedEdges = edgesFromPath(emergencyPath)
        const emergencyEvaluation = evaluatePathConstraints(
          emergencyPath,
          emergencyUsedEdges,
          emergencyActiveKinds,
          emergencySymbols,
          'first'
        )
        if (emergencyEvaluation.ok) {
          validatedEmergencyPath = emergencyPath
        }
      }
      if (!validatedEmergencyPath) {
        const emergencySolveBudget = hasNegatorGhostCrystalPolyCombo
          ? 140_000
          : hasNegatorCrystalGhostCombo
            ? 90_000
          : hasStressCombo
            ? 180_000
            : hasCrystalNegatorPair
              ? 220_000
              : 120_000
        validatedEmergencyPath = findAnyValidSolutionPath(
          emergencyPuzzle.edges,
          emergencyActiveKinds,
          emergencySymbols,
          emergencySolveBudget
        )
      }
      if (validatedEmergencyPath) {
        if (
          emergencyColorRuleActive &&
          countSymbolColors(
            emergencyArrowTargets,
            emergencyColorSquares,
            emergencyStarTargets,
            emergencyTriangleTargets,
            emergencyDotTargets,
            emergencyDiamondTargets,
            emergencyChevronTargets,
            emergencyMinesweeperTargets,
            emergencyWaterDropletTargets,
            emergencyCardinalTargets,
            emergencySpinnerTargets,
            emergencySentinelTargets,
            emergencyGhostTargets,
            emergencyCrystalTargets,
            emergencyChipTargets,
            emergencyDiceTargets,
            emergencyBlackHoleTargets,
            emergencyOpenPentagonTargets,
            emergencyEyeTargets,
            emergencyTallyTargets,
            emergencyCompassTargets,
            emergencyPolyominoSymbols,
            emergencyNegatorTargets,
            true
          ) > MAX_SYMBOL_COLORS
        ) {
          validatedEmergencyPath = null
        }
      }
      if (validatedEmergencyPath) {
        const reducedKinds = emergencyActiveKinds.length !== baseKinds.length
        if (reducedKinds) {
          console.warn(
            `Generation emergency fallback returned reduced symbol set (seed=${seed}, kinds=${selectedKindsKey}).`
          )
        }
        return {
          puzzle: emergencyPuzzle,
          activeKinds: emergencyActiveKinds,
          arrowTargets: emergencyArrowTargets,
          colorSquares: emergencyColorSquares,
          starTargets: emergencyStarTargets,
          triangleTargets: emergencyTriangleTargets,
          dotTargets: emergencyDotTargets,
          diamondTargets: emergencyDiamondTargets,
          chevronTargets: emergencyChevronTargets,
          minesweeperTargets: emergencyMinesweeperTargets,
          waterDropletTargets: emergencyWaterDropletTargets,
          cardinalTargets: emergencyCardinalTargets,
          spinnerTargets: emergencySpinnerTargets,
          sentinelTargets: emergencySentinelTargets,
          ghostTargets: emergencyGhostTargets,
          crystalTargets: emergencyCrystalTargets,
          chipTargets: emergencyChipTargets,
          diceTargets: emergencyDiceTargets,
          blackHoleTargets: emergencyBlackHoleTargets,
          openPentagonTargets: emergencyOpenPentagonTargets,
          eyeTargets: emergencyEyeTargets,
          tallyTargets: emergencyTallyTargets,
          compassTargets: emergencyCompassTargets,
          polyominoSymbols: emergencyPolyominoSymbols,
          negatorTargets: emergencyNegatorTargets,
          hexTargets: emergencyHexTargets,
          solutionPath: validatedEmergencyPath,
        }
      }
    }
    return {
      puzzle: emergencyPuzzle,
      activeKinds: ['gap-line'] as TileKind[],
      arrowTargets: emergencyArrowTargets,
      colorSquares: emergencyColorSquares,
      starTargets: emergencyStarTargets,
      triangleTargets: emergencyTriangleTargets,
      dotTargets: emergencyDotTargets,
      diamondTargets: emergencyDiamondTargets,
      chevronTargets: emergencyChevronTargets,
      minesweeperTargets: emergencyMinesweeperTargets,
      waterDropletTargets: emergencyWaterDropletTargets,
      cardinalTargets: emergencyCardinalTargets,
      spinnerTargets: emergencySpinnerTargets,
      sentinelTargets: emergencySentinelTargets,
      ghostTargets: emergencyGhostTargets,
      crystalTargets: emergencyCrystalTargets,
      chipTargets: emergencyChipTargets,
      diceTargets: emergencyDiceTargets,
      blackHoleTargets: emergencyBlackHoleTargets,
      openPentagonTargets: emergencyOpenPentagonTargets,
      eyeTargets: emergencyEyeTargets,
      tallyTargets: emergencyTallyTargets,
      compassTargets: emergencyCompassTargets,
      polyominoSymbols: emergencyPolyominoSymbols,
      negatorTargets: emergencyNegatorTargets,
      hexTargets: emergencyHexTargets,
      solutionPath: emergencyPath,
    }

  }, [seed, selectedKinds, selectedKindsKey])

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
    crystalTargets,
    chipTargets,
    diceTargets,
    blackHoleTargets,
    openPentagonTargets,
    eyeTargets,
    tallyTargets,
    compassTargets,
    polyominoSymbols,
    negatorTargets,
    hexTargets,
    solutionPath,
  } = useMemo(() => {
    if (generated.tallyTargets.length === 0 || generated.solutionPath.length < 2) {
      return generated
    }
    const effectiveUsedEdges = resolveEyeEffects(
      edgesFromPath(generated.solutionPath),
      generated.eyeTargets
    ).effectiveUsedEdges
    const syncedTallyTargets = recalculateTallyMarkTargets(
      effectiveUsedEdges,
      generated.tallyTargets
    )
    let changed = false
    for (let index = 0; index < syncedTallyTargets.length; index += 1) {
      if (syncedTallyTargets[index] !== generated.tallyTargets[index]) {
        changed = true
        break
      }
    }
    if (!changed) return generated
    return {
      ...generated,
      tallyTargets: syncedTallyTargets,
    }
  }, [generated])

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
      crystals: [...lastSolved.eliminations.crystals],
      chips: [...lastSolved.eliminations.chips],
      dice: [...lastSolved.eliminations.dice],
      blackHoles: [...lastSolved.eliminations.blackHoles],
      openPentagons: [...lastSolved.eliminations.openPentagons],
      tallyMarks: [...lastSolved.eliminations.tallyMarks],
      eyes: [...lastSolved.eliminations.eyes],
      compasses: [...lastSolved.eliminations.compasses],
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
      crystalTargets,
      chipTargets,
      diceTargets,
      blackHoleTargets,
      openPentagonTargets,
      eyeTargets,
      tallyTargets,
      compassTargets,
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
        crystals: [...solvedEliminations.crystals],
        chips: [...solvedEliminations.chips],
        dice: [...solvedEliminations.dice],
        blackHoles: [...solvedEliminations.blackHoles],
        openPentagons: [...solvedEliminations.openPentagons],
        tallyMarks: [...solvedEliminations.tallyMarks],
        eyes: [...solvedEliminations.eyes],
        compasses: [...solvedEliminations.compasses],
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
      crystalTargets,
      chipTargets,
      diceTargets,
      blackHoleTargets,
      openPentagonTargets,
      eyeTargets,
      tallyTargets,
      compassTargets,
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
      crystals: new Set(eliminations.crystals),
      chips: new Set(eliminations.chips),
      dice: new Set(eliminations.dice),
      blackHoles: new Set(eliminations.blackHoles),
      openPentagons: new Set(eliminations.openPentagons),
      tallyMarks: new Set(eliminations.tallyMarks),
      eyes: new Set(eliminations.eyes),
      compasses: new Set(eliminations.compasses),
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
          {crystalTargets.length > 0 && (
            <g className="crystals">
              {crystalTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const facetColors = crystalFacetColors(target.color)
                return (
                  <g
                    key={`crystal-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.crystals.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <g transform="scale(0.72)">
                      <polygon className="crystal-face" points="0,-0.34 -0.22,-0.2 -0.12,-0.08 0,-0.19" style={{ fill: facetColors.topLeft }} />
                      <polygon className="crystal-face" points="0,-0.34 0.22,-0.2 0.12,-0.08 0,-0.19" style={{ fill: facetColors.topRight }} />
                      <polygon className="crystal-face" points="-0.22,-0.2 -0.12,-0.08 -0.12,0.08 -0.22,0.2" style={{ fill: facetColors.left }} />
                      <polygon className="crystal-face" points="0.22,-0.2 0.12,-0.08 0.12,0.08 0.22,0.2" style={{ fill: facetColors.right }} />
                      <polygon className="crystal-face" points="0,-0.19 -0.12,-0.08 -0.12,0.08 0,0.19" style={{ fill: facetColors.centerLeft }} />
                      <polygon className="crystal-face" points="0,-0.19 0.12,-0.08 0.12,0.08 0,0.19" style={{ fill: facetColors.centerRight }} />
                      <polygon className="crystal-face" points="-0.22,0.2 -0.12,0.08 0,0.19 0,0.34" style={{ fill: facetColors.bottomLeft }} />
                      <polygon className="crystal-face" points="0.22,0.2 0.12,0.08 0,0.19 0,0.34" style={{ fill: facetColors.bottomRight }} />
                    </g>
                  </g>
                )
              })}
            </g>
          )}
          {chipTargets.length > 0 && (
            <g className="chips">
              {chipTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const shellPath = rosettePath(0, 0, 0.165, 0.036, 6, Math.PI)
                const holePath = rosettePath(0, 0, 0.082, 0.018, 6, Math.PI)
                return (
                  <g
                    key={`chip-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.chips.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <path
                      className="chip-shell"
                      d={shellPath}
                      style={{ fill: target.color }}
                    />
                    <path
                      className="chip-hole"
                      d={holePath}
                    />
                  </g>
                )
              })}
            </g>
          )}
          {diceTargets.length > 0 && (
            <g className="dice-targets">
              {diceTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const pips = dicePipOffsets(target.value)
                return (
                  <g
                    key={`dice-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5}) rotate(-4)`}
                    style={
                      eliminated.dice.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <rect
                      className="dice-face"
                      x={-0.16}
                      y={-0.16}
                      width={0.32}
                      height={0.32}
                      rx={0}
                      style={{ stroke: target.color }}
                    />
                    {pips.map((offset, pipIndex) => (
                      <circle
                        key={`dice-pip-${target.cellX}-${target.cellY}-${index}-${pipIndex}`}
                        className="dice-pip"
                        cx={offset.x}
                        cy={offset.y}
                        r={0.022}
                        style={{ fill: target.color }}
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}
          {blackHoleTargets.length > 0 && (
            <g className="black-holes">
              {blackHoleTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <g
                    key={`black-hole-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.blackHoles.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    {[0, 60, 120, 180, 240, 300].map((angle) => (
                      <g
                        key={`black-hole-arm-${target.cellX}-${target.cellY}-${index}-${angle}`}
                        transform={`rotate(${angle})`}
                      >
                        <path
                          className="black-hole-arm"
                          d="M 0 0 C 0.045 -0.01 0.085 -0.046 0.098 -0.096 C 0.113 -0.145 0.095 -0.192 0.052 -0.212"
                          style={{ stroke: target.color }}
                        />
                      </g>
                    ))}
                    <circle className="black-hole-center" cx={0} cy={0} r={0.067} style={{ fill: target.color }} />
                  </g>
                )
              })}
            </g>
          )}
          {openPentagonTargets.length > 0 && (
            <g className="open-pentagons">
              {openPentagonTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                return (
                  <polyline
                    key={`open-pentagon-${target.cellX}-${target.cellY}-${index}`}
                    className="open-pentagon-line"
                    points={openPentagonPoints(target.cellX + 0.5, target.cellY + 0.5, 0.33)}
                    style={
                      eliminated.openPentagons.has(index)
                        ? {
                            stroke: target.color,
                            opacity: 0.24,
                            filter: glowFilter,
                          }
                        : {
                            stroke: target.color,
                            filter: glowFilter,
                          }
                    }
                  />
                )
              })}
            </g>
          )}
          {eyeTargets.length > 0 && (
            <g className="eyes">
              {eyeTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const pupilOffset = eyePupilOffset(target.direction)
                return (
                  <g
                    key={`eye-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.eyes.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <polygon
                      className="eye-outline"
                      points={eyeDiamondPoints(0, 0, 0.188)}
                      style={{ stroke: target.color }}
                    />
                    <circle
                      className="eye-pupil"
                      cx={pupilOffset.x}
                      cy={pupilOffset.y}
                      r={0.028}
                      style={{ fill: target.color }}
                    />
                  </g>
                )
              })}
            </g>
          )}
          {compassTargets.length > 0 && (
            <g className="compasses">
              {compassTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const baseTransform = [
                  `translate(${target.cellX + 0.5} ${target.cellY + 0.5})`,
                  `rotate(${target.rotation * 90})`,
                ]
                  .filter(Boolean)
                  .join(' ')
                const glyphTransform = target.mirrored
                  ? `${baseTransform} scale(-1 1)`
                  : baseTransform
                const eastX = target.mirrored ? -0.23 : 0.23
                const westX = target.mirrored ? 0.23 : -0.23
                return (
                  <g
                    key={`compass-${target.cellX}-${target.cellY}-${index}`}
                    style={
                      eliminated.compasses.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    <g transform={glyphTransform}>
                      <circle className="compass-ring" cx={0} cy={0} r={0.205} style={{ stroke: target.color }} />
                      <circle className="compass-dot" cx={0} cy={0} r={0.02} style={{ fill: target.color }} />
                    </g>
                    <g transform={baseTransform}>
                      <polygon
                        className="compass-north-tip"
                        points="0,-0.282 0.038,-0.214 -0.038,-0.214"
                        style={{ fill: target.color }}
                      />
                      <text className="compass-label" x={0} y={-0.122} textAnchor="middle" dominantBaseline="middle" style={{ fill: target.color }}>N</text>
                      <text className="compass-label" x={eastX * 0.56} y={0.01} textAnchor="middle" dominantBaseline="middle" style={{ fill: target.color }}>E</text>
                      <text className="compass-label" x={0} y={0.132} textAnchor="middle" dominantBaseline="middle" style={{ fill: target.color }}>S</text>
                      <text className="compass-label" x={westX * 0.56} y={0.01} textAnchor="middle" dominantBaseline="middle" style={{ fill: target.color }}>W</text>
                    </g>
                  </g>
                )
              })}
            </g>
          )}
          {tallyTargets.length > 0 && (
            <g className="tally-marks">
              {tallyTargets.map((target, index) => {
                const glowFilter = symbolGlowFilter(target.color)
                const segments = tallyMarkSegments(target.count, 0.2, 0.062, -0.18, 0.18)
                return (
                  <g
                    key={`tally-mark-${target.cellX}-${target.cellY}-${index}`}
                    transform={`translate(${target.cellX + 0.5} ${target.cellY + 0.5})`}
                    style={
                      eliminated.tallyMarks.has(index)
                        ? { opacity: 0.24, filter: glowFilter }
                        : { filter: glowFilter }
                    }
                  >
                    {segments.map((segment, segmentIndex) => (
                      <line
                        key={`tally-mark-segment-${target.cellX}-${target.cellY}-${index}-${segmentIndex}`}
                        className="tally-mark-line"
                        x1={segment.x1}
                        y1={segment.y1}
                        x2={segment.x2}
                        y2={segment.y2}
                        style={{ stroke: target.color }}
                      />
                    ))}
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




