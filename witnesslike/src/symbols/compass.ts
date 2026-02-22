import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
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
import type { ChevronTarget } from './chevrons'
import type { ChipTarget } from './chips'
import type { ColorSquare } from './colorSquares'
import type { CrystalTarget } from './crystals'
import type { DiceTarget } from './dice'
import type { DiamondTarget } from './diamonds'
import type { DotTarget } from './dots'
import { resolveEyeEffects, type EyeTarget } from './eyes'
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

type CompassPattern = {
  up: boolean
  right: boolean
  down: boolean
  left: boolean
}

export type CompassTarget = {
  cellX: number
  cellY: number
  color: string
  rotation: 0 | 1 | 2 | 3
  mirrored: boolean
}

export type CompassSupportSymbols = {
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
  eyeTargets: EyeTarget[]
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  compassTargets?: CompassTarget[]
}

const DEFAULT_COMPASS_COLOR = '#7be0ff'
const COMPASS_ORIENTATIONS: Array<Pick<CompassTarget, 'rotation' | 'mirrored'>> = [
  { rotation: 0, mirrored: false },
  { rotation: 1, mirrored: false },
  { rotation: 2, mirrored: false },
  { rotation: 3, mirrored: false },
  { rotation: 0, mirrored: true },
  { rotation: 1, mirrored: true },
  { rotation: 2, mirrored: true },
  { rotation: 3, mirrored: true },
]

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function rotatePattern(pattern: CompassPattern, turns: number): CompassPattern {
  const normalized = ((turns % 4) + 4) % 4
  if (normalized === 0) return { ...pattern }
  if (normalized === 1) {
    return {
      up: pattern.left,
      right: pattern.up,
      down: pattern.right,
      left: pattern.down,
    }
  }
  if (normalized === 2) {
    return {
      up: pattern.down,
      right: pattern.left,
      down: pattern.up,
      left: pattern.right,
    }
  }
  return {
    up: pattern.right,
    right: pattern.down,
    down: pattern.left,
    left: pattern.up,
  }
}

function mirrorPattern(pattern: CompassPattern): CompassPattern {
  return {
    up: pattern.up,
    right: pattern.left,
    down: pattern.down,
    left: pattern.right,
  }
}

function normalizePattern(
  pattern: CompassPattern,
  orientation: Pick<CompassTarget, 'rotation' | 'mirrored'>
) {
  let normalized = rotatePattern(pattern, (4 - orientation.rotation) % 4)
  if (orientation.mirrored) {
    normalized = mirrorPattern(normalized)
  }
  return normalized
}

function patternSignature(pattern: CompassPattern) {
  return `${pattern.up ? '1' : '0'}${pattern.right ? '1' : '0'}${pattern.down ? '1' : '0'}${pattern.left ? '1' : '0'}`
}

function touchedCellPattern(usedEdges: Set<string>, cellX: number, cellY: number): CompassPattern {
  return {
    up: usedEdges.has(edgeKey({ x: cellX, y: cellY }, { x: cellX + 1, y: cellY })),
    right: usedEdges.has(edgeKey({ x: cellX + 1, y: cellY }, { x: cellX + 1, y: cellY + 1 })),
    down: usedEdges.has(edgeKey({ x: cellX, y: cellY + 1 }, { x: cellX + 1, y: cellY + 1 })),
    left: usedEdges.has(edgeKey({ x: cellX, y: cellY }, { x: cellX, y: cellY + 1 })),
  }
}

function touchedEdgeCount(pattern: CompassPattern) {
  let count = 0
  if (pattern.up) count += 1
  if (pattern.right) count += 1
  if (pattern.down) count += 1
  if (pattern.left) count += 1
  return count
}

export function collectFailingCompassIndexes(usedEdges: Set<string>, compassTargets: CompassTarget[]) {
  const failing = new Set<number>()
  if (compassTargets.length === 0) return failing

  const indexesByColor = new Map<string, number[]>()
  compassTargets.forEach((target, index) => {
    if (!indexesByColor.has(target.color)) indexesByColor.set(target.color, [])
    indexesByColor.get(target.color)?.push(index)
  })

  for (const indexes of indexesByColor.values()) {
    if (indexes.length <= 1) continue
    const signatures = new Set<string>()
    indexes.forEach((index) => {
      const target = compassTargets[index]
      const rawPattern = touchedCellPattern(usedEdges, target.cellX, target.cellY)
      const normalizedPattern = normalizePattern(rawPattern, target)
      signatures.add(patternSignature(normalizedPattern))
    })
    if (signatures.size <= 1) continue
    indexes.forEach((index) => failing.add(index))
  }

  return failing
}

export function checkCompasses(usedEdges: Set<string>, compassTargets: CompassTarget[]) {
  if (compassTargets.length === 0) return false
  return collectFailingCompassIndexes(usedEdges, compassTargets).size === 0
}

export function generateCompassesForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: CompassSupportSymbols,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)
      ? preferredPath
      : findBestLoopyPathByRegions(edges, rng, 200, 9) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const usedEdges = edgesFromPath(solutionPath)
  const effectiveUsedEdges = resolveEyeEffects(usedEdges, symbols.eyeTargets).effectiveUsedEdges

  const optionsBySignature = new Map<
    string,
    Array<{
      cellX: number
      cellY: number
      rotation: 0 | 1 | 2 | 3
      mirrored: boolean
      weight: number
    }>
  >()

  for (let cellY = 0; cellY < 4; cellY += 1) {
    for (let cellX = 0; cellX < 4; cellX += 1) {
      if (blockedCells.has(`${cellX},${cellY}`)) continue
      const rawPattern = touchedCellPattern(effectiveUsedEdges, cellX, cellY)
      if (touchedEdgeCount(rawPattern) === 0) continue
      for (const orientation of COMPASS_ORIENTATIONS) {
        const normalizedPattern = normalizePattern(rawPattern, orientation)
        const signature = patternSignature(normalizedPattern)
        if (!optionsBySignature.has(signature)) optionsBySignature.set(signature, [])
        optionsBySignature.get(signature)?.push({
          cellX,
          cellY,
          rotation: orientation.rotation,
          mirrored: orientation.mirrored,
          weight: cellX > 0 && cellX < 3 && cellY > 0 && cellY < 3 ? 1.25 : 1,
        })
      }
    }
  }

  const signatures = Array.from(optionsBySignature.entries())
    .map(([signature, options]) => ({
      signature,
      options,
      uniqueCells: new Set(options.map((option) => `${option.cellX},${option.cellY}`)).size,
    }))
    .filter((entry) => entry.uniqueCells > 0)
    .sort((a, b) => b.uniqueCells - a.uniqueCells)

  if (signatures.length === 0) return null

  // Compasses keep their own coloring behavior:
  // by default fixed compass color, but when color-synergy symbols are active
  // they adopt a puzzle color so they visually match that ruleset.
  const uniquePreferredColors = Array.from(
    new Set([
      ...(preferredColors ?? []),
      ...symbols.starTargets.map((target) => target.color),
      ...symbols.chipTargets.map((target) => target.color),
      ...symbols.blackHoleTargets.map((target) => target.color),
      ...symbols.openPentagonTargets.map((target) => target.color),
    ])
  )
  let compassColor = DEFAULT_COMPASS_COLOR
  if (colorRuleActive) {
    const preferredNonDefault =
      uniquePreferredColors.find((color) => color !== DEFAULT_COMPASS_COLOR) ??
      uniquePreferredColors[0]
    if (preferredNonDefault) {
      compassColor = preferredNonDefault
    } else {
      const fallbackPool = COLOR_PALETTE.filter((color) => color !== DEFAULT_COMPASS_COLOR)
      const fallbackColor =
        fallbackPool[randInt(rng, fallbackPool.length)] ??
        COLOR_PALETTE[randInt(rng, COLOR_PALETTE.length)]
      if (fallbackColor) compassColor = fallbackColor
    }
  }

  const minCount = 2
  const availableMax = signatures.reduce((max, entry) => Math.max(max, entry.uniqueCells), 0)
  if (availableMax < minCount) return null
  const requestedMax =
    selectedSymbolCount <= 1
      ? 8
      : selectedSymbolCount === 2
        ? 7
        : selectedSymbolCount === 3
          ? 6
          : 5
  const maxCount = Math.min(requestedMax, availableMax)
  const allCounts = Array.from({ length: maxCount - minCount + 1 }, (_, index) => minCount + index)
  const preferredCount = allCounts[randInt(rng, allCounts.length)] ?? maxCount
  const targetCounts = [...allCounts].sort((a, b) => {
    const aDist = Math.abs(a - preferredCount)
    const bDist = Math.abs(b - preferredCount)
    if (aDist !== bDist) return aDist - bDist
    return b - a
  })
  for (const targetCount of targetCounts) {
    for (const signatureEntry of signatures) {
      if (signatureEntry.uniqueCells < targetCount) continue
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const localRng = mulberry32(seed + 17_801 + targetCount * 131 + attempt * 179)
        const optionPool = shuffle(signatureEntry.options, localRng)
        const usedCells = new Set<string>()
        const targets: CompassTarget[] = []
        for (const option of optionPool) {
          if (targets.length >= targetCount) break
          const cellKey = `${option.cellX},${option.cellY}`
          if (usedCells.has(cellKey)) continue
          usedCells.add(cellKey)
          targets.push({
            cellX: option.cellX,
            cellY: option.cellY,
            color: compassColor,
            rotation: option.rotation,
            mirrored: option.mirrored,
          })
        }
        if (targets.length !== targetCount) continue
        if (checkCompasses(effectiveUsedEdges, targets)) {
          return { targets, solutionPath }
        }
      }
    }
  }

  return null
}

