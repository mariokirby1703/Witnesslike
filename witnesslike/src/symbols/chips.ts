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
import type { BlackHoleTarget } from './blackHoles'
import type { TallyMarkTarget } from './tallyMarks'
import type { EyeTarget } from './eyes'

export type ChipTarget = {
  cellX: number
  cellY: number
  color: string
}

export type ChipSupportSymbols = {
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
  blackHoleTargets: BlackHoleTarget[]
  diceTargets: DiceTarget[]
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  tallyTargets?: TallyMarkTarget[]
  eyeTargets?: EyeTarget[]
}

export type ChipConstraintSymbols = ChipSupportSymbols & {
  chipTargets: ChipTarget[]
}

type Cell = { x: number; y: number }
type ColoredCell = { cellX: number; cellY: number; color: string }

const DEFAULT_CHIP_COLOR = '#8e2de2'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function isEdgeCell(cell: Cell) {
  return cell.x === 0 || cell.x === 3 || cell.y === 0 || cell.y === 3
}

function collectColoredCells(
  symbols: ChipSupportSymbols,
  chipTargets: ChipTarget[]
) {
  const cells: ColoredCell[] = []
  cells.push(...symbols.arrowTargets)
  cells.push(...symbols.colorSquares)
  cells.push(...symbols.starTargets)
  cells.push(...symbols.triangleTargets)
  cells.push(...symbols.dotTargets)
  cells.push(...symbols.diamondTargets)
  cells.push(...symbols.chevronTargets)
  cells.push(...symbols.minesweeperTargets)
  cells.push(...symbols.waterDropletTargets)
  cells.push(...symbols.cardinalTargets)
  cells.push(...symbols.spinnerTargets)
  cells.push(...symbols.sentinelTargets)
  cells.push(...symbols.ghostTargets)
  cells.push(...symbols.crystalTargets)
  cells.push(...symbols.blackHoleTargets)
  cells.push(...symbols.diceTargets)
  cells.push(...symbols.polyominoSymbols)
  cells.push(...symbols.negatorTargets)
  cells.push(...(symbols.tallyTargets ?? []))
  cells.push(...(symbols.eyeTargets ?? []))
  cells.push(...chipTargets)
  return cells
}

function buildSupportSymbolColors(symbols: ChipSupportSymbols) {
  const colors = new Set<string>()
  collectColoredCells(symbols, []).forEach((target) => colors.add(target.color))
  return colors
}

function countSupportSymbols(symbols: ChipSupportSymbols) {
  return (
    symbols.arrowTargets.length +
    symbols.colorSquares.length +
    symbols.starTargets.length +
    symbols.triangleTargets.length +
    symbols.dotTargets.length +
    symbols.diamondTargets.length +
    symbols.chevronTargets.length +
    symbols.minesweeperTargets.length +
    symbols.waterDropletTargets.length +
    symbols.cardinalTargets.length +
    symbols.spinnerTargets.length +
    symbols.sentinelTargets.length +
    symbols.ghostTargets.length +
    symbols.crystalTargets.length +
    symbols.blackHoleTargets.length +
    symbols.diceTargets.length +
    symbols.polyominoSymbols.length +
    symbols.negatorTargets.length +
    (symbols.tallyTargets?.length ?? 0) +
    (symbols.eyeTargets?.length ?? 0)
  )
}

function regionColorKey(region: number, color: string) {
  return `${region}|${color}`
}

function isLineable(cells: Cell[]) {
  if (cells.length <= 1) return true
  const firstX = cells[0].x
  const firstY = cells[0].y
  const sameX = cells.every((cell) => cell.x === firstX)
  const sameY = cells.every((cell) => cell.y === firstY)
  return sameX || sameY
}

function allowedCellsForGroup(existingCells: Cell[], availableCells: Cell[]) {
  if (existingCells.length === 0) return availableCells
  const firstX = existingCells[0].x
  const firstY = existingCells[0].y
  const sameX = existingCells.every((cell) => cell.x === firstX)
  const sameY = existingCells.every((cell) => cell.y === firstY)
  if (!sameX && !sameY) return []
  return availableCells.filter(
    (cell) => (sameX && cell.x === firstX) || (sameY && cell.y === firstY)
  )
}

function buildRegionCells(
  regions: Map<string, number>,
  blockedCells: Set<string>
) {
  const regionCells = new Map<number, Cell[]>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }
  return regionCells
}

function buildExistingCellsByRegionColor(
  regions: Map<string, number>,
  symbols: ChipSupportSymbols
) {
  const grouped = new Map<string, Cell[]>()
  const add = (target: ColoredCell) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) return
    const key = regionColorKey(region, target.color)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)?.push({ x: target.cellX, y: target.cellY })
  }
  collectColoredCells(symbols, []).forEach(add)
  return grouped
}

export function collectFailingChipIndexes(
  usedEdges: Set<string>,
  symbols: ChipConstraintSymbols
) {
  const failing = new Set<number>()
  if (symbols.chipTargets.length === 0) return failing

  const regions = buildCellRegions(usedEdges)
  const allSymbols = collectColoredCells(symbols, symbols.chipTargets)
  const symbolCountByColor = new Map<string, number>()
  const symbolCountByRegion = new Map<number, number>()
  const cellsByRegionColor = new Map<string, Cell[]>()
  for (const symbol of allSymbols) {
    symbolCountByColor.set(symbol.color, (symbolCountByColor.get(symbol.color) ?? 0) + 1)
    const region = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (region === undefined) continue
    symbolCountByRegion.set(region, (symbolCountByRegion.get(region) ?? 0) + 1)
    const key = regionColorKey(region, symbol.color)
    if (!cellsByRegionColor.has(key)) cellsByRegionColor.set(key, [])
    cellsByRegionColor.get(key)?.push({ x: symbol.cellX, y: symbol.cellY })
  }

  const chipIndexesByRegionColor = new Map<string, number[]>()
  symbols.chipTargets.forEach((target, index) => {
    if ((symbolCountByColor.get(target.color) ?? 0) <= 1) {
      failing.add(index)
    }
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    if ((symbolCountByRegion.get(region) ?? 0) <= 1) {
      failing.add(index)
    }
    const key = regionColorKey(region, target.color)
    if (!chipIndexesByRegionColor.has(key)) chipIndexesByRegionColor.set(key, [])
    chipIndexesByRegionColor.get(key)?.push(index)
  })

  for (const [key, chipIndexes] of chipIndexesByRegionColor.entries()) {
    const cells = cellsByRegionColor.get(key) ?? []
    if (cells.length <= 1) {
      for (const chipIndex of chipIndexes) failing.add(chipIndex)
      continue
    }
    if (isLineable(cells)) continue
    for (const chipIndex of chipIndexes) failing.add(chipIndex)
  }

  return failing
}

export function checkChips(
  usedEdges: Set<string>,
  symbols: ChipConstraintSymbols
) {
  if (symbols.chipTargets.length === 0) return false
  return collectFailingChipIndexes(usedEdges, symbols).size === 0
}

export function generateChipsForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: ChipSupportSymbols,
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
  const regionCells = buildRegionCells(regions, blockedCells)
  if (regionCells.size === 0) return null

  const supportColors = buildSupportSymbolColors(symbols)
  let palette = [DEFAULT_CHIP_COLOR]
  if (colorRuleActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    const fallbackFromSupport = Array.from(supportColors)
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else if (fallbackFromSupport.length > 0) {
      palette = shuffle(fallbackFromSupport, rng).slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_CHIP_COLOR]
  }

  const existingByRegionColor = buildExistingCellsByRegionColor(regions, symbols)
  const hasSupportSymbols = existingByRegionColor.size > 0
  const supportSymbolCount = countSupportSymbols(symbols)
  const availableCellCount = Array.from(regionCells.values()).reduce(
    (sum, cells) => sum + cells.length,
    0
  )
  const lowSymbolSet = selectedSymbolCount <= 2
  const minChipContribution = Math.max(1, 5 - supportSymbolCount)
  const minCount = Math.max(lowSymbolSet ? 2 : 1, minChipContribution)
  const maxCount = lowSymbolSet ? 9 : 6
  const maxAllowed = Math.min(Math.max(minCount, maxCount), availableCellCount)
  if (maxAllowed < minCount) return null
  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)

  for (let attempt = 0; attempt < 110; attempt += 1) {
    const localRng = mulberry32(seed + 5101 + attempt * 101)
    const usedCells = new Set(blockedCells)
    const workingByRegionColor = new Map<string, Cell[]>(
      Array.from(existingByRegionColor.entries()).map(([key, cells]) => [
        key,
        [...cells],
      ])
    )
    const chips: ChipTarget[] = []
    const chipColorUsage = new Map<string, number>()
    let placedInteractingChip = false

    for (let placed = 0; placed < targetCount; placed += 1) {
      type PlacementOption = {
        region: number
        color: string
        cell: Cell
        hasSupport: boolean
        weight: number
      }
      const options: PlacementOption[] = []
      for (const [region, cells] of regionCells.entries()) {
        const availableCells = cells.filter((cell) => !usedCells.has(`${cell.x},${cell.y}`))
        if (availableCells.length === 0) continue

        for (const color of palette) {
          const key = regionColorKey(region, color)
          const groupCells = workingByRegionColor.get(key) ?? []
          const allowedCells = allowedCellsForGroup(groupCells, availableCells)
          if (allowedCells.length === 0) continue
          const hasSupport = groupCells.length > 0
          const colorUsage = chipColorUsage.get(color) ?? 0
          const diversityBonus =
            colorRuleActive && palette.length > 1
              ? colorUsage === 0
                ? 1.9
                : colorUsage === 1
                  ? 1.2
                  : 0.74
              : 1
          for (const cell of allowedCells) {
            const centerBonus = isEdgeCell(cell) ? 0.82 : 2.25
            const supportBonus = hasSupport ? 4.6 : 1.15
            const sharedColorBonus = supportColors.has(color) ? 1.4 : 0.65
            const shapeBonus = groupCells.length >= 2 ? 1.2 : 0.4
            const jitter = localRng() * 0.35
            options.push({
              region,
              color,
              cell,
              hasSupport,
              weight:
                (centerBonus + supportBonus + sharedColorBonus + shapeBonus + jitter) * diversityBonus,
            })
          }
        }
      }

      if (options.length === 0) break
      const hasSupportOption = options.some((option) => option.hasSupport)
      const usedColorCount = chipColorUsage.size
      const shouldFavorDiversification =
        colorRuleActive && palette.length > 1 && usedColorCount < Math.min(2, palette.length)
      const shouldPreferSupport =
        hasSupportOption && localRng() < (shouldFavorDiversification ? 0.44 : 0.82)
      let weightedPool = shouldPreferSupport
        ? options.filter((option) => option.hasSupport)
        : options
      if (shouldFavorDiversification) {
        const unusedColorOptions = weightedPool.filter(
          (option) => (chipColorUsage.get(option.color) ?? 0) === 0
        )
        if (unusedColorOptions.length > 0 && localRng() < 0.68) {
          weightedPool = unusedColorOptions
        }
      }
      const totalWeight = weightedPool.reduce((sum, option) => sum + option.weight, 0)
      if (totalWeight <= 0) break
      let roll = localRng() * totalWeight
      const pick =
        weightedPool.find((option) => {
          roll -= option.weight
          return roll <= 0
        }) ?? weightedPool[weightedPool.length - 1]
      if (!pick) break

      chips.push({
        cellX: pick.cell.x,
        cellY: pick.cell.y,
        color: pick.color,
      })
      chipColorUsage.set(pick.color, (chipColorUsage.get(pick.color) ?? 0) + 1)
      if (pick.hasSupport) placedInteractingChip = true
      usedCells.add(`${pick.cell.x},${pick.cell.y}`)
      const key = regionColorKey(pick.region, pick.color)
      if (!workingByRegionColor.has(key)) workingByRegionColor.set(key, [])
      workingByRegionColor.get(key)?.push({ x: pick.cell.x, y: pick.cell.y })
    }

    if (chips.length < targetCount) continue
    if (hasSupportSymbols && !placedInteractingChip && localRng() < 0.86) continue

    const chipCheckSymbols: ChipConstraintSymbols = {
      ...symbols,
      chipTargets: chips,
    }
    if (checkChips(usedEdges, chipCheckSymbols)) {
      return {
        targets: chips,
        solutionPath,
      }
    }
  }

  return null
}
