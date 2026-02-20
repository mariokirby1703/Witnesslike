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

export type GhostTarget = {
  cellX: number
  cellY: number
  color: string
}

const DEFAULT_GHOST_COLOR = '#d7d4da'

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    if (!edges.has(edgeKey(a, b))) return false
  }
  return true
}

function buildRegionCells(
  regions: Map<string, number>,
  blockedCells: Set<string>
) {
  const byRegion = new Map<number, Array<{ x: number; y: number }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (blockedCells.has(`${x},${y}`)) continue
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!byRegion.has(region)) byRegion.set(region, [])
      byRegion.get(region)?.push({ x, y })
    }
  }
  return byRegion
}

function pickGhostPath(
  edges: Set<string>,
  seed: number,
  blockedCells: Set<string>,
  selectedSymbolCount: number,
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const tryPath = (candidate: Point[] | null) => {
    if (!candidate || candidate.length < 2) return null
    const regions = buildCellRegions(edgesFromPath(candidate))
    const regionCount = new Set(regions.values()).size
    if (regionCount < 2 || regionCount > 5) return null
    const regionCells = buildRegionCells(regions, blockedCells)
    if (regionCells.size !== regionCount) return null
    if (Array.from(regionCells.values()).some((cells) => cells.length === 0)) return null
    return { path: candidate, regions, regionCount }
  }

  const byRegionCount = new Map<number, Array<NonNullable<ReturnType<typeof tryPath>>>>()
  const addCandidate = (candidate: ReturnType<typeof tryPath>) => {
    if (!candidate) return
    if (!byRegionCount.has(candidate.regionCount)) byRegionCount.set(candidate.regionCount, [])
    const bucket = byRegionCount.get(candidate.regionCount)
    if (!bucket) return
    if (bucket.length < 3) bucket.push(candidate)
  }

  const preferredCandidate =
    preferredPath && isPathCompatible(preferredPath, edges)
      ? tryPath(preferredPath)
      : null
  if (preferredCandidate && preferredCandidate.regionCount <= 3) {
    return preferredCandidate
  }
  addCandidate(preferredCandidate)

  // Fast sampling first: random paths are cheap and often enough.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const localRng = mulberry32(seed + 113 + attempt * 97)
    addCandidate(tryPath(findRandomPath(edges, localRng)))
  }

  // Limited loopy sampling for region-count diversity without heavy runtime.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const localRng = mulberry32(seed + 1709 + attempt * 131)
    const minLength = 8 + randInt(localRng, 3)
    const loopyAttempts = 12 + randInt(localRng, 8)
    addCandidate(
      tryPath(findBestLoopyPathByRegions(edges, localRng, loopyAttempts, minLength))
    )
  }

  // If we still have no low-count option, try a few extra random samples.
  if (!byRegionCount.has(2) && !byRegionCount.has(3)) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const localRng = mulberry32(seed + 8011 + attempt * 149)
      addCandidate(tryPath(findRandomPath(edges, localRng)))
      if (byRegionCount.has(2) || byRegionCount.has(3)) break
    }
  }

  if (byRegionCount.size === 0) {
    return tryPath(findRandomPath(edges, rng))
  }

  const counts = shuffle(
    Array.from(byRegionCount.keys()).filter((count) => count >= 2 && count <= 5),
    rng
  )
  if (counts.length === 0) return null
  const multiSymbolSelection = selectedSymbolCount >= 2
  const preferredCounts = multiSymbolSelection
    ? counts.filter((count) => count === 2 || count === 3)
    : counts
  const shouldPreferLowCounts =
    multiSymbolSelection &&
    preferredCounts.length > 0 &&
    rng() < 0.9
  const weightedPool = shouldPreferLowCounts ? preferredCounts : counts
  const weightForCount = (count: number) => {
    if (multiSymbolSelection) {
      if (count === 2) return 3
      if (count === 3) return 2.4
      if (count === 4) return 0.42
      return 0.12
    }
    if (count === 2) return 2.2
    if (count === 3) return 1.8
    if (count === 4) return 0.6
    return 0.2
  }
  const weighted = weightedPool.map((count) => ({
    count,
    weight: weightForCount(count),
  }))
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = rng() * totalWeight
  let chosenCount = weighted[weighted.length - 1]?.count ?? weightedPool[0]
  for (const entry of weighted) {
    roll -= entry.weight
    if (roll <= 0) {
      chosenCount = entry.count
      break
    }
  }
  const chosenBucket = byRegionCount.get(chosenCount)
  if (!chosenBucket || chosenBucket.length === 0) return null
  return chosenBucket[randInt(rng, chosenBucket.length)] ?? chosenBucket[0]
}

export function generateGhostsForEdges(
  edges: Set<string>,
  seed: number,
  blockedCells: Set<string>,
  starsActive: boolean,
  selectedSymbolCount = 1,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const picked = pickGhostPath(
    edges,
    seed + 19,
    blockedCells,
    selectedSymbolCount,
    preferredPath
  )
  if (!picked) return null

  const regionCells = buildRegionCells(picked.regions, blockedCells)
  if (regionCells.size !== picked.regionCount) return null
  if (picked.regionCount < 2 || picked.regionCount > 5) return null
  if (Array.from(regionCells.values()).some((cells) => cells.length === 0)) return null

  let palette = [DEFAULT_GHOST_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 1)
    }
    if (palette.length === 0) palette = [DEFAULT_GHOST_COLOR]
  }

  const targets: GhostTarget[] = []
  const regionIds = shuffle(Array.from(regionCells.keys()), rng)
  for (const regionId of regionIds) {
    const cells = regionCells.get(regionId)
    if (!cells || cells.length === 0) return null
    const cell = cells[randInt(rng, cells.length)] ?? cells[0]
    targets.push({
      cellX: cell.x,
      cellY: cell.y,
      color: palette[randInt(rng, palette.length)] ?? DEFAULT_GHOST_COLOR,
    })
  }

  if (targets.length < 2 || targets.length > 5) return null

  return {
    targets,
    solutionPath: picked.path,
  }
}

export function collectFailingGhostIndexes(
  usedEdges: Set<string>,
  ghostTargets: GhostTarget[]
) {
  const failing = new Set<number>()
  if (ghostTargets.length === 0) return failing

  const regions = buildCellRegions(usedEdges)
  const regionCount = new Set(regions.values()).size
  const ghostsByRegion = new Map<number, number[]>()
  ghostTargets.forEach((target, index) => {
    const region = regions.get(`${target.cellX},${target.cellY}`)
    if (region === undefined) {
      failing.add(index)
      return
    }
    if (!ghostsByRegion.has(region)) ghostsByRegion.set(region, [])
    ghostsByRegion.get(region)?.push(index)
  })

  for (const indexes of ghostsByRegion.values()) {
    if (indexes.length <= 1) continue
    for (const index of indexes) failing.add(index)
  }

  if (regionCount !== ghostTargets.length || ghostsByRegion.size !== ghostTargets.length) {
    ghostTargets.forEach((_, index) => failing.add(index))
  }

  return failing
}

export function checkGhosts(usedEdges: Set<string>, ghostTargets: GhostTarget[]) {
  if (ghostTargets.length === 0) return false
  return collectFailingGhostIndexes(usedEdges, ghostTargets).size === 0
}
