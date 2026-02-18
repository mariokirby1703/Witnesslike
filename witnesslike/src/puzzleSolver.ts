import type { TileKind } from './HomePage'
import { END, START } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import { edgeKey, neighbors } from './puzzleUtils'
import { checkColorSquares } from './symbols/colorSquares'
import type { ColorSquare } from './symbols/colorSquares'
import { checkHexTargets } from './symbols/hexagon'
import type { HexTarget } from './symbols/hexagon'
import { checkPolyominoes } from './symbols/polyomino'
import type { PolyominoSymbol } from './symbols/polyomino'
import { checkStars } from './symbols/stars'
import type { StarTarget } from './symbols/stars'
import { checkTriangles } from './symbols/triangles'
import type { TriangleTarget } from './symbols/triangles'

type SolverSymbols = {
  colorSquares: ColorSquare[]
  starTargets: StarTarget[]
  triangleTargets: TriangleTarget[]
  polyominoSymbols: PolyominoSymbol[]
  hexTargets: HexTarget[]
}

function pointKey(point: Point) {
  return `${point.x},${point.y}`
}

function isAtEnd(point: Point) {
  return point.x === END.x && point.y === END.y
}

function satisfiesAllConstraints(
  path: Point[],
  usedEdges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols
) {
  if (activeKinds.includes('hexagon')) {
    if (!checkHexTargets(path, usedEdges, symbols.hexTargets)) return false
  }

  if (activeKinds.includes('color-squares')) {
    if (!checkColorSquares(usedEdges, symbols.colorSquares)) return false
  }

  if (activeKinds.includes('stars')) {
    if (!checkStars(usedEdges, symbols.starTargets, symbols.colorSquares, symbols.polyominoSymbols)) {
      return false
    }
  }

  if (activeKinds.includes('triangles')) {
    if (!checkTriangles(usedEdges, symbols.triangleTargets)) return false
  }

  if (
    activeKinds.includes('polyomino') ||
    activeKinds.includes('rotated-polyomino') ||
    activeKinds.includes('negative-polyomino')
  ) {
    if (!checkPolyominoes(usedEdges, symbols.polyominoSymbols)) return false
  }

  return true
}

export function findAnyValidSolutionPath(
  edges: Set<string>,
  activeKinds: TileKind[],
  symbols: SolverSymbols
) {
  const path: Point[] = [START]
  const usedEdges = new Set<string>()
  const visitedNodes = new Set<string>([pointKey(START)])

  const dfs = (current: Point): boolean => {
    if (isAtEnd(current)) {
      return satisfiesAllConstraints(path, usedEdges, activeKinds, symbols)
    }

    const nextNodes = neighbors(current).sort((a, b) => {
      const aDistance = Math.abs(END.x - a.x) + Math.abs(END.y - a.y)
      const bDistance = Math.abs(END.x - b.x) + Math.abs(END.y - b.y)
      return aDistance - bDistance
    })

    for (const next of nextNodes) {
      const key = edgeKey(current, next)
      if (!edges.has(key)) continue

      const nextKey = pointKey(next)
      if (visitedNodes.has(nextKey)) continue

      visitedNodes.add(nextKey)
      usedEdges.add(key)
      path.push(next)

      if (dfs(next)) return true

      path.pop()
      usedEdges.delete(key)
      visitedNodes.delete(nextKey)
    }

    return false
  }

  if (!dfs(START)) return null
  return [...path]
}
