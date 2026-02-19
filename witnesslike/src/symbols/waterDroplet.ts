import { MAX_INDEX, type Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgesFromPath,
  edgeKey,
  findBestLoopyPathByRegions,
  findRandomPath,
  mulberry32,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type WaterDropletDirection = 'down' | 'left' | 'up' | 'right'

export type WaterDropletTarget = {
  cellX: number
  cellY: number
  direction: WaterDropletDirection
  color: string
}

const DIRECTIONS: WaterDropletDirection[] = ['down', 'left', 'up', 'right']
const MAX_CELL_INDEX = MAX_INDEX - 1
type BoundarySide = 'top' | 'bottom' | 'left' | 'right'
const DEFAULT_WATER_DROPLET_COLOR = '#22c4e5'

type WaterDropletPlacement = Pick<WaterDropletTarget, 'cellX' | 'cellY' | 'direction'>

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (!edges.has(edgeKey(path[index - 1], path[index]))) return false
  }
  return true
}

function flowOffsets(direction: WaterDropletDirection): Array<{ dx: number; dy: number }> {
  if (direction === 'down') {
    return [
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ]
  }
  if (direction === 'up') {
    return [
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ]
  }
  if (direction === 'left') {
    return [
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
    ]
  }
  return [
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ]
}

function boundaryEdgeKey(cellX: number, cellY: number, side: BoundarySide) {
  if (side === 'top') {
    return edgeKey({ x: cellX, y: cellY }, { x: cellX + 1, y: cellY })
  }
  if (side === 'bottom') {
    return edgeKey({ x: cellX, y: cellY + 1 }, { x: cellX + 1, y: cellY + 1 })
  }
  if (side === 'left') {
    return edgeKey({ x: cellX, y: cellY }, { x: cellX, y: cellY + 1 })
  }
  return edgeKey({ x: cellX + 1, y: cellY }, { x: cellX + 1, y: cellY + 1 })
}

function boundaryIsOpen(
  cellX: number,
  cellY: number,
  side: BoundarySide,
  usedEdges: Set<string>
) {
  return !usedEdges.has(boundaryEdgeKey(cellX, cellY, side))
}

function leaksAtBoundary(
  cellX: number,
  cellY: number,
  direction: WaterDropletDirection,
  usedEdges: Set<string>
) {
  if (direction === 'down') {
    return (
      (cellY === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'bottom', usedEdges)) ||
      (cellX === 0 && boundaryIsOpen(cellX, cellY, 'left', usedEdges)) ||
      (cellX === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'right', usedEdges))
    )
  }
  if (direction === 'up') {
    return (
      (cellY === 0 && boundaryIsOpen(cellX, cellY, 'top', usedEdges)) ||
      (cellX === 0 && boundaryIsOpen(cellX, cellY, 'left', usedEdges)) ||
      (cellX === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'right', usedEdges))
    )
  }
  if (direction === 'left') {
    return (
      (cellX === 0 && boundaryIsOpen(cellX, cellY, 'left', usedEdges)) ||
      (cellY === 0 && boundaryIsOpen(cellX, cellY, 'top', usedEdges)) ||
      (cellY === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'bottom', usedEdges))
    )
  }
  return (
    (cellX === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'right', usedEdges)) ||
    (cellY === 0 && boundaryIsOpen(cellX, cellY, 'top', usedEdges)) ||
    (cellY === MAX_CELL_INDEX && boundaryIsOpen(cellX, cellY, 'bottom', usedEdges))
  )
}

function collectWaterCells(
  regions: Map<string, number>,
  cellX: number,
  cellY: number,
  direction: WaterDropletDirection
) {
  const region = regions.get(`${cellX},${cellY}`)
  if (region === undefined) return new Set<string>()

  const visited = new Set<string>()
  const queue: Array<{ x: number; y: number }> = [{ x: cellX, y: cellY }]
  visited.add(`${cellX},${cellY}`)
  const offsets = flowOffsets(direction)

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    for (const offset of offsets) {
      const nx = current.x + offset.dx
      const ny = current.y + offset.dy
      if (nx < 0 || nx > MAX_CELL_INDEX || ny < 0 || ny > MAX_CELL_INDEX) continue
      if (regions.get(`${nx},${ny}`) !== region) continue
      const key = `${nx},${ny}`
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ x: nx, y: ny })
    }
  }

  return visited
}

export function isWaterDropletContained(
  regions: Map<string, number>,
  target: Pick<WaterDropletTarget, 'cellX' | 'cellY' | 'direction'>,
  usedEdges: Set<string>
) {
  const filledCells = collectWaterCells(regions, target.cellX, target.cellY, target.direction)
  if (filledCells.size === 0) return false
  for (const cell of filledCells) {
    const [x, y] = cell.split(',').map(Number)
    if (leaksAtBoundary(x, y, target.direction, usedEdges)) {
      return false
    }
  }
  return true
}

export function generateWaterDropletsForEdges(
  edges: Set<string>,
  seed: number,
  _selectedSymbolCount: number,
  blockedCells: Set<string>,
  starsActive: boolean,
  preferredColors?: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const buildCandidatesForPath = (path: Point[]) => {
    const pathEdges = edgesFromPath(path)
    const regions = buildCellRegions(pathEdges)
    const localCandidates: WaterDropletPlacement[] = []
    const localDirections = new Set<WaterDropletDirection>()
    for (let y = 0; y <= MAX_CELL_INDEX; y += 1) {
      for (let x = 0; x <= MAX_CELL_INDEX; x += 1) {
        if (blockedCells.has(`${x},${y}`)) continue
        for (const direction of DIRECTIONS) {
          if (!isWaterDropletContained(regions, { cellX: x, cellY: y, direction }, pathEdges)) continue
          localCandidates.push({ cellX: x, cellY: y, direction })
          localDirections.add(direction)
        }
      }
    }
    return {
      candidates: localCandidates,
      uniqueCellCount: new Set(
        localCandidates.map((target) => `${target.cellX},${target.cellY}`)
      ).size,
      directionVariety: localDirections.size,
    }
  }

  const isBetterCandidateSet = (
    candidate: ReturnType<typeof buildCandidatesForPath>,
    currentBest: ReturnType<typeof buildCandidatesForPath>
  ) =>
    candidate.uniqueCellCount > currentBest.uniqueCellCount ||
    (candidate.uniqueCellCount === currentBest.uniqueCellCount &&
      candidate.directionVariety > currentBest.directionVariety) ||
    (candidate.uniqueCellCount === currentBest.uniqueCellCount &&
      candidate.directionVariety === currentBest.directionVariety &&
      candidate.candidates.length > currentBest.candidates.length)

  const pathCandidates: Point[][] = []
  if (preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)) {
    pathCandidates.push(preferredPath)
  }
  const loopyPath = findBestLoopyPathByRegions(edges, rng, preferredPath ? 90 : 140, 8)
  if (loopyPath) pathCandidates.push(loopyPath)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const randomPath = findRandomPath(edges, rng)
    if (randomPath) pathCandidates.push(randomPath)
  }
  if (pathCandidates.length === 0) return null

  let solutionPath = pathCandidates[0]
  let best = buildCandidatesForPath(solutionPath)
  for (let index = 1; index < pathCandidates.length; index += 1) {
    const candidatePath = pathCandidates[index]
    const local = buildCandidatesForPath(candidatePath)
    if (!isBetterCandidateSet(local, best)) continue
    best = local
    solutionPath = candidatePath
  }

  if (best.uniqueCellCount < 3) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const randomPath = findRandomPath(edges, rng)
      if (!randomPath) continue
      const local = buildCandidatesForPath(randomPath)
      if (!isBetterCandidateSet(local, best)) continue
      best = local
      solutionPath = randomPath
      if (best.uniqueCellCount >= 3 && best.directionVariety >= 2) break
    }
  }

  const candidates = best.candidates
  if (candidates.length === 0 || !solutionPath) return null

  const maxCount = 8
  const uniqueCellCount = new Set(candidates.map((target) => `${target.cellX},${target.cellY}`)).size
  const maxAllowed = Math.min(maxCount, uniqueCellCount)
  const minCount = 3
  if (maxAllowed < minCount) return null

  const targetCount = minCount + randInt(rng, maxAllowed - minCount + 1)
  const directionBuckets = new Map<WaterDropletDirection, WaterDropletPlacement[]>(
    DIRECTIONS.map((direction) => [direction, shuffle(
      candidates.filter((target) => target.direction === direction),
      rng
    )])
  )
  const availableDirections = DIRECTIONS.filter(
    (direction) => (directionBuckets.get(direction)?.length ?? 0) > 0
  )
  const desiredDistinctDirections = Math.min(3, targetCount, availableDirections.length)
  const selectedPlacements: WaterDropletPlacement[] = []
  const usedCells = new Set<string>()

  const takeNextForDirection = (direction: WaterDropletDirection) => {
    const bucket = directionBuckets.get(direction)
    if (!bucket) return null
    while (bucket.length > 0) {
      const candidate = bucket.shift()
      if (!candidate) break
      const key = `${candidate.cellX},${candidate.cellY}`
      if (usedCells.has(key)) continue
      return candidate
    }
    return null
  }

  let distinctPlaced = 0
  const seededDirections = new Set<WaterDropletDirection>()
  for (const direction of shuffle(availableDirections, rng)) {
    if (distinctPlaced >= desiredDistinctDirections) break
    const candidate = takeNextForDirection(direction)
    if (!candidate) continue
    selectedPlacements.push(candidate)
    usedCells.add(`${candidate.cellX},${candidate.cellY}`)
    seededDirections.add(direction)
    distinctPlaced += 1
  }

  const directionCounts = new Map<WaterDropletDirection, number>(
    DIRECTIONS.map((direction) => [direction, seededDirections.has(direction) ? 1 : 0])
  )
  while (selectedPlacements.length < targetCount) {
    const directionOrder = shuffle(availableDirections, rng).sort(
      (a, b) => (directionCounts.get(a) ?? 0) - (directionCounts.get(b) ?? 0)
    )
    let placed = false
    for (const direction of directionOrder) {
      const candidate = takeNextForDirection(direction)
      if (!candidate) continue
      selectedPlacements.push(candidate)
      usedCells.add(`${candidate.cellX},${candidate.cellY}`)
      directionCounts.set(direction, (directionCounts.get(direction) ?? 0) + 1)
      placed = true
      break
    }
    if (!placed) break
  }

  if (selectedPlacements.length < minCount) return null

  let palette = [DEFAULT_WATER_DROPLET_COLOR]
  if (starsActive) {
    const normalizedPreferred = Array.from(new Set(preferredColors ?? []))
    if (normalizedPreferred.length > 0) {
      palette = normalizedPreferred.slice(0, 3)
    } else {
      palette = shuffle(COLOR_PALETTE, rng).slice(0, 2)
    }
    if (palette.length === 0) palette = [DEFAULT_WATER_DROPLET_COLOR]
  }
  const selectedTargets: WaterDropletTarget[] = selectedPlacements.map((target) => ({
    ...target,
    color: palette[randInt(rng, palette.length)] ?? DEFAULT_WATER_DROPLET_COLOR,
  }))
  return { targets: selectedTargets, solutionPath }
}

export function checkWaterDroplets(
  usedEdges: Set<string>,
  targets: WaterDropletTarget[]
) {
  const regions = buildCellRegions(usedEdges)
  return targets.every((target) => isWaterDropletContained(regions, target, usedEdges))
}

export function waterDropletDirectionAngle(direction: WaterDropletDirection) {
  if (direction === 'down') return 0
  if (direction === 'left') return 90
  if (direction === 'up') return 180
  return -90
}
