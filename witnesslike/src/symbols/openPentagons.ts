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
import type { PolyominoSymbol } from './polyomino'
import type { SentinelTarget } from './sentinel'
import type { SpinnerTarget } from './spinner'
import type { StarTarget } from './stars'
import type { TriangleTarget } from './triangles'
import type { WaterDropletTarget } from './waterDroplet'
import type { BlackHoleTarget } from './blackHoles'
import type { TallyMarkTarget } from './tallyMarks'
import { resolveEyeEffects, type EyeTarget } from './eyes'
import type { CompassTarget } from './compass'

export type OpenPentagonTarget = {
  cellX: number
  cellY: number
  color: string
}

type ColoredCell = {
  cellX: number
  cellY: number
  color: string
}

export type OpenPentagonSupportSymbols = {
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
  polyominoSymbols: PolyominoSymbol[]
  negatorTargets: NegatorTarget[]
  tallyTargets?: TallyMarkTarget[]
  eyeTargets?: EyeTarget[]
  compassTargets?: CompassTarget[]
  openPentagonTargets?: OpenPentagonTarget[]
}

export type OpenPentagonConstraintSymbols = OpenPentagonSupportSymbols & {
  openPentagonTargets: OpenPentagonTarget[]
}

const DEFAULT_OPEN_PENTAGON_COLOR = '#d88a14'
const MAX_COLOR_RULE_COLORS = 3

function cellKey(cellX: number, cellY: number) {
  return `${cellX},${cellY}`
}

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function collectColoredCells(
  symbols: OpenPentagonSupportSymbols,
  openPentagonTargets: OpenPentagonTarget[]
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
  colored.push(...symbols.polyominoSymbols)
  colored.push(...symbols.negatorTargets)
  colored.push(...(symbols.tallyTargets ?? []))
  colored.push(...(symbols.eyeTargets ?? []))
  colored.push(...(symbols.compassTargets ?? []))
  colored.push(...openPentagonTargets)
  return colored
}

function crossesLine(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  usedEdges: Set<string>
) {
  if (toX === fromX + 1 && toY === fromY) {
    return usedEdges.has(edgeKey({ x: fromX + 1, y: fromY }, { x: fromX + 1, y: fromY + 1 }))
  }
  if (toX === fromX - 1 && toY === fromY) {
    return usedEdges.has(edgeKey({ x: fromX, y: fromY }, { x: fromX, y: fromY + 1 }))
  }
  if (toX === fromX && toY === fromY + 1) {
    return usedEdges.has(edgeKey({ x: fromX, y: fromY + 1 }, { x: fromX + 1, y: fromY + 1 }))
  }
  if (toX === fromX && toY === fromY - 1) {
    return usedEdges.has(edgeKey({ x: fromX, y: fromY }, { x: fromX + 1, y: fromY }))
  }
  return true
}

function buildPassableAdjacency(
  usedEdges: Set<string>,
  blockedCells: Set<string>
) {
  const neighborsMap = new Map<string, string[]>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const key = cellKey(x, y)
      if (blockedCells.has(key)) continue
      const neighbors: string[] = []
      const deltas = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]
      for (const delta of deltas) {
        const nx = x + delta.x
        const ny = y + delta.y
        if (nx < 0 || nx > 3 || ny < 0 || ny > 3) continue
        const nextKey = cellKey(nx, ny)
        if (blockedCells.has(nextKey)) continue
        if (crossesLine(x, y, nx, ny, usedEdges)) continue
        neighbors.push(nextKey)
      }
      neighborsMap.set(key, neighbors)
    }
  }
  return neighborsMap
}

function countSimplePathsUpToTwo(
  startKey: string,
  endKey: string,
  neighborsMap: Map<string, string[]>
) {
  if (startKey === endKey) return 1
  let count = 0
  const visited = new Set<string>([startKey])

  const dfs = (current: string) => {
    if (count > 1) return
    const neighbors = neighborsMap.get(current) ?? []
    for (const next of neighbors) {
      if (visited.has(next)) continue
      if (next === endKey) {
        count += 1
        if (count > 1) return
        continue
      }
      visited.add(next)
      dfs(next)
      visited.delete(next)
      if (count > 1) return
    }
  }

  dfs(startKey)
  return count
}

function collectGroupIndexes(
  targets: OpenPentagonTarget[]
) {
  const byColor = new Map<string, number[]>()
  targets.forEach((target, index) => {
    if (!byColor.has(target.color)) byColor.set(target.color, [])
    byColor.get(target.color)?.push(index)
  })
  return byColor
}

export function collectFailingOpenPentagonIndexes(
  usedEdges: Set<string>,
  symbols: OpenPentagonConstraintSymbols
) {
  const failing = new Set<number>()
  if (symbols.openPentagonTargets.length === 0) return failing

  const groups = collectGroupIndexes(symbols.openPentagonTargets)
  const allColored = collectColoredCells(symbols, symbols.openPentagonTargets)
  for (const [color, indexes] of groups.entries()) {
    if (indexes.length < 2) {
      for (const index of indexes) failing.add(index)
      continue
    }

    const blockedCells = new Set<string>()
    for (const symbol of allColored) {
      if (symbol.color === color) continue
      blockedCells.add(cellKey(symbol.cellX, symbol.cellY))
    }
    const neighborsMap = buildPassableAdjacency(usedEdges, blockedCells)
    const terminalKeys = indexes.map((index) => {
      const target = symbols.openPentagonTargets[index]
      return cellKey(target.cellX, target.cellY)
    })
    if (terminalKeys.some((key) => blockedCells.has(key) || !neighborsMap.has(key))) {
      for (const index of indexes) failing.add(index)
      continue
    }

    const reachable = new Set<string>([terminalKeys[0]])
    const queue: string[] = [terminalKeys[0]]
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]
      const neighbors = neighborsMap.get(current) ?? []
      for (const next of neighbors) {
        if (reachable.has(next)) continue
        reachable.add(next)
        queue.push(next)
      }
    }
    if (terminalKeys.some((key) => !reachable.has(key))) {
      for (const index of indexes) failing.add(index)
      continue
    }

    let invalid = false
    for (let i = 0; i < terminalKeys.length && !invalid; i += 1) {
      for (let j = i + 1; j < terminalKeys.length; j += 1) {
        const pathCount = countSimplePathsUpToTwo(terminalKeys[i], terminalKeys[j], neighborsMap)
        if (pathCount !== 1) {
          invalid = true
          break
        }
      }
    }
    if (invalid) {
      for (const index of indexes) failing.add(index)
    }
  }

  return failing
}

export function checkOpenPentagons(
  usedEdges: Set<string>,
  symbols: OpenPentagonConstraintSymbols
) {
  if (symbols.openPentagonTargets.length === 0) return false
  return collectFailingOpenPentagonIndexes(usedEdges, symbols).size === 0
}

function pickWeightedCell(
  candidates: Array<{ x: number; y: number }>,
  usedCells: Set<string>,
  rng: () => number
) {
  const options = candidates.filter((cell) => !usedCells.has(cellKey(cell.x, cell.y)))
  if (options.length === 0) return null
  const weights = options.map((cell) => {
    const onEdge = cell.x === 0 || cell.x === 3 || cell.y === 0 || cell.y === 3
    return onEdge ? 0.85 : 1.35
  })
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = rng() * total
  for (let index = 0; index < options.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return options[index]
  }
  return options[options.length - 1] ?? null
}

function groupPatternsForCount(targetCount: number) {
  if (targetCount <= 1) return [] as number[][]
  if (targetCount === 2) return [[2]]
  if (targetCount === 3) return [[3]]
  if (targetCount === 4) return [[2, 2], [4]]
  if (targetCount === 5) return [[3, 2], [5]]
  if (targetCount === 6) return [[2, 2, 2], [3, 3], [4, 2], [6]]
  if (targetCount === 7) return [[3, 2, 2], [4, 3], [5, 2], [7]]
  return [[2, 2, 2, 2], [3, 3, 2], [4, 2, 2], [4, 4], [5, 3], [6, 2], [8]]
}

function countSupportSymbols(symbols: OpenPentagonSupportSymbols) {
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
    symbols.chipTargets.length +
    symbols.diceTargets.length +
    symbols.blackHoleTargets.length +
    symbols.polyominoSymbols.length +
    symbols.negatorTargets.length +
    (symbols.tallyTargets?.length ?? 0) +
    (symbols.eyeTargets?.length ?? 0) +
    (symbols.compassTargets?.length ?? 0)
  )
}

export function generateOpenPentagonsForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  colorRuleActive: boolean,
  symbols: OpenPentagonSupportSymbols,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const pentagonOnlyMode = selectedSymbolCount <= 1 && countSupportSymbols(symbols) === 0
  const solutionPath =
    preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)
      ? preferredPath
      : findBestLoopyPathByRegions(
          edges,
          rng,
          pentagonOnlyMode ? 320 : 170,
          pentagonOnlyMode ? 11 : 8
        ) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const usedEdges = edgesFromPath(solutionPath)
  const availableCells = shuffle(
    Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4) })).filter(
      (cell) => !blockedCells.has(cellKey(cell.x, cell.y))
    ),
    rng
  )
  if (availableCells.length < 2) return null

  let palette = [DEFAULT_OPEN_PENTAGON_COLOR]
  if (colorRuleActive) {
    const supportColors = Array.from(
      new Set(
        collectColoredCells(symbols, symbols.openPentagonTargets ?? []).map((target) => target.color)
      )
    )
    const preferred = Array.from(new Set(preferredColors ?? [])).slice(0, MAX_COLOR_RULE_COLORS)
    const base =
      preferred.length > 0
        ? preferred
        : supportColors.length > 0
          ? shuffle(supportColors, rng).slice(0, MAX_COLOR_RULE_COLORS)
          : []
    const fallback = shuffle(COLOR_PALETTE.filter((color) => !base.includes(color)), rng)
    palette = [...base, ...fallback].slice(0, MAX_COLOR_RULE_COLORS)
    if (palette.length === 0) palette = [DEFAULT_OPEN_PENTAGON_COLOR]
  }

  const maxCountByDifficulty = pentagonOnlyMode
    ? 7
    : selectedSymbolCount <= 2
      ? 4
      : selectedSymbolCount === 3
        ? 3
        : 2
  const maxAllowed = Math.min(maxCountByDifficulty, availableCells.length)
  const minTargetCount = pentagonOnlyMode ? 4 : 2
  const targetCounts = Array.from({ length: maxAllowed - minTargetCount + 1 }, (_, index) => maxAllowed - index)
    .filter((count) => count >= minTargetCount)

  for (const targetCount of targetCounts) {
    const patterns = groupPatternsForCount(targetCount)
    const attemptsPerCount = pentagonOnlyMode ? 220 : 120
    for (let attempt = 0; attempt < attemptsPerCount; attempt += 1) {
      const localRng = mulberry32(seed + 17_011 + targetCount * 239 + attempt * 173)
      for (const pattern of shuffle(patterns, localRng)) {
        const colors: string[] = []
        const colorUsage = new Map<string, number>()
        for (let groupIndex = 0; groupIndex < pattern.length; groupIndex += 1) {
          if (!colorRuleActive) {
            colors.push(palette[0] ?? DEFAULT_OPEN_PENTAGON_COLOR)
            continue
          }
          const ranked = shuffle([...palette], localRng).sort((a, b) => {
            const usageDiff = (colorUsage.get(a) ?? 0) - (colorUsage.get(b) ?? 0)
            if (usageDiff !== 0) return usageDiff
            return localRng() < 0.5 ? -1 : 1
          })
          const color = ranked[0] ?? palette[0] ?? DEFAULT_OPEN_PENTAGON_COLOR
          colors.push(color)
          colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
        }

        const usedCells = new Set<string>(blockedCells)
        const targets: OpenPentagonTarget[] = []
        let failed = false
        for (let groupIndex = 0; groupIndex < pattern.length; groupIndex += 1) {
          const groupSize = pattern[groupIndex]
          const groupColor = colors[groupIndex] ?? DEFAULT_OPEN_PENTAGON_COLOR
          for (let placed = 0; placed < groupSize; placed += 1) {
            const pickedCell = pickWeightedCell(availableCells, usedCells, localRng)
            if (!pickedCell) {
              failed = true
              break
            }
            usedCells.add(cellKey(pickedCell.x, pickedCell.y))
            targets.push({
              cellX: pickedCell.x,
              cellY: pickedCell.y,
              color: groupColor,
            })
          }
          if (failed) break
        }
        if (failed || targets.length !== targetCount) continue

        if (pentagonOnlyMode) {
          const groups = collectGroupIndexes(targets)
          const distinctColors = groups.size
          const largestGroup = Math.max(
            ...Array.from(groups.values()).map((groupIndexes) => groupIndexes.length)
          )
          if (distinctColors < 2) continue
          if (largestGroup < 3 && targets.length < 6) continue
        }

        const constraintSymbols: OpenPentagonConstraintSymbols = {
          ...symbols,
          openPentagonTargets: targets,
        }
        const effectiveUsedEdges =
          (symbols.eyeTargets?.length ?? 0) > 0
            ? resolveEyeEffects(usedEdges, symbols.eyeTargets ?? []).effectiveUsedEdges
            : usedEdges
        if (checkOpenPentagons(effectiveUsedEdges, constraintSymbols)) {
          return { targets, solutionPath }
        }
      }
    }
  }

  return null
}


