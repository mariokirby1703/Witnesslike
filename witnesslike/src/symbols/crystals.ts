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

export type CrystalTarget = {
  cellX: number
  cellY: number
  color: string
}

const DEFAULT_CRYSTAL_COLOR = '#c9153b'

type Cell = { x: number; y: number }

type CrystalPathCandidate = {
  path: Point[]
  fullCellsByRegion: Map<number, Cell[]>
  freeCellsByRegion: Map<number, Cell[]>
  shapeGroups: Map<string, number[]>
  maxShapeGroupSize: number
  bestShapeScore: number
}

function isGhostCompatibleCandidate(candidate: CrystalPathCandidate) {
  const regionCount = candidate.fullCellsByRegion.size
  if (regionCount < 2 || regionCount > 5) return false
  for (const regionId of candidate.fullCellsByRegion.keys()) {
    if ((candidate.freeCellsByRegion.get(regionId)?.length ?? 0) <= 0) return false
  }
  return true
}

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function normalizeCells(cells: Cell[]) {
  const minX = Math.min(...cells.map((cell) => cell.x))
  const minY = Math.min(...cells.map((cell) => cell.y))
  return cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
}

function cellsKey(cells: Cell[]) {
  return [...cells]
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map((cell) => `${cell.x},${cell.y}`)
    .join('|')
}

function canonicalRegionShapeKey(cells: Cell[]) {
  const transforms: Array<(cell: Cell) => Cell> = [
    (cell) => ({ x: cell.x, y: cell.y }),
    (cell) => ({ x: -cell.x, y: cell.y }),
    (cell) => ({ x: cell.x, y: -cell.y }),
    (cell) => ({ x: -cell.x, y: -cell.y }),
    (cell) => ({ x: cell.y, y: cell.x }),
    (cell) => ({ x: -cell.y, y: cell.x }),
    (cell) => ({ x: cell.y, y: -cell.x }),
    (cell) => ({ x: -cell.y, y: -cell.x }),
  ]

  let best = ''
  for (const transform of transforms) {
    const normalized = normalizeCells(cells.map((cell) => transform(cell)))
    const key = cellsKey(normalized)
    if (!best || key < best) best = key
  }
  return best
}

function totalRegionCount(regions: Map<string, number>) {
  return new Set<number>(regions.values()).size
}

function isSingleCrystalValid(regions: Map<string, number>, crystal: CrystalTarget) {
  const crystalRegion = regions.get(`${crystal.cellX},${crystal.cellY}`)
  if (crystalRegion === undefined) return false
  return totalRegionCount(regions) === 1
}

function buildRegionCells(
  regions: Map<string, number>,
  blockedCells: Set<string>
) {
  const fullCellsByRegion = new Map<number, Cell[]>()
  const freeCellsByRegion = new Map<number, Cell[]>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!fullCellsByRegion.has(region)) fullCellsByRegion.set(region, [])
      fullCellsByRegion.get(region)?.push({ x, y })
      if (blockedCells.has(`${x},${y}`)) continue
      if (!freeCellsByRegion.has(region)) freeCellsByRegion.set(region, [])
      freeCellsByRegion.get(region)?.push({ x, y })
    }
  }
  return { fullCellsByRegion, freeCellsByRegion }
}

function isBoardEdgeCell(cell: Cell) {
  return cell.x === 0 || cell.x === 3 || cell.y === 0 || cell.y === 3
}

function countInteriorCells(cells: Cell[]) {
  return cells.reduce((count, cell) => count + (isBoardEdgeCell(cell) ? 0 : 1), 0)
}

function averageRegionArea(
  regionIds: number[],
  fullCellsByRegion: Map<number, Cell[]>
) {
  if (regionIds.length === 0) return 0
  const totalArea = regionIds.reduce(
    (sum, regionId) => sum + (fullCellsByRegion.get(regionId)?.length ?? 0),
    0
  )
  return totalArea / regionIds.length
}

function shapeGroupScore(
  regionIds: number[],
  fullCellsByRegion: Map<number, Cell[]>,
  freeCellsByRegion: Map<number, Cell[]>
) {
  const avgArea = averageRegionArea(regionIds, fullCellsByRegion)
  let totalFree = 0
  let totalInteriorFree = 0
  let edgeOnlyRegions = 0

  for (const regionId of regionIds) {
    const freeCells = freeCellsByRegion.get(regionId) ?? []
    totalFree += freeCells.length
    const interiorFree = countInteriorCells(freeCells)
    totalInteriorFree += interiorFree
    if (freeCells.length > 0 && interiorFree === 0) edgeOnlyRegions += 1
  }

  const interiorShare = totalFree > 0 ? totalInteriorFree / totalFree : 0
  const singletonPenalty = avgArea <= 1 ? 8 : 0
  return (
    regionIds.length * 10 +
    avgArea * 3 +
    interiorShare * 4 -
    edgeOnlyRegions * 1.7 -
    singletonPenalty
  )
}

function pickWeightedCrystalCell(cells: Cell[], rng: () => number) {
  if (cells.length === 1) return cells[0]

  const weights = cells.map((cell) => {
    const xEdge = cell.x === 0 || cell.x === 3
    const yEdge = cell.y === 0 || cell.y === 3
    const onCorner = xEdge && yEdge
    if (onCorner) return 0.45
    if (xEdge || yEdge) return 0.9
    return 4.5
  })

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) return cells[randInt(rng, cells.length)] ?? cells[0]

  let roll = rng() * totalWeight
  for (let index = 0; index < cells.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return cells[index]
  }
  return cells[cells.length - 1] ?? cells[0]
}

function buildCandidate(
  path: Point[],
  blockedCells: Set<string>
): CrystalPathCandidate | null {
  if (!path || path.length < 2) return null
  const regions = buildCellRegions(edgesFromPath(path))

  const { fullCellsByRegion, freeCellsByRegion } = buildRegionCells(regions, blockedCells)
  if (fullCellsByRegion.size === 0) return null

  const shapeGroups = new Map<string, number[]>()
  for (const [regionId, cells] of fullCellsByRegion.entries()) {
    const freeCells = freeCellsByRegion.get(regionId) ?? []
    if (freeCells.length === 0) continue
    const shapeKey = canonicalRegionShapeKey(cells)
    if (!shapeGroups.has(shapeKey)) shapeGroups.set(shapeKey, [])
    shapeGroups.get(shapeKey)?.push(regionId)
  }

  const shapeCandidates = Array.from(shapeGroups.values()).filter((regions) => regions.length >= 2)
  const maxShapeGroupSize = shapeCandidates.reduce(
    (maxSize, ids) => Math.max(maxSize, ids.length),
    0
  )
  if (maxShapeGroupSize < 2) return null
  const bestShapeScore = shapeCandidates.reduce(
    (bestScore, regions) =>
      Math.max(bestScore, shapeGroupScore(regions, fullCellsByRegion, freeCellsByRegion)),
    Number.NEGATIVE_INFINITY
  )

  return {
    path,
    fullCellsByRegion,
    freeCellsByRegion,
    shapeGroups,
    maxShapeGroupSize,
    bestShapeScore,
  }
}

export function generateCrystalsForEdges(
  edges: Set<string>,
  seed: number,
  blockedCells: Set<string>,
  starsActive: boolean,
  selectedSymbolCount: number,
  preferredColors?: string[],
  preferredPath?: Point[],
  negatorActive = false,
  reserveNegatorCellForGhost = false
) {
  const rng = mulberry32(seed)
  const needsNegatorSafeCount = negatorActive && selectedSymbolCount <= 3

  const candidateMatchesContext = (
    candidate: CrystalPathCandidate | null
  ): candidate is CrystalPathCandidate => {
    if (!candidate) return false
    if (reserveNegatorCellForGhost && !isGhostCompatibleCandidate(candidate)) return false
    return true
  }

  let picked: CrystalPathCandidate | null = null
  if (preferredPath) {
    if (isPathCompatible(preferredPath, edges)) {
      const preferredCandidate = buildCandidate(preferredPath, blockedCells)
      if (candidateMatchesContext(preferredCandidate)) {
        picked = preferredCandidate
      } else if (!reserveNegatorCellForGhost) {
        return null
      }
    } else if (!reserveNegatorCellForGhost) {
      return null
    }
  }
  if (!picked) {
    const maxCandidateAttempts = reserveNegatorCellForGhost
      ? 28
      : needsNegatorSafeCount
        ? 88
        : negatorActive
          ? 40
          : 24
    const loopyPathAttempts = reserveNegatorCellForGhost ? 26 : 56
    const loopyPathMinLength = reserveNegatorCellForGhost ? 8 : 9
    for (let attempt = 0; attempt < maxCandidateAttempts; attempt += 1) {
      const localRng = mulberry32(seed + 9011 + attempt * 127)
      const candidatePath =
        findBestLoopyPathByRegions(edges, localRng, loopyPathAttempts, loopyPathMinLength) ??
        findRandomPath(edges, localRng)
      const candidate = candidatePath ? buildCandidate(candidatePath, blockedCells) : null
      if (!candidateMatchesContext(candidate)) continue
      if (
        !picked ||
        candidate.bestShapeScore > picked.bestShapeScore + 0.01 ||
        (
          Math.abs(candidate.bestShapeScore - picked.bestShapeScore) <= 0.01 &&
          candidate.maxShapeGroupSize > picked.maxShapeGroupSize
        )
      ) {
        picked = candidate
      }
    }
    if (!picked) return null
  }

  let palette = [DEFAULT_CRYSTAL_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_CRYSTAL_COLOR]
  }

  const shapeEntries = Array.from(picked.shapeGroups.entries()).filter(
    ([, regions]) => regions.length >= 2
  )
  if (shapeEntries.length === 0) return null
  const nonSingletonShapeEntries = shapeEntries.filter(
    ([, regions]) => averageRegionArea(regions, picked.fullCellsByRegion) >= 2
  )
  const shapeEntryPool =
    nonSingletonShapeEntries.length > 0 &&
    (shapeEntries.length === nonSingletonShapeEntries.length || rng() < 0.9)
      ? nonSingletonShapeEntries
      : shapeEntries
  const rankedShapeEntries = shuffle(shapeEntryPool, rng).sort((a, b) => {
    const scoreDiff =
      shapeGroupScore(b[1], picked.fullCellsByRegion, picked.freeCellsByRegion) -
      shapeGroupScore(a[1], picked.fullCellsByRegion, picked.freeCellsByRegion)
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff
    return b[1].length - a[1].length
  })
  if (rankedShapeEntries.length === 0) return null

  const rankByInterior = (regionIds: number[]) =>
    [...shuffle(regionIds, rng)].sort((a, b) => {
      const aFree = picked.freeCellsByRegion.get(a) ?? []
      const bFree = picked.freeCellsByRegion.get(b) ?? []
      const interiorDiff = countInteriorCells(bFree) - countInteriorCells(aFree)
      if (interiorDiff !== 0) return interiorDiff
      return bFree.length - aFree.length
    })

  let selectedRegions: number[] = []

  if (needsNegatorSafeCount) {
    for (const [mainShapeKey, mainRegions] of rankedShapeEntries) {
      const mainRegionPool = reserveNegatorCellForGhost
        ? mainRegions.filter((regionId) => (picked.freeCellsByRegion.get(regionId)?.length ?? 0) >= 2)
        : mainRegions
      const outlierRegions = shapeEntries
        .filter(([shapeKey]) => shapeKey !== mainShapeKey)
        .flatMap(([, regions]) => regions)
        .filter(
          (regionId) =>
            (picked.freeCellsByRegion.get(regionId)?.length ?? 0) >=
            (reserveNegatorCellForGhost ? 3 : 2)
        )
      if (outlierRegions.length === 0) continue

      const maxCrystalCount = Math.min(mainRegionPool.length + 1, 4)
      if (maxCrystalCount < 3) continue
      const targetCrystalCount = maxCrystalCount >= 4 && rng() < 0.58 ? 4 : 3
      const mainPickCount = targetCrystalCount - 1
      if (mainRegionPool.length < mainPickCount) continue

      const rankedMainRegions = rankByInterior(mainRegionPool)
      const mainRegionPickPool = rng() < 0.9 ? rankedMainRegions : shuffle(mainRegionPool, rng)
      const mainSelected = mainRegionPickPool.slice(0, mainPickCount)
      if (mainSelected.length < mainPickCount) continue

      const rankedOutlierRegions = rankByInterior(outlierRegions)
      const outlierRegionPickPool = rng() < 0.9 ? rankedOutlierRegions : shuffle(outlierRegions, rng)
      const outlierRegion = outlierRegionPickPool[0]
      if (outlierRegion === undefined) continue

      selectedRegions = [...mainSelected, outlierRegion]
      break
    }
    if (selectedRegions.length < 3) return null
  } else {
    const chosenShapeRegions = rankedShapeEntries[0]?.[1]
    if (!chosenShapeRegions) return null
    const lowSymbolSet = selectedSymbolCount <= 2
    const maxCrystalCount = Math.min(chosenShapeRegions.length, negatorActive ? 4 : lowSymbolSet ? 3 : 2)
    if (maxCrystalCount < 2) return null
    let targetCrystalCount = 2
    if (negatorActive) {
      if (maxCrystalCount >= 4) {
        targetCrystalCount = rng() < 0.58 ? 4 : 3
      } else if (maxCrystalCount === 3) {
        targetCrystalCount = 3
      }
    } else {
      targetCrystalCount =
        maxCrystalCount === 2 ? 2 : lowSymbolSet && rng() < 0.46 ? 3 : 2
    }
    const rankedRegions = rankByInterior(chosenShapeRegions)
    const regionPickPool = rng() < 0.86 ? rankedRegions : shuffle(chosenShapeRegions, rng)
    selectedRegions = regionPickPool.slice(0, targetCrystalCount)
  }
  const colorPool =
    starsActive && palette.length > 1 && selectedRegions.length >= 2
      ? shuffle([...palette], rng).slice(0, Math.min(palette.length, selectedRegions.length >= 3 ? 3 : 2))
      : palette
  const colorUsage = new Map<string, number>()
  const pickCrystalColor = () => {
    if (!starsActive || colorPool.length <= 1) {
      const color = colorPool[randInt(rng, colorPool.length)] ?? DEFAULT_CRYSTAL_COLOR
      colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
      return color
    }
    const ranked = shuffle([...colorPool], rng).sort((a, b) => {
      const usageDiff = (colorUsage.get(a) ?? 0) - (colorUsage.get(b) ?? 0)
      if (usageDiff !== 0) return usageDiff
      return rng() < 0.5 ? -1 : 1
    })
    const color = ranked[0] ?? colorPool[0] ?? DEFAULT_CRYSTAL_COLOR
    colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
    return color
  }

  const targets: CrystalTarget[] = []
  for (const regionId of selectedRegions) {
    const cells = picked.freeCellsByRegion.get(regionId)
    if (!cells || cells.length === 0) return null
    const cell = pickWeightedCrystalCell(cells, rng)
    targets.push({
      cellX: cell.x,
      cellY: cell.y,
      color: pickCrystalColor(),
    })
  }
  if (starsActive && colorPool.length > 1 && targets.length >= 2) {
    const usedColors = new Set(targets.map((target) => target.color))
    if (usedColors.size === 1) {
      const firstColor = targets[0]?.color
      const fallbackColor = colorPool.find((color) => color !== firstColor)
      const lastTarget = targets[targets.length - 1]
      if (lastTarget && fallbackColor) {
        lastTarget.color = fallbackColor
      }
    }
  }

  const usedEdges = edgesFromPath(picked.path)
  if (needsNegatorSafeCount) {
    if (collectFailingCrystalIndexes(usedEdges, targets).size === 0) return null
  } else if (!checkCrystals(usedEdges, targets)) {
    return null
  }
  return { targets, solutionPath: picked.path }
}

export function collectFailingCrystalIndexes(
  usedEdges: Set<string>,
  crystalTargets: CrystalTarget[]
) {
  const failing = new Set<number>()
  if (crystalTargets.length === 0) return failing
  const regions = buildCellRegions(usedEdges)
  if (crystalTargets.length === 1) {
    if (!isSingleCrystalValid(regions, crystalTargets[0])) failing.add(0)
    return failing
  }

  const crystalsByRegion = new Map<number, number[]>()
  crystalTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    if (!crystalsByRegion.has(region)) crystalsByRegion.set(region, [])
    crystalsByRegion.get(region)?.push(index)
  })

  for (const indexes of crystalsByRegion.values()) {
    if (indexes.length <= 1) continue
    for (const index of indexes) {
      failing.add(index)
    }
  }

  const regionCells = new Map<number, Cell[]>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }

  const crystalIndexesByShape = new Map<string, number[]>()
  for (const [regionId, indexes] of crystalsByRegion.entries()) {
    if (indexes.length > 1) continue
    const cells = regionCells.get(regionId)
    if (!cells || cells.length === 0) {
      for (const index of indexes) {
        failing.add(index)
      }
      continue
    }
    const shapeKey = canonicalRegionShapeKey(cells)
    if (!crystalIndexesByShape.has(shapeKey)) crystalIndexesByShape.set(shapeKey, [])
    crystalIndexesByShape.get(shapeKey)?.push(...indexes)
  }

  if (crystalIndexesByShape.size > 1) {
    const dominantShape = Array.from(crystalIndexesByShape.entries())
      .sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length
        return a[0].localeCompare(b[0])
      })[0]?.[0]

    for (const [shape, indexes] of crystalIndexesByShape.entries()) {
      if (shape === dominantShape) continue
      for (const index of indexes) {
        failing.add(index)
      }
    }
  }

  return failing
}

export function checkCrystals(usedEdges: Set<string>, crystalTargets: CrystalTarget[]) {
  if (crystalTargets.length === 0) return false
  if (crystalTargets.length === 1) {
    const regions = buildCellRegions(usedEdges)
    return isSingleCrystalValid(regions, crystalTargets[0])
  }
  return collectFailingCrystalIndexes(usedEdges, crystalTargets).size === 0
}
