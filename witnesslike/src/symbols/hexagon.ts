import type { Point } from '../puzzleConstants'
import { edgeKey, edgeMidpoint, findRandomPath, mulberry32, pickSpreadTargets, randInt } from '../puzzleUtils'

export type HexTarget = {
  id: string
  kind: 'node' | 'edge'
  position: Point
  edgeKey?: string
}

export function generateHexTargets(edges: Set<string>, seed: number) {
  const rng = mulberry32(seed + 1337)
  const path = findRandomPath(edges, rng)
  if (!path || path.length < 2) return []
  const edgesOnPath: Array<{ a: Point; b: Point }> = []
  for (let i = 1; i < path.length; i += 1) {
    edgesOnPath.push({ a: path[i - 1], b: path[i] })
  }
  const nodeCandidates = path.slice(1, -1)
  const edgeCandidates = edgesOnPath.map((edge) => ({
    edgeKey: edgeKey(edge.a, edge.b),
    position: edgeMidpoint(edge.a, edge.b),
  }))
  const pool: HexTarget[] = [
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
  if (pool.length <= 2) {
    return pool
  }
  const targetCount = Math.min(pool.length, 2 + randInt(rng, 3))
  return pickSpreadTargets(pool, targetCount, 1.05, rng) as HexTarget[]
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
