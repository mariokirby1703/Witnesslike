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

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type DiceTarget = {
  cellX: number
  cellY: number
  value: DiceValue
  color: string
}

const DEFAULT_DICE_COLOR = '#3f7fff'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function buildRegionAreas(regions: Map<string, number>) {
  const areas = new Map<number, number>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      areas.set(region, (areas.get(region) ?? 0) + 1)
    }
  }
  return areas
}

function buildRegionCells(
  regions: Map<string, number>,
  blockedCells: Set<string>
) {
  const regionCells = new Map<number, Array<{ x: number; y: number }>>()
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

function countLowDice(values: number[]) {
  return values.filter((value) => value <= 2).length
}

function minimumLowDiceCount(total: number, count: number) {
  const deficitFromAllThrees = Math.max(0, count * 3 - total)
  return Math.ceil(deficitFromAllThrees / 2)
}

function buildRandomDiceValues(total: number, count: number, rng: () => number) {
  const values = Array.from({ length: count }, () => 1)
  let remaining = total - count
  while (remaining > 0) {
    const candidates: number[] = []
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] < 9) candidates.push(index)
    }
    if (candidates.length === 0) return null
    const pick = candidates[randInt(rng, candidates.length)] ?? candidates[0]
    values[pick] += 1
    remaining -= 1
  }
  return values
}

function randomDiceValues(total: number, count: number, rng: () => number): DiceValue[] | null {
  if (count < 1) return null
  if (total < count || total > count * 9) return null

  const attempts = 6
  const minimumLowCount = minimumLowDiceCount(total, count)
  const targetLowCap = Math.min(count, minimumLowCount + (count >= 4 ? 2 : 1))

  let bestValues: number[] | null = null
  let bestLowCount = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const values = buildRandomDiceValues(total, count, rng)
    if (!values) return null

    const lowCount = countLowDice(values)
    if (lowCount < bestLowCount) {
      bestValues = [...values]
      bestLowCount = lowCount
    }

    if (lowCount <= targetLowCap) {
      return shuffle(values, rng).map((value) => value as DiceValue)
    }
  }

  if (!bestValues) return null
  return shuffle(bestValues, rng).map((value) => value as DiceValue)
}

function chooseRegionDiceCounts(
  regions: Array<{ region: number; minCount: number; maxCount: number }>,
  targetCount: number,
  rng: () => number
) {
  const shuffled = shuffle(regions, rng)
  const suffixMax = new Array<number>(shuffled.length + 1).fill(0)
  for (let index = shuffled.length - 1; index >= 0; index -= 1) {
    suffixMax[index] = suffixMax[index + 1] + shuffled[index].maxCount
  }

  const chosen = new Map<number, number>()

  const dfs = (index: number, remaining: number): boolean => {
    if (remaining === 0) return true
    if (index >= shuffled.length) return false
    if (remaining > suffixMax[index]) return false

    const current = shuffled[index]
    const options = [0, ...shuffle(
      Array.from(
        { length: current.maxCount - current.minCount + 1 },
        (_, offset) => current.minCount + offset
      ),
      rng
    )]

    for (const count of options) {
      if (count > remaining) continue
      if (count > 0) {
        chosen.set(current.region, count)
      } else {
        chosen.delete(current.region)
      }
      if (dfs(index + 1, remaining - count)) return true
      chosen.delete(current.region)
    }
    return false
  }

  if (!dfs(0, targetCount)) return null
  return chosen
}

export function collectFailingDiceIndexes(
  usedEdges: Set<string>,
  diceTargets: DiceTarget[]
) {
  const failing = new Set<number>()
  if (diceTargets.length === 0) return failing

  const regions = buildCellRegions(usedEdges)
  const areaByRegion = buildRegionAreas(regions)
  const sumByRegion = new Map<number, number>()
  const indexesByRegion = new Map<number, number[]>()

  diceTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    sumByRegion.set(region, (sumByRegion.get(region) ?? 0) + target.value)
    if (!indexesByRegion.has(region)) indexesByRegion.set(region, [])
    indexesByRegion.get(region)?.push(index)
  })

  for (const [region, indexes] of indexesByRegion.entries()) {
    const area = areaByRegion.get(region)
    if (area === undefined || (sumByRegion.get(region) ?? 0) !== area) {
      for (const index of indexes) failing.add(index)
    }
  }

  return failing
}

export function checkDice(
  usedEdges: Set<string>,
  diceTargets: DiceTarget[]
) {
  return collectFailingDiceIndexes(usedEdges, diceTargets).size === 0
}

export function generateDiceForEdges(
  edges: Set<string>,
  seed: number,
  selectedSymbolCount: number,
  blockedCells: Set<string>,
  starsActive: boolean,
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
  const regionAreas = buildRegionAreas(regions)
  const regionCells = buildRegionCells(regions, blockedCells)
  if (regionCells.size === 0) return null

  const regionOptions = Array.from(regionCells.entries())
    .map(([region, cells]) => {
      const area = regionAreas.get(region)
      if (area === undefined) return null
      const minCount = Math.max(1, Math.ceil(area / 9))
      const maxCount = Math.min(cells.length, area)
      if (maxCount < minCount) return null
      return { region, area, cells, minCount, maxCount }
    })
    .filter((entry): entry is { region: number; area: number; cells: Array<{ x: number; y: number }>; minCount: number; maxCount: number } => entry !== null)
  if (regionOptions.length === 0) return null

  const totalAvailableCells = regionOptions.reduce((sum, option) => sum + option.cells.length, 0)
  const lowSymbolSet = selectedSymbolCount <= 2
  const minCount = lowSymbolSet ? 3 : 1
  const maxCount = lowSymbolSet ? 8 : 5
  const maxAllowed = Math.min(maxCount, totalAvailableCells)
  if (maxAllowed < minCount) return null
  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)

  let palette = [DEFAULT_DICE_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_DICE_COLOR]
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const localRng = mulberry32(seed + 7171 + attempt * 131)
    const chosenCounts = chooseRegionDiceCounts(
      regionOptions.map((option) => ({
        region: option.region,
        minCount: option.minCount,
        maxCount: option.maxCount,
      })),
      targetCount,
      localRng
    )
    if (!chosenCounts) continue

    const diceTargets: DiceTarget[] = []
    let failed = false
    for (const [region, count] of chosenCounts.entries()) {
      const option = regionOptions.find((entry) => entry.region === region)
      if (!option) {
        failed = true
        break
      }
      const chosenCells = shuffle([...option.cells], localRng).slice(0, count)
      if (chosenCells.length < count) {
        failed = true
        break
      }
      const values = randomDiceValues(option.area, count, localRng)
      if (!values || values.length < count) {
        failed = true
        break
      }
      for (let index = 0; index < count; index += 1) {
        const cell = chosenCells[index]
        const value = values[index]
        if (!cell || !value) {
          failed = true
          break
        }
        diceTargets.push({
          cellX: cell.x,
          cellY: cell.y,
          value,
          color: palette[randInt(localRng, palette.length)] ?? DEFAULT_DICE_COLOR,
        })
      }
      if (failed) break
    }
    if (failed || diceTargets.length !== targetCount) continue
    if (checkDice(usedEdges, diceTargets)) {
      return { targets: diceTargets, solutionPath }
    }
  }

  return null
}
