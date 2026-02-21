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
import type { TriangleTarget } from './triangles'
import type { WaterDropletTarget } from './waterDroplet'
import type { BlackHoleTarget } from './blackHoles'
import type { EyeTarget } from './eyes'

export type TallyMarkTarget = {
  cellX: number
  cellY: number
  color: string
  count: number
}

type ColoredCell = {
  cellX: number
  cellY: number
  color: string
}

export type TallyMarkSupportSymbols = {
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
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  tallyTargets?: TallyMarkTarget[]
  eyeTargets?: EyeTarget[]
}

const DEFAULT_TALLY_COLOR = '#f8f5ef'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function collectColoredCells(
  symbols: TallyMarkSupportSymbols,
  tallyTargets: TallyMarkTarget[]
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
  colored.push(...symbols.polyominoSymbols)
  colored.push(...symbols.negatorTargets)
  colored.push(...(symbols.tallyTargets ?? []))
  colored.push(...(symbols.eyeTargets ?? []))
  colored.push(...tallyTargets)
  return colored
}

function regionOutlineCount(
  regions: Map<string, number>,
  usedEdges: Set<string>,
  regionId: number
) {
  let outline = 0
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (regions.get(`${x},${y}`) !== regionId) continue
      const sides = [
        {
          neighbor: { x, y: y - 1 },
          edge: edgeKey({ x, y }, { x: x + 1, y }),
        },
        {
          neighbor: { x: x + 1, y },
          edge: edgeKey({ x: x + 1, y }, { x: x + 1, y: y + 1 }),
        },
        {
          neighbor: { x, y: y + 1 },
          edge: edgeKey({ x, y: y + 1 }, { x: x + 1, y: y + 1 }),
        },
        {
          neighbor: { x: x - 1, y },
          edge: edgeKey({ x, y }, { x, y: y + 1 }),
        },
      ]
      for (const side of sides) {
        if (!usedEdges.has(side.edge)) continue
        const next = side.neighbor
        if (next.x < 0 || next.x > 3 || next.y < 0 || next.y > 3) {
          outline += 1
          continue
        }
        if (regions.get(`${next.x},${next.y}`) !== regionId) {
          outline += 1
        }
      }
    }
  }
  return outline
}

export function collectFailingTallyMarkIndexes(
  usedEdges: Set<string>,
  tallyTargets: TallyMarkTarget[]
) {
  const failing = new Set<number>()
  if (tallyTargets.length === 0) return failing

  const regions = buildCellRegions(usedEdges)
  const cachedOutline = new Map<number, number>()
  const regionOutline = (region: number) => {
    if (!cachedOutline.has(region)) {
      cachedOutline.set(region, regionOutlineCount(regions, usedEdges, region))
    }
    return cachedOutline.get(region) ?? 0
  }
  const firstIndexByRegion = new Map<number, number>()

  tallyTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    const firstIndex = firstIndexByRegion.get(region)
    if (firstIndex !== undefined) {
      failing.add(firstIndex)
      failing.add(index)
    } else {
      firstIndexByRegion.set(region, index)
    }
    if (target.count !== regionOutline(region)) {
      failing.add(index)
    }
  })
  return failing
}

export function checkTallyMarks(
  usedEdges: Set<string>,
  tallyTargets: TallyMarkTarget[]
) {
  if (tallyTargets.length === 0) return false
  return collectFailingTallyMarkIndexes(usedEdges, tallyTargets).size === 0
}

export function generateTallyMarksForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: TallyMarkSupportSymbols,
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
  const regions = buildCellRegions(usedEdges)
  const availableCells = shuffle(
    Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4) })).filter(
      (cell) => !blockedCells.has(`${cell.x},${cell.y}`)
    ),
    rng
  )
  if (availableCells.length === 0) return null

  let palette = [DEFAULT_TALLY_COLOR]
  if (colorRuleActive) {
    const preferred = Array.from(new Set(preferredColors ?? []))
    const supportColors = Array.from(
      new Set(
        collectColoredCells(symbols, symbols.tallyTargets ?? []).map((target) => target.color)
      )
    )
    const base =
      preferred.length > 0
        ? preferred
        : supportColors.length > 0
          ? shuffle(supportColors, rng)
          : []
    const fallback = shuffle(COLOR_PALETTE.filter((color) => !base.includes(color)), rng)
    palette = [...base, ...fallback]
    if (palette.length === 0) palette = [DEFAULT_TALLY_COLOR]
  }

  const maxCountByDifficulty =
    selectedSymbolCount <= 2 ? 7 : selectedSymbolCount === 3 ? 5 : 4
  const regionOutlineCache = new Map<number, number>()
  const regionOutline = (region: number) => {
    if (!regionOutlineCache.has(region)) {
      regionOutlineCache.set(region, regionOutlineCount(regions, usedEdges, region))
    }
    return regionOutlineCache.get(region) ?? 0
  }
  const candidateRegions = new Map<number, Array<{ x: number; y: number }>>()
  for (const cell of availableCells) {
    const region = regions.get(`${cell.x},${cell.y}`)
    if (region === undefined) continue
    if (regionOutline(region) <= 0) continue
    const list = candidateRegions.get(region) ?? []
    list.push(cell)
    candidateRegions.set(region, list)
  }
  const availableRegionEntries = shuffle(Array.from(candidateRegions.entries()), rng)
  if (availableRegionEntries.length === 0) return null
  const maxAllowed = Math.min(maxCountByDifficulty, availableRegionEntries.length)
  if (maxAllowed <= 0) return null
  const minTargetCountBase = selectedSymbolCount <= 2 ? 2 : 1
  const minTargetCount = Math.min(minTargetCountBase, maxAllowed)
  const targetCounts = Array.from(
    { length: maxAllowed - minTargetCount + 1 },
    (_, index) => maxAllowed - index
  ).filter((count) => count >= minTargetCount)

  for (const targetCount of targetCounts) {
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const localRng = mulberry32(seed + 14_011 + targetCount * 127 + attempt * 173)
      const pickedRegions = shuffle([...availableRegionEntries], localRng).slice(0, targetCount)
      if (pickedRegions.length !== targetCount) continue

      const colorUsage = new Map<string, number>()
      const targets: TallyMarkTarget[] = []
      for (const [region, cells] of pickedRegions) {
        const cell = cells[Math.floor(localRng() * cells.length)] ?? cells[0]
        if (!cell) continue
        const rankedColors = shuffle([...palette], localRng).sort((a, b) => {
          const usageDiff = (colorUsage.get(a) ?? 0) - (colorUsage.get(b) ?? 0)
          if (usageDiff !== 0) return usageDiff
          return localRng() < 0.5 ? -1 : 1
        })
        const color = rankedColors[0] ?? palette[0] ?? DEFAULT_TALLY_COLOR
        colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
        targets.push({
          cellX: cell.x,
          cellY: cell.y,
          color,
          count: regionOutline(region),
        })
      }
      if (targets.length !== targetCount) continue
      if (checkTallyMarks(usedEdges, targets)) {
        return { targets, solutionPath }
      }
    }
  }

  return null
}
