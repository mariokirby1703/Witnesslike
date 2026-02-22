import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  edgeKey,
  edgesFromPath,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  shuffle,
} from '../puzzleUtils'
import type { ArrowTarget } from './arrows'
import type { CardinalTarget } from './cardinal'
import type { ChevronTarget } from './chevrons'
import type { ChipTarget } from './chips'
import type { ColorSquare } from './colorSquares'
import type { CrystalTarget } from './crystals'
import type { DiceTarget } from './dice'
import type { DiamondTarget } from './diamonds'
import type { DotTarget } from './dots'
import type { GhostTarget } from './ghost'
import type { MinesweeperNumberTarget } from './minesweeperNumbers'
import type { NegatorTarget } from './negator'
import type { OpenPentagonTarget } from './openPentagons'
import type { PolyominoSymbol } from './polyomino'
import type { SentinelTarget } from './sentinel'
import type { SpinnerTarget } from './spinner'
import type { StarTarget } from './stars'
import type { TallyMarkTarget } from './tallyMarks'
import type { TriangleTarget } from './triangles'
import type { WaterDropletTarget } from './waterDroplet'
import type { BlackHoleTarget } from './blackHoles'
import type { CompassTarget } from './compass'

export type EyeDirection = 'up' | 'right' | 'down' | 'left'

export type EyeTarget = {
  cellX: number
  cellY: number
  direction: EyeDirection
  color: string
}

type ColoredCell = {
  cellX: number
  cellY: number
  color: string
}

export type EyeSupportSymbols = {
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
  tallyTargets: TallyMarkTarget[]
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  compassTargets?: CompassTarget[]
  eyeTargets?: EyeTarget[]
}

type EyeSegment = {
  edge: string
  a: Point
  b: Point
}

export type EyeEffects = {
  failingIndexes: Set<number>
  ignoredEdgeKeys: Set<string>
  ignoredVertexKeys: Set<string>
  effectiveUsedEdges: Set<string>
}

const DEFAULT_EYE_COLOR = '#ef4b5f'
const EYE_DIRECTIONS: EyeDirection[] = ['up', 'right', 'down', 'left']
const MAX_COLOR_RULE_COLORS = 3

function pointKey(point: Point) {
  return `${point.x},${point.y}`
}

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function collectColoredCells(
  symbols: EyeSupportSymbols,
  eyeTargets: EyeTarget[]
) {
  const colored: ColoredCell[] = []
  colored.push(...symbols.arrowTargets)
  colored.push(...symbols.colorSquares)
  colored.push(...symbols.starTargets)
  colored.push(...symbols.triangleTargets)
  colored.push(...symbols.dotTargets)
  colored.push(...symbols.diamondTargets)
  colored.push(...symbols.chevronTargets)
  colored.push(...symbols.minesweeperTargets)
  colored.push(...symbols.waterDropletTargets)
  colored.push(...symbols.cardinalTargets)
  colored.push(...symbols.spinnerTargets)
  colored.push(...symbols.sentinelTargets)
  colored.push(...symbols.ghostTargets)
  colored.push(...symbols.crystalTargets)
  colored.push(...symbols.chipTargets)
  colored.push(...symbols.diceTargets)
  colored.push(...symbols.blackHoleTargets)
  colored.push(...symbols.openPentagonTargets)
  colored.push(...symbols.tallyTargets)
  colored.push(...symbols.polyominoSymbols)
  colored.push(...symbols.negatorTargets)
  colored.push(...(symbols.compassTargets ?? []))
  colored.push(...(symbols.eyeTargets ?? []))
  colored.push(...eyeTargets)
  return colored
}

function firstSegmentInDirection(
  usedEdges: Set<string>,
  target: Pick<EyeTarget, 'cellX' | 'cellY' | 'direction'>
): EyeSegment | null {
  if (target.direction === 'right') {
    for (let x = target.cellX + 1; x <= 4; x += 1) {
      const a = { x, y: target.cellY }
      const b = { x, y: target.cellY + 1 }
      const edge = edgeKey(a, b)
      if (usedEdges.has(edge)) return { edge, a, b }
    }
    return null
  }
  if (target.direction === 'left') {
    for (let x = target.cellX; x >= 0; x -= 1) {
      const a = { x, y: target.cellY }
      const b = { x, y: target.cellY + 1 }
      const edge = edgeKey(a, b)
      if (usedEdges.has(edge)) return { edge, a, b }
    }
    return null
  }
  if (target.direction === 'up') {
    for (let y = target.cellY; y >= 0; y -= 1) {
      const a = { x: target.cellX, y }
      const b = { x: target.cellX + 1, y }
      const edge = edgeKey(a, b)
      if (usedEdges.has(edge)) return { edge, a, b }
    }
    return null
  }
  for (let y = target.cellY + 1; y <= 4; y += 1) {
    const a = { x: target.cellX, y }
    const b = { x: target.cellX + 1, y }
    const edge = edgeKey(a, b)
    if (usedEdges.has(edge)) return { edge, a, b }
  }
  return null
}

export function resolveEyeEffects(
  usedEdges: Set<string>,
  eyeTargets: EyeTarget[]
): EyeEffects {
  const failingIndexes = new Set<number>()
  const ignoredEdgeKeys = new Set<string>()
  const ignoredVertexKeys = new Set<string>()
  const firstIndexByEdge = new Map<string, number>()

  eyeTargets.forEach((target, index) => {
    const segment = firstSegmentInDirection(usedEdges, target)
    if (!segment) {
      failingIndexes.add(index)
      return
    }
    const firstIndex = firstIndexByEdge.get(segment.edge)
    if (firstIndex !== undefined) {
      // Two eyes deleting the same segment is treated as invalid.
      failingIndexes.add(firstIndex)
      failingIndexes.add(index)
      return
    }
    firstIndexByEdge.set(segment.edge, index)
    ignoredEdgeKeys.add(segment.edge)
    ignoredVertexKeys.add(pointKey(segment.a))
    ignoredVertexKeys.add(pointKey(segment.b))
  })

  const effectiveUsedEdges = new Set<string>(usedEdges)
  ignoredEdgeKeys.forEach((edge) => {
    effectiveUsedEdges.delete(edge)
  })

  return {
    failingIndexes,
    ignoredEdgeKeys,
    ignoredVertexKeys,
    effectiveUsedEdges,
  }
}

export function collectFailingEyeIndexes(
  usedEdges: Set<string>,
  eyeTargets: EyeTarget[]
) {
  return resolveEyeEffects(usedEdges, eyeTargets).failingIndexes
}

export function checkEyes(
  usedEdges: Set<string>,
  eyeTargets: EyeTarget[]
) {
  if (eyeTargets.length === 0) return false
  return collectFailingEyeIndexes(usedEdges, eyeTargets).size === 0
}

export function eyeDirectionAngle(direction: EyeDirection) {
  if (direction === 'right') return 0
  if (direction === 'down') return 90
  if (direction === 'left') return 180
  return -90
}

export function generateEyesForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: EyeSupportSymbols,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)
      ? preferredPath
      : findBestLoopyPathByRegions(edges, rng, 180, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const usedEdges = edgesFromPath(solutionPath)
  const directionMap = new Map<string, EyeDirection[]>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const directions = EYE_DIRECTIONS.filter((direction) =>
        firstSegmentInDirection(usedEdges, { cellX: x, cellY: y, direction }) !== null
      )
      if (directions.length === 0) continue
      directionMap.set(`${x},${y}`, directions)
    }
  }
  const candidateCells = Array.from(directionMap.keys())
  if (candidateCells.length === 0) return null

  let palette = [DEFAULT_EYE_COLOR]
  if (colorRuleActive) {
    const preferred = Array.from(new Set(preferredColors ?? [])).slice(0, MAX_COLOR_RULE_COLORS)
    const supportColors = Array.from(
      new Set(
        collectColoredCells(symbols, symbols.eyeTargets ?? []).map((target) => target.color)
      )
    )
    const base =
      preferred.length > 0
        ? preferred
        : supportColors.length > 0
          ? shuffle(supportColors, rng).slice(0, MAX_COLOR_RULE_COLORS)
          : []
    const fallback = shuffle(COLOR_PALETTE.filter((color) => !base.includes(color)), rng)
    palette = [...base, ...fallback].slice(0, MAX_COLOR_RULE_COLORS)
    if (palette.length === 0) palette = [DEFAULT_EYE_COLOR]
  }

  const maxCountByDifficulty =
    selectedSymbolCount <= 2 ? 4 : selectedSymbolCount === 3 ? 3 : 2
  const maxAllowed = Math.min(maxCountByDifficulty, candidateCells.length)
  const minTargetCount = 1
  const targetCounts = Array.from(
    { length: maxAllowed - minTargetCount + 1 },
    (_, index) => maxAllowed - index
  ).filter((count) => count >= minTargetCount)

  for (const targetCount of targetCounts) {
    for (let attempt = 0; attempt < 84; attempt += 1) {
      const localRng = mulberry32(seed + 18_127 + targetCount * 211 + attempt * 131)
      const selectedCells = shuffle(candidateCells, localRng).slice(0, targetCount)
      if (selectedCells.length !== targetCount) continue

      const colorUsage = new Map<string, number>()
      const targets: EyeTarget[] = []
      const selectedEdgeKeys = new Set<string>()
      let failed = false

      for (const key of selectedCells) {
        const [cellX, cellY] = key.split(',').map(Number)
        const directions = directionMap.get(key) ?? []
        const directionOptions = shuffle([...directions], localRng).filter((direction) => {
          const segment = firstSegmentInDirection(usedEdges, { cellX, cellY, direction })
          if (!segment) return false
          return !selectedEdgeKeys.has(segment.edge)
        })
        const direction = directionOptions[0]
        if (!direction) {
          failed = true
          break
        }
        const segment = firstSegmentInDirection(usedEdges, { cellX, cellY, direction })
        if (!segment) {
          failed = true
          break
        }
        selectedEdgeKeys.add(segment.edge)

        const rankedColors = shuffle([...palette], localRng).sort((a, b) => {
          const usageDiff = (colorUsage.get(a) ?? 0) - (colorUsage.get(b) ?? 0)
          if (usageDiff !== 0) return usageDiff
          return localRng() < 0.5 ? -1 : 1
        })
        const color = rankedColors[0] ?? palette[0] ?? DEFAULT_EYE_COLOR
        colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
        targets.push({
          cellX,
          cellY,
          direction,
          color,
        })
      }

      if (failed || targets.length !== targetCount) continue
      if (checkEyes(usedEdges, targets)) {
        return { targets, solutionPath }
      }
    }
  }

  return null
}


