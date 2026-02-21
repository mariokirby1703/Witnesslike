import type { Point } from '../puzzleConstants'
import type { ArrowTarget } from './arrows'
import type { ColorSquare } from './colorSquares'
import type { CardinalTarget } from './cardinal'
import type { HexTarget } from './hexagon'
import type { MinesweeperNumberTarget } from './minesweeperNumbers'
import type { PolyominoSymbol } from './polyomino'
import type { SentinelTarget } from './sentinel'
import type { SpinnerTarget } from './spinner'
import type { StarTarget } from './stars'
import type { TriangleTarget } from './triangles'
import type { DotTarget } from './dots'
import type { DiamondTarget } from './diamonds'
import type { ChevronTarget } from './chevrons'
import type { WaterDropletTarget } from './waterDroplet'
import type { GhostTarget } from './ghost'
import type { CrystalTarget } from './crystals'
import type { ChipTarget } from './chips'
import type { DiceTarget } from './dice'
import type { BlackHoleTarget } from './blackHoles'
import type { OpenPentagonTarget } from './openPentagons'
import type { TallyMarkTarget } from './tallyMarks'
import type { EyeTarget } from './eyes'
import { collectFailingCrystalIndexes } from './crystals'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgesFromPath,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type NegatorTarget = {
  cellX: number
  cellY: number
  color: string
}

const DEFAULT_NEGATOR_COLOR = '#f8f5ef'

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

export function generateNegatorsForEdges(
  edges: Set<string>,
  seed: number,
  usedCells: Set<string>,
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
  polyominoSymbols: PolyominoSymbol[],
  hexTargets: HexTarget[],
  sentinelTargets: SentinelTarget[],
  spinnerTargets: SpinnerTarget[],
  ghostTargets: GhostTarget[],
  crystalTargets: CrystalTarget[],
  chipTargets: ChipTarget[],
  diceTargets: DiceTarget[],
  blackHoleTargets: BlackHoleTarget[],
  openPentagonTargets: OpenPentagonTarget[],
  tallyTargets: TallyMarkTarget[],
  eyeTargets: EyeTarget[],
  starsActive: boolean,
  preferredColors: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 180, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const usedEdges = edgesFromPath(solutionPath)
  const regions = buildCellRegions(usedEdges)
  const failingCrystalRegions = new Set<number>()
  for (const index of collectFailingCrystalIndexes(usedEdges, crystalTargets)) {
    const crystal = crystalTargets[index]
    if (!crystal) continue
    const region = regions.get(`${crystal.cellX},${crystal.cellY}`)
    if (region !== undefined) failingCrystalRegions.add(region)
  }
  const removableKeysByRegion = new Map<number, Set<string>>()
  const allRemovableKeys = new Set<string>()
  const addRemovable = (key: string, region: number | undefined) => {
    if (region === undefined) return
    if (!removableKeysByRegion.has(region)) removableKeysByRegion.set(region, new Set())
    removableKeysByRegion.get(region)?.add(key)
    allRemovableKeys.add(key)
  }
  arrowTargets.forEach((target, index) => {
    addRemovable(`arrow:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  colorSquares.forEach((target, index) => {
    addRemovable(`color:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  starTargets.forEach((target, index) => {
    addRemovable(`star:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  triangleTargets.forEach((target, index) => {
    addRemovable(`triangle:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  dotTargets.forEach((target, index) => {
    addRemovable(`dot:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  diamondTargets.forEach((target, index) => {
    addRemovable(`diamond:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  chevronTargets.forEach((target, index) => {
    addRemovable(`chevron:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  minesweeperTargets.forEach((target, index) => {
    addRemovable(`mine:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  waterDropletTargets.forEach((target, index) => {
    addRemovable(`water:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  cardinalTargets.forEach((target, index) => {
    addRemovable(`cardinal:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  polyominoSymbols.forEach((target, index) => {
    addRemovable(`poly:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  hexTargets.forEach((target, index) => {
    for (const region of regionIdsForBoardPoint(regions, target.position)) {
      addRemovable(`hex:${index}`, region)
    }
  })
  sentinelTargets.forEach((target, index) => {
    addRemovable(`sentinel:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  spinnerTargets.forEach((target, index) => {
    addRemovable(`spinner:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  ghostTargets.forEach((target, index) => {
    addRemovable(`ghost:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  crystalTargets.forEach((target, index) => {
    addRemovable(`crystal:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  chipTargets.forEach((target, index) => {
    addRemovable(`chip:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  diceTargets.forEach((target, index) => {
    addRemovable(`dice:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  blackHoleTargets.forEach((target, index) => {
    addRemovable(`black-hole:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  openPentagonTargets.forEach((target, index) => {
    addRemovable(`open-pentagon:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  tallyTargets.forEach((target, index) => {
    addRemovable(`tally-mark:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  eyeTargets.forEach((target, index) => {
    addRemovable(`eye:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  if (allRemovableKeys.size === 0) return null

  const availableCells = shuffle(
    Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4) }))
      .filter((cell) => !usedCells.has(`${cell.x},${cell.y}`))
      .filter((cell) => {
        const region = regions.get(`${cell.x},${cell.y}`)
        if (region === undefined) return false
        return (removableKeysByRegion.get(region)?.size ?? 0) > 0
      }),
    rng
  )
  if (availableCells.length === 0) return null
  const prioritizedCells = failingCrystalRegions.size === 0
    ? availableCells
    : [
        ...availableCells.filter((cell) => {
          const region = regions.get(`${cell.x},${cell.y}`)
          return region !== undefined && failingCrystalRegions.has(region)
        }),
        ...availableCells.filter((cell) => {
          const region = regions.get(`${cell.x},${cell.y}`)
          return region === undefined || !failingCrystalRegions.has(region)
        }),
      ]

  const wantsTwo =
    prioritizedCells.length >= 2 &&
    allRemovableKeys.size >= 2 &&
    crystalTargets.length === 0 &&
    rng() < 0.05
  const targetCount = wantsTwo ? 2 : 1

  const palette = starsActive
    ? (() => {
        const base = Array.from(new Set(preferredColors))
        if (base.length > 0) return base
        return shuffle(COLOR_PALETTE, rng).slice(0, 2)
      })()
    : [DEFAULT_NEGATOR_COLOR]

  const canAssignDistinctRemovals = (cells: Array<{ x: number; y: number }>) => {
    const usedRemovals = new Set<string>()
    const dfs = (index: number): boolean => {
      if (index >= cells.length) return true
      const region = regions.get(`${cells[index].x},${cells[index].y}`)
      if (region === undefined) return false
      const candidates = Array.from(removableKeysByRegion.get(region) ?? [])
      for (const candidate of candidates) {
        if (usedRemovals.has(candidate)) continue
        usedRemovals.add(candidate)
        if (dfs(index + 1)) return true
        usedRemovals.delete(candidate)
      }
      return false
    }
    return dfs(0)
  }

  const pickNegatorCells = () => {
    if (targetCount === 1) {
      for (const cell of prioritizedCells) {
        if (canAssignDistinctRemovals([cell])) return [cell]
      }
      return null
    }
    const differentRegionPairs: Array<Array<{ x: number; y: number }>> = []
    const sameRegionPairs: Array<Array<{ x: number; y: number }>> = []
    for (let i = 0; i < prioritizedCells.length; i += 1) {
      for (let j = i + 1; j < prioritizedCells.length; j += 1) {
        const first = prioritizedCells[i]
        const second = prioritizedCells[j]
        const firstRegion = regions.get(`${first.x},${first.y}`)
        const secondRegion = regions.get(`${second.x},${second.y}`)
        if (firstRegion !== undefined && secondRegion !== undefined && firstRegion !== secondRegion) {
          differentRegionPairs.push([first, second])
        } else {
          sameRegionPairs.push([first, second])
        }
      }
    }
    const prioritizedPairs = [
      ...shuffle(differentRegionPairs, rng),
      ...shuffle(sameRegionPairs, rng),
    ]
    for (const pair of prioritizedPairs) {
      if (canAssignDistinctRemovals(pair)) return pair
    }
    return null
  }

  const chosenCells = pickNegatorCells()
  if (!chosenCells) return null

  const negators: NegatorTarget[] = []
  for (const cell of chosenCells) {
    usedCells.add(`${cell.x},${cell.y}`)
    negators.push({
      cellX: cell.x,
      cellY: cell.y,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_NEGATOR_COLOR,
    })
  }

  return { negators, solutionPath }
}
