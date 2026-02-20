import { END, MAX_INDEX, NODE_COUNT, START } from './puzzleConstants'
import type { Point } from './puzzleConstants'

export const COLOR_PALETTE = [
  '#f8f5ef',
  '#111111',
  '#2fbf71',
  '#e44b4b',
  '#3b82f6',
  '#f4c430',
  '#f08a2f',
  '#9b59b6',
  '#ec4899',
]

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function mulberry32(seed: number) {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function randInt(rng: () => number, max: number) {
  return Math.floor(rng() * max)
}

export function edgeKey(a: Point, b: Point) {
  if (a.x === b.x) {
    return a.y < b.y
      ? `${a.x},${a.y}-${b.x},${b.y}`
      : `${b.x},${b.y}-${a.x},${a.y}`
  }
  if (a.y === b.y) {
    return a.x < b.x
      ? `${a.x},${a.y}-${b.x},${b.y}`
      : `${b.x},${b.y}-${a.x},${a.y}`
  }
  return `${a.x},${a.y}-${b.x},${b.y}`
}

export function neighbors(point: Point) {
  const candidates = [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ]
  return candidates.filter(
    (candidate) =>
      candidate.x >= 0 &&
      candidate.x <= MAX_INDEX &&
      candidate.y >= 0 &&
      candidate.y <= MAX_INDEX
  )
}

export function hasPath(edges: Set<string>) {
  const queue: Point[] = [START]
  const visited = new Set<string>([`${START.x},${START.y}`])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    if (current.x === END.x && current.y === END.y) {
      return true
    }
    for (const next of neighbors(current)) {
      const key = edgeKey(current, next)
      if (!edges.has(key)) continue
      const id = `${next.x},${next.y}`
      if (visited.has(id)) continue
      visited.add(id)
      queue.push(next)
    }
  }
  return false
}

export function buildEdges(rng: () => number) {
  const edges = new Set<string>()
  const allEdges: string[] = []

  for (let y = 0; y < NODE_COUNT; y += 1) {
    for (let x = 0; x < NODE_COUNT; x += 1) {
      const point = { x, y }
      if (x < MAX_INDEX) {
        const right = { x: x + 1, y }
        const key = edgeKey(point, right)
        edges.add(key)
        allEdges.push(key)
      }
      if (y < MAX_INDEX) {
        const down = { x, y: y + 1 }
        const key = edgeKey(point, down)
        edges.add(key)
        allEdges.push(key)
      }
    }
  }

  const gapRatio = 0.12 + rng() * 0.12
  const gapCount = Math.floor(allEdges.length * gapRatio)
  const shuffled = shuffle(allEdges, rng)
  for (let i = 0; i < gapCount; i += 1) {
    edges.delete(shuffled[i])
  }

  return edges
}

export function listAllEdges() {
  const edges: Array<{ key: string; a: Point; b: Point }> = []
  for (let y = 0; y < NODE_COUNT; y += 1) {
    for (let x = 0; x < NODE_COUNT; x += 1) {
      const point = { x, y }
      if (x < MAX_INDEX) {
        const right = { x: x + 1, y }
        edges.push({ key: edgeKey(point, right), a: point, b: right })
      }
      if (y < MAX_INDEX) {
        const down = { x, y: y + 1 }
        edges.push({ key: edgeKey(point, down), a: point, b: down })
      }
    }
  }
  return edges
}

export function buildFullEdges() {
  const edges = new Set<string>()
  for (const edge of listAllEdges()) {
    edges.add(edge.key)
  }
  return edges
}

export function findRandomPath(edges: Set<string>, rng: () => number) {
  const queue: Point[] = [START]
  const visited = new Set<string>([`${START.x},${START.y}`])
  const parent = new Map<string, string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    if (current.x === END.x && current.y === END.y) {
      break
    }
    const nextNodes = shuffle(neighbors(current), rng)
    for (const next of nextNodes) {
      const key = edgeKey(current, next)
      if (!edges.has(key)) continue
      const id = `${next.x},${next.y}`
      if (visited.has(id)) continue
      visited.add(id)
      parent.set(id, `${current.x},${current.y}`)
      queue.push(next)
    }
  }

  const endId = `${END.x},${END.y}`
  if (!parent.has(endId) && !(START.x === END.x && START.y === END.y)) {
    return null
  }

  const path: Point[] = []
  let currentId = endId
  path.push({ x: END.x, y: END.y })
  while (currentId !== `${START.x},${START.y}`) {
    const prevId = parent.get(currentId)
    if (!prevId) return null
    const [x, y] = prevId.split(',').map(Number)
    path.push({ x, y })
    currentId = prevId
  }

  return path.reverse()
}

export function closestPointOnSegment(point: Point, a: Point, b: Point) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) {
    return { x: a.x, y: a.y, t: 0 }
  }
  const t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / abLenSq
  const clamped = clamp(t, 0, 1)
  return {
    x: a.x + abx * clamped,
    y: a.y + aby * clamped,
    t: clamped,
  }
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function hexPoints(center: Point, radius: number) {
  const points: string[] = []
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i
    const x = center.x + radius * Math.cos(angle)
    const y = center.y + radius * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

export function starPoints(center: Point, outerRadius: number, innerRadius: number, spikes = 8) {
  const points: string[] = []
  const step = Math.PI / spikes
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = -Math.PI / 2 + step * i
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const x = center.x + radius * Math.cos(angle)
    const y = center.y + radius * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

export function edgeMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function pickSpreadTargets(
  pool: Array<{ position: Point }>,
  count: number,
  minDistance: number,
  rng: () => number
) {
  if (pool.length <= count) return pool
  const picked: Array<{ position: Point }> = []
  const shuffled = shuffle(pool, rng)
  for (const candidate of shuffled) {
    if (picked.length === 0) {
      picked.push(candidate)
      continue
    }
    const tooClose = picked.some((target) => distance(target.position, candidate.position) < minDistance)
    if (!tooClose) {
      picked.push(candidate)
    }
    if (picked.length >= count) break
  }

  if (picked.length < count && minDistance > 0.45) {
    return pickSpreadTargets(pool, count, minDistance * 0.75, rng)
  }

  return picked
}

export function buildCellRegions(blockedEdges: Set<string>) {
  const regions = new Map<string, number>()
  let regionId = 0

  for (let y = 0; y < MAX_INDEX; y += 1) {
    for (let x = 0; x < MAX_INDEX; x += 1) {
      const key = `${x},${y}`
      if (regions.has(key)) continue
      const queue: Array<{ x: number; y: number }> = [{ x, y }]
      regions.set(key, regionId)
      while (queue.length > 0) {
        const cell = queue.shift()
        if (!cell) break
        const neighbors = [
          { x: cell.x + 1, y: cell.y, edge: edgeKey({ x: cell.x + 1, y: cell.y }, { x: cell.x + 1, y: cell.y + 1 }) },
          { x: cell.x - 1, y: cell.y, edge: edgeKey({ x: cell.x, y: cell.y }, { x: cell.x, y: cell.y + 1 }) },
          { x: cell.x, y: cell.y + 1, edge: edgeKey({ x: cell.x, y: cell.y + 1 }, { x: cell.x + 1, y: cell.y + 1 }) },
          { x: cell.x, y: cell.y - 1, edge: edgeKey({ x: cell.x, y: cell.y }, { x: cell.x + 1, y: cell.y }) },
        ]
        for (const next of neighbors) {
          if (next.x < 0 || next.x >= MAX_INDEX || next.y < 0 || next.y >= MAX_INDEX) {
            continue
          }
          if (blockedEdges.has(next.edge)) continue
          const nextKey = `${next.x},${next.y}`
          if (regions.has(nextKey)) continue
          regions.set(nextKey, regionId)
          queue.push({ x: next.x, y: next.y })
        }
      }
      regionId += 1
    }
  }

  return regions
}

export function edgesFromPath(path: Point[]) {
  const edges = new Set<string>()
  for (let i = 1; i < path.length; i += 1) {
    edges.add(edgeKey(path[i - 1], path[i]))
  }
  return edges
}

export function regionCountForPath(path: Point[]) {
  const regions = buildCellRegions(edgesFromPath(path))
  return new Set(regions.values()).size
}

function pathTurnCount(path: Point[]) {
  if (path.length < 3) return 0
  let turns = 0
  let prevDx = path[1].x - path[0].x
  let prevDy = path[1].y - path[0].y
  for (let i = 2; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (dx !== prevDx || dy !== prevDy) {
      turns += 1
    }
    prevDx = dx
    prevDy = dy
  }
  return turns
}

function longestStraightRun(path: Point[]) {
  if (path.length < 2) return 0
  let longest = 1
  let currentRun = 1
  let prevDx = path[1].x - path[0].x
  let prevDy = path[1].y - path[0].y
  for (let i = 2; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (dx === prevDx && dy === prevDy) {
      currentRun += 1
    } else {
      if (currentRun > longest) longest = currentRun
      currentRun = 1
      prevDx = dx
      prevDy = dy
    }
  }
  if (currentRun > longest) longest = currentRun
  return longest
}

function interiorNodeCount(path: Point[]) {
  return path.filter(
    (point) =>
      point.x > 0 &&
      point.x < MAX_INDEX &&
      point.y > 0 &&
      point.y < MAX_INDEX
  ).length
}

type WildnessProfile = {
  regionWeight: number
  turnWeight: number
  interiorWeight: number
  lengthWeight: number
  straightPenalty: number
}

function pickWildnessProfile(rng: () => number): WildnessProfile {
  const presets: WildnessProfile[] = [
    { regionWeight: 205, turnWeight: 44, interiorWeight: 20, lengthWeight: 9, straightPenalty: 36 },
    { regionWeight: 175, turnWeight: 56, interiorWeight: 19, lengthWeight: 11, straightPenalty: 33 },
    { regionWeight: 196, turnWeight: 36, interiorWeight: 27, lengthWeight: 10, straightPenalty: 31 },
    { regionWeight: 186, turnWeight: 50, interiorWeight: 16, lengthWeight: 8, straightPenalty: 40 },
  ]
  const base = presets[randInt(rng, presets.length)] ?? presets[0]
  const jitter = () => (rng() - 0.5) * 8
  return {
    regionWeight: base.regionWeight + jitter(),
    turnWeight: base.turnWeight + jitter(),
    interiorWeight: base.interiorWeight + jitter(),
    lengthWeight: base.lengthWeight + jitter() * 0.5,
    straightPenalty: base.straightPenalty + jitter(),
  }
}

export function pathSignature(path: Point[]) {
  if (path.length < 2) return ''
  const segments: string[] = []
  for (let i = 1; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (dx > 0) segments.push('R')
    else if (dx < 0) segments.push('L')
    else if (dy > 0) segments.push('D')
    else segments.push('U')
  }
  return segments.join('')
}

function pathWildnessScore(path: Point[], profile: WildnessProfile) {
  const regions = regionCountForPath(path)
  const turns = pathTurnCount(path)
  const straightPenalty = longestStraightRun(path)
  const interior = interiorNodeCount(path)
  const length = path.length
  return (
    regions * profile.regionWeight +
    turns * profile.turnWeight +
    interior * profile.interiorWeight +
    length * profile.lengthWeight -
    straightPenalty * profile.straightPenalty
  )
}

export function buildLoopyPath(edges: Set<string>, rng: () => number, minLength: number, maxSteps: number) {
  let current = START
  const path: Point[] = [START]
  const usedEdges = new Set<string>()
  const visitedNodes = new Set<string>([`${START.x},${START.y}`])

  for (let step = 0; step < maxSteps; step += 1) {
    const candidates = neighbors(current)
      .map((neighbor) => ({ neighbor, key: edgeKey(current, neighbor) }))
      .filter(
        (candidate) =>
          edges.has(candidate.key) &&
          !usedEdges.has(candidate.key) &&
          !visitedNodes.has(`${candidate.neighbor.x},${candidate.neighbor.y}`)
      )

    if (candidates.length === 0) {
      return null
    }

    let options = candidates
    if (current.x === END.x && current.y === END.y && path.length >= minLength) {
      break
    }

    if (path.length < minLength) {
      const withoutEnd = candidates.filter(
        (candidate) => candidate.neighbor.x !== END.x || candidate.neighbor.y !== END.y
      )
      if (withoutEnd.length > 0) {
        options = withoutEnd
      }
    }

    const previous = path.length >= 2 ? path[path.length - 2] : null
    const weightedOptions: typeof options = []
    for (const candidate of options) {
      let weight = 1
      const isInterior =
        candidate.neighbor.x > 0 &&
        candidate.neighbor.x < MAX_INDEX &&
        candidate.neighbor.y > 0 &&
        candidate.neighbor.y < MAX_INDEX
      if (isInterior) weight += 2
      if (previous) {
        const prevDx = current.x - previous.x
        const prevDy = current.y - previous.y
        const nextDx = candidate.neighbor.x - current.x
        const nextDy = candidate.neighbor.y - current.y
        const isTurn = prevDx !== nextDx || prevDy !== nextDy
        if (isTurn) {
          weight += 3
        } else if (path.length > minLength) {
          weight = Math.max(1, weight - 1)
        }
      }
      for (let repeat = 0; repeat < weight; repeat += 1) {
        weightedOptions.push(candidate)
      }
    }
    const pickPool = weightedOptions.length > 0 ? weightedOptions : options
    const pick = pickPool[randInt(rng, pickPool.length)]
    usedEdges.add(pick.key)
    current = pick.neighbor
    path.push(current)
    visitedNodes.add(`${current.x},${current.y}`)

    if (current.x === END.x && current.y === END.y && path.length >= minLength) {
      return path
    }
  }

  if (current.x === END.x && current.y === END.y) {
    return path
  }

  return null
}

export function findBestLoopyPathByRegions(
  edges: Set<string>,
  rng: () => number,
  attempts: number,
  minLength: number,
  avoidSignatures?: ReadonlySet<string>
) {
  const profile = pickWildnessProfile(rng)
  let bestPath: Point[] | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  let bestRegions = Number.NEGATIVE_INFINITY
  const candidatesBySignature = new Map<
    string,
    { path: Point[]; score: number; regionCount: number; signature: string }
  >()
  const maxSteps = Math.max(20, edges.size - 4)
  for (let i = 0; i < attempts; i += 1) {
    const path = buildLoopyPath(edges, rng, minLength, maxSteps)
    if (!path) continue
    const regionCount = regionCountForPath(path)
    const score = pathWildnessScore(path, profile)
    const signature = pathSignature(path)
    const existing = candidatesBySignature.get(signature)
    if (!existing || score > existing.score) {
      candidatesBySignature.set(signature, { path, score, regionCount, signature })
    }
    const isBetter = score > bestScore || (score === bestScore && regionCount > bestRegions)
    if (isBetter) {
      bestScore = score
      bestRegions = regionCount
      bestPath = path
    }
  }
  if (candidatesBySignature.size === 0) return bestPath

  const candidates = Array.from(candidatesBySignature.values()).sort((a, b) => b.score - a.score)
  const topScore = candidates[0].score
  const scoreWindow = 140
  const pooled = candidates
    .filter((candidate) => candidate.score >= topScore - scoreWindow)
    .slice(0, Math.min(10, candidates.length))
  const repeatFilteredPool =
    avoidSignatures && avoidSignatures.size > 0
      ? pooled.filter((candidate) => !avoidSignatures.has(candidate.signature))
      : pooled
  const chosenPool = repeatFilteredPool.length > 0 ? repeatFilteredPool : pooled
  if (chosenPool.length <= 1) {
    return chosenPool[0]?.path ?? bestPath
  }

  const minPoolScore = chosenPool.reduce(
    (minScore, candidate) => Math.min(minScore, candidate.score),
    Number.POSITIVE_INFINITY
  )
  const weightedPool = chosenPool.map((candidate) => ({
    path: candidate.path,
    weight: Math.max(1, candidate.score - minPoolScore + 1),
  }))
  const totalWeight = weightedPool.reduce((sum, candidate) => sum + candidate.weight, 0)
  let pick = rng() * totalWeight
  for (const candidate of weightedPool) {
    pick -= candidate.weight
    if (pick <= 0) return candidate.path
  }

  return weightedPool[weightedPool.length - 1]?.path ?? bestPath
}

export function shapeBounds(cells: Point[]) {
  const xs = cells.map((cell) => cell.x)
  const ys = cells.map((cell) => cell.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}
