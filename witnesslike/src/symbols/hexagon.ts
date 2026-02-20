import { MAX_INDEX } from '../puzzleConstants'
import type { Point } from '../puzzleConstants'
import {
  edgeKey,
  edgeMidpoint,
  findRandomPath,
  mulberry32,
  neighbors,
  pickSpreadTargets,
  randInt,
  shuffle,
} from '../puzzleUtils'

export type HexTarget = {
  id: string
  kind: 'node' | 'edge'
  position: Point
  edgeKey?: string
}

const MIN_HEX_TARGETS = 2
const MAX_HEX_TARGETS = 8
const FULL_GRID_HEX_PROBABILITY = 0.05
const FULL_GRID_PATH_ATTEMPTS = 24

type GenerateHexTargetOptions = {
  forceFullGrid?: boolean
  allowFullGrid?: boolean
}

function isPathCompatible(path: Point[], edges: Set<string>) {
  for (let i = 1; i < path.length; i += 1) {
    if (!edges.has(edgeKey(path[i - 1], path[i]))) return false
  }
  return true
}

function buildAllGridNodeTargets(): HexTarget[] {
  const targets: HexTarget[] = []
  for (let y = 0; y <= MAX_INDEX; y += 1) {
    for (let x = 0; x <= MAX_INDEX; x += 1) {
      targets.push({
        id: `node-${x},${y}`,
        kind: 'node',
        position: { x, y },
      })
    }
  }
  return targets
}

export function shouldUseFullGridHex(seed: number) {
  const rng = mulberry32(seed + 1337)
  return rng() < FULL_GRID_HEX_PROBABILITY
}

function pointId(point: Point) {
  return `${point.x},${point.y}`
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y
}

function startPoint(): Point {
  return { x: 0, y: MAX_INDEX }
}

function endPoint(): Point {
  return { x: MAX_INDEX, y: 0 }
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function buildSerpentineFullGridHexPath(): Point[] {
  const path: Point[] = []
  for (let rowOffset = 0; rowOffset <= MAX_INDEX; rowOffset += 1) {
    const y = MAX_INDEX - rowOffset
    const leftToRight = rowOffset % 2 === 0
    if (leftToRight) {
      for (let x = 0; x <= MAX_INDEX; x += 1) {
        path.push({ x, y })
      }
    } else {
      for (let x = MAX_INDEX; x >= 0; x -= 1) {
        path.push({ x, y })
      }
    }
  }
  return path
}

function findSeededFullGridHexPath(seed: number): Point[] | null {
  const start = startPoint()
  const end = endPoint()
  const totalNodes = (MAX_INDEX + 1) * (MAX_INDEX + 1)

  for (let attempt = 0; attempt < FULL_GRID_PATH_ATTEMPTS; attempt += 1) {
    const rng = mulberry32(seed + 9011 + attempt * 4099)
    const path: Point[] = [{ ...start }]
    const visited = new Set<string>([pointId(start)])

    const dfs = (current: Point): boolean => {
      const visitedCount = path.length
      if (visitedCount === totalNodes) {
        return samePoint(current, end)
      }

      const movesLeft = totalNodes - visitedCount
      const isFinalMove = movesLeft === 1
      const candidates = neighbors(current)
        .filter((next) => !visited.has(pointId(next)))
        .filter((next) => (isFinalMove ? samePoint(next, end) : !samePoint(next, end)))
        .map((next) => {
          const nextVisitedCount = visitedCount + 1
          const remainingMoves = totalNodes - nextVisitedCount
          const distanceToEnd = manhattan(next, end)
          if (distanceToEnd > remainingMoves) return null
          if ((distanceToEnd & 1) !== (remainingMoves & 1)) return null

          const onward = neighbors(next).filter((candidate) => {
            if (visited.has(pointId(candidate))) return false
            if (samePoint(candidate, end)) {
              return remainingMoves === 1
            }
            return true
          }).length
          if (remainingMoves > 0 && onward === 0) return null

          return { next, onward, tie: rng() }
        })
        .filter(
          (candidate): candidate is { next: Point; onward: number; tie: number } =>
            candidate !== null
        )
        .sort((a, b) => a.onward - b.onward || a.tie - b.tie)

      for (const candidate of candidates) {
        path.push(candidate.next)
        visited.add(pointId(candidate.next))
        if (dfs(candidate.next)) {
          return true
        }
        visited.delete(pointId(candidate.next))
        path.pop()
      }
      return false
    }

    if (dfs(start)) {
      return path.map((point) => ({ ...point }))
    }
  }

  return null
}

export function buildFullGridHexPath(seed: number): Point[] {
  return findSeededFullGridHexPath(seed) ?? buildSerpentineFullGridHexPath()
}

export function generateHexTargets(
  edges: Set<string>,
  seed: number,
  preferredPath?: Point[],
  options?: GenerateHexTargetOptions
) {
  const rng = mulberry32(seed + 1337)
  const fullGridRoll = rng()
  const allowFullGrid = options?.allowFullGrid ?? true
  const shouldAutoUseFullGrid = allowFullGrid && fullGridRoll < FULL_GRID_HEX_PROBABILITY
  const useFullGrid = options?.forceFullGrid ?? shouldAutoUseFullGrid
  const path =
    preferredPath && preferredPath.length >= 2 && isPathCompatible(preferredPath, edges)
      ? preferredPath
      : findRandomPath(edges, rng)
  if (!path || path.length < 2) return []

  if (useFullGrid) {
    return buildAllGridNodeTargets()
  }

  const edgesOnPath: Array<{ a: Point; b: Point }> = []
  for (let i = 1; i < path.length; i += 1) {
    edgesOnPath.push({ a: path[i - 1], b: path[i] })
  }
  const nodeCandidates = path.slice(1, -1)
  const edgeCandidates = edgesOnPath.map((edge) => ({
    edgeKey: edgeKey(edge.a, edge.b),
    position: edgeMidpoint(edge.a, edge.b),
  }))

  const rawPool: HexTarget[] = [
    ...nodeCandidates.map((node) => ({
      id: `node-${node.x},${node.y}`,
      kind: 'node' as const,
      position: node,
    })),
    ...edgeCandidates.map((edge) => ({
      id: `edge-${edge.edgeKey}`,
      kind: 'edge' as const,
      position: edge.position,
      edgeKey: edge.edgeKey,
    })),
  ]
  const pool = Array.from(
    new Map(rawPool.map((target) => [target.id, target])).values()
  )
  if (pool.length === 0) {
    return []
  }

  const maxTargetCount = Math.min(pool.length, MAX_HEX_TARGETS)
  const minTargetCount = Math.min(MIN_HEX_TARGETS, maxTargetCount)
  const targetCount =
    maxTargetCount <= minTargetCount
      ? maxTargetCount
      : minTargetCount + randInt(rng, maxTargetCount - minTargetCount + 1)

  if (targetCount >= pool.length) {
    return pool
  }

  const picked = pickSpreadTargets(pool, targetCount, 1.05, rng) as HexTarget[]
  if (picked.length >= targetCount) {
    return picked
  }

  const pickedIds = new Set(picked.map((target) => target.id))
  for (const candidate of shuffle(pool, rng)) {
    if (pickedIds.has(candidate.id)) continue
    picked.push(candidate)
    pickedIds.add(candidate.id)
    if (picked.length >= targetCount) break
  }
  return picked
}

export function checkHexTargets(
  path: Point[],
  usedEdges: Set<string>,
  hexTargets: HexTarget[]
) {
  return hexTargets.every((target) => {
    if (target.kind === 'edge') {
      return !!target.edgeKey && usedEdges.has(target.edgeKey)
    }
    return path.some(
      (point) => point.x === target.position.x && point.y === target.position.y
    )
  })
}
