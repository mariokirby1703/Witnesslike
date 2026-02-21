import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
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
import type { ColorSquare } from './colorSquares'
import type { CrystalTarget } from './crystals'
import type { DiceTarget } from './dice'
import type { DiamondTarget } from './diamonds'
import type { DotTarget } from './dots'
import type { GhostTarget } from './ghost'
import type { MinesweeperNumberTarget } from './minesweeperNumbers'
import type { NegatorTarget } from './negator'
import type { PolyominoSymbol } from './polyomino'
import type { SentinelTarget } from './sentinel'
import type { SpinnerTarget } from './spinner'
import type { StarTarget } from './stars'
import type { TriangleTarget } from './triangles'
import type { WaterDropletTarget } from './waterDroplet'
import type { ChipTarget } from './chips'
import type { TallyMarkTarget } from './tallyMarks'
import type { EyeTarget } from './eyes'

export type BlackHoleTarget = {
  cellX: number
  cellY: number
  color: string
}

type ColoredCell = {
  cellX: number
  cellY: number
  color: string
}

export type BlackHoleSupportSymbols = {
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
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  tallyTargets?: TallyMarkTarget[]
  eyeTargets?: EyeTarget[]
  blackHoleTargets?: BlackHoleTarget[]
}

export type BlackHoleConstraintSymbols = BlackHoleSupportSymbols & {
  blackHoleTargets: BlackHoleTarget[]
}

const DEFAULT_BLACK_HOLE_COLOR = '#111111'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function isEdgeCell(cellX: number, cellY: number) {
  return cellX === 0 || cellX === 3 || cellY === 0 || cellY === 3
}

function touchesCellSides(usedEdges: Set<string>, cellX: number, cellY: number) {
  const top = edgeKey({ x: cellX, y: cellY }, { x: cellX + 1, y: cellY })
  const bottom = edgeKey({ x: cellX, y: cellY + 1 }, { x: cellX + 1, y: cellY + 1 })
  const left = edgeKey({ x: cellX, y: cellY }, { x: cellX, y: cellY + 1 })
  const right = edgeKey({ x: cellX + 1, y: cellY }, { x: cellX + 1, y: cellY + 1 })
  return (
    usedEdges.has(top) ||
    usedEdges.has(bottom) ||
    usedEdges.has(left) ||
    usedEdges.has(right)
  )
}

function collectColoredCells(
  symbols: BlackHoleSupportSymbols,
  blackHoleTargets: BlackHoleTarget[]
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
  colored.push(...symbols.polyominoSymbols)
  colored.push(...symbols.negatorTargets)
  colored.push(...(symbols.tallyTargets ?? []))
  colored.push(...(symbols.eyeTargets ?? []))
  colored.push(...blackHoleTargets)
  return colored
}

function regionColorKey(region: number, color: string) {
  return `${region}|${color}`
}

function buildRegionColorCounts(
  regions: Map<string, number>,
  symbols: BlackHoleSupportSymbols,
  blackHoleTargets: BlackHoleTarget[]
) {
  const counts = new Map<string, number>()
  for (const target of collectColoredCells(symbols, blackHoleTargets)) {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) continue
    const key = regionColorKey(region, target.color)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function buildGlobalColorCounts(
  symbols: BlackHoleSupportSymbols,
  blackHoleTargets: BlackHoleTarget[]
) {
  const counts = new Map<string, number>()
  for (const target of collectColoredCells(symbols, blackHoleTargets)) {
    counts.set(target.color, (counts.get(target.color) ?? 0) + 1)
  }
  return counts
}

function cloneMap(source: Map<string, number>) {
  return new Map<string, number>(Array.from(source.entries()))
}

export function collectFailingBlackHoleIndexes(
  usedEdges: Set<string>,
  symbols: BlackHoleConstraintSymbols
) {
  const failing = new Set<number>()
  if (symbols.blackHoleTargets.length === 0) return failing

  const regions = buildCellRegions(usedEdges)
  const regionColorCounts = buildRegionColorCounts(regions, symbols, symbols.blackHoleTargets)

  symbols.blackHoleTargets.forEach((target, index) => {
    if (touchesCellSides(usedEdges, target.cellX, target.cellY)) {
      failing.add(index)
      return
    }
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    const sameColorInRegion = regionColorCounts.get(regionColorKey(region, target.color)) ?? 0
    if (sameColorInRegion > 1) {
      failing.add(index)
    }
  })

  return failing
}

export function checkBlackHoles(
  usedEdges: Set<string>,
  symbols: BlackHoleConstraintSymbols
) {
  if (symbols.blackHoleTargets.length === 0) return false
  return collectFailingBlackHoleIndexes(usedEdges, symbols).size === 0
}

export function generateBlackHolesForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: BlackHoleSupportSymbols,
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
  const regions = buildCellRegions(usedEdges)

  const availableCells = shuffle(
    Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4) })).filter(
      (cell) =>
        !blockedCells.has(`${cell.x},${cell.y}`) &&
        regions.has(`${cell.x},${cell.y}`) &&
        !touchesCellSides(usedEdges, cell.x, cell.y)
    ),
    rng
  )
  if (availableCells.length === 0) return null

  let palette = [DEFAULT_BLACK_HOLE_COLOR]
  const supportColorSet = new Set(
    collectColoredCells(symbols, []).map((target) => target.color)
  )
  if (colorRuleActive) {
    const preferred = Array.from(new Set(preferredColors ?? []))
    const supportColors = Array.from(supportColorSet)
    const base =
      preferred.length > 0
        ? preferred
        : supportColors.length > 0
          ? shuffle(supportColors, rng)
          : []
    const fallback = shuffle(COLOR_PALETTE.filter((color) => !base.includes(color)), rng)
    palette = [...base, ...fallback]
    if (palette.length === 0) palette = [DEFAULT_BLACK_HOLE_COLOR]
  }

  const existingRegionColorCounts = buildRegionColorCounts(
    regions,
    symbols,
    symbols.blackHoleTargets ?? []
  )
  const hasFeasibleSupportColorOption =
    supportColorSet.size > 0 &&
    availableCells.some((cell) => {
      const region = regions.get(`${cell.x},${cell.y}`)
      if (region === undefined) return false
      for (const color of supportColorSet) {
        if ((existingRegionColorCounts.get(regionColorKey(region, color)) ?? 0) === 0) return true
      }
      return false
    })

  const maxCountByDifficulty =
    selectedSymbolCount <= 2 ? 5 : selectedSymbolCount === 3 ? 4 : 3
  const maxAllowed = Math.min(maxCountByDifficulty, availableCells.length)
  const targetCounts = Array.from({ length: maxAllowed }, (_, index) => maxAllowed - index)

  for (const targetCount of targetCounts) {
    for (let attempt = 0; attempt < 88; attempt += 1) {
      const localRng = mulberry32(seed + 9_211 + targetCount * 113 + attempt * 149)
      const usedCells = new Set<string>(blockedCells)
      const localRegionColorCounts = cloneMap(existingRegionColorCounts)
      const targets: BlackHoleTarget[] = []

      while (targets.length < targetCount) {
        const options: Array<{
          cellX: number
          cellY: number
          color: string
          region: number
          weight: number
        }> = []
        const colorUsage = new Map<string, number>()
        for (const target of targets) {
          colorUsage.set(target.color, (colorUsage.get(target.color) ?? 0) + 1)
        }

        for (const cell of availableCells) {
          if (usedCells.has(`${cell.x},${cell.y}`)) continue
          const region = regions.get(`${cell.x},${cell.y}`)
          if (region === undefined) continue
          for (const color of palette) {
            const key = regionColorKey(region, color)
            if ((localRegionColorCounts.get(key) ?? 0) > 0) continue
            const usage = colorUsage.get(color) ?? 0
            const diversityBonus = colorRuleActive
              ? supportColorSet.size === 0
                ? usage === 0
                  ? 0.82
                  : 1.34
                : usage === 0
                  ? 1.25
                  : 0.88
              : 1
            const supportColorBonus =
              colorRuleActive && supportColorSet.size > 0
                ? supportColorSet.has(color)
                  ? 1.85
                  : 0.62
                : 1
            const centerBonus = isEdgeCell(cell.x, cell.y) ? 0.8 : 1.5
            options.push({
              cellX: cell.x,
              cellY: cell.y,
              color,
              region,
              weight: (centerBonus + localRng() * 0.42) * diversityBonus * supportColorBonus,
            })
          }
        }

        if (options.length === 0) break
        const totalWeight = options.reduce((sum, option) => sum + option.weight, 0)
        if (totalWeight <= 0) break
        let roll = localRng() * totalWeight
        const chosen =
          options.find((option) => {
            roll -= option.weight
            return roll <= 0
          }) ?? options[options.length - 1]
        if (!chosen) break

        targets.push({
          cellX: chosen.cellX,
          cellY: chosen.cellY,
          color: chosen.color,
        })
        usedCells.add(`${chosen.cellX},${chosen.cellY}`)
        const key = regionColorKey(chosen.region, chosen.color)
        localRegionColorCounts.set(key, (localRegionColorCounts.get(key) ?? 0) + 1)
      }

      if (targets.length < targetCount) continue
      if (hasFeasibleSupportColorOption) {
        const overlapCount = targets.filter((target) => supportColorSet.has(target.color)).length
        const requiredOverlap = Math.min(targets.length, Math.max(1, Math.floor(targets.length * 0.6)))
        if (overlapCount < requiredOverlap) continue
      }
      const allBlackHoles = [...(symbols.blackHoleTargets ?? []), ...targets]
      const globalColorCounts = buildGlobalColorCounts(symbols, allBlackHoles)
      const hasUnpairedBlackHoleColor = targets.some(
        (target) => (globalColorCounts.get(target.color) ?? 0) < 2
      )
      if (hasUnpairedBlackHoleColor) continue
      const constraintSymbols: BlackHoleConstraintSymbols = {
        ...symbols,
        blackHoleTargets: targets,
      }
      if (checkBlackHoles(usedEdges, constraintSymbols)) {
        return { targets, solutionPath }
      }
    }
  }

  return null
}
