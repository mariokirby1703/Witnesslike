import type { Point } from '../puzzleConstants'
import type { ArrowTarget } from './arrows'
import type { ColorSquare } from './colorSquares'
import type { HexTarget } from './hexagon'
import type { PolyominoSymbol } from './polyomino'
import type { StarTarget } from './stars'
import type { TriangleTarget } from './triangles'
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
  polyominoSymbols: PolyominoSymbol[],
  hexTargets: HexTarget[],
  starsActive: boolean,
  preferredColors: string[],
  preferredPath?: Point[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 180, 8) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const regions = buildCellRegions(edgesFromPath(solutionPath))
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
  polyominoSymbols.forEach((target, index) => {
    addRemovable(`poly:${index}`, regions.get(`${target.cellX},${target.cellY}`))
  })
  hexTargets.forEach((target, index) => {
    for (const region of regionIdsForBoardPoint(regions, target.position)) {
      addRemovable(`hex:${index}`, region)
    }
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

  const wantsTwo =
    availableCells.length >= 2 &&
    allRemovableKeys.size >= 2 &&
    rng() < 0.2
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
      return canAssignDistinctRemovals([availableCells[0]]) ? [availableCells[0]] : null
    }
    const pairCandidates: Array<Array<{ x: number; y: number }>> = []
    for (let i = 0; i < availableCells.length; i += 1) {
      for (let j = i + 1; j < availableCells.length; j += 1) {
        pairCandidates.push([availableCells[i], availableCells[j]])
      }
    }
    for (const pair of shuffle(pairCandidates, rng)) {
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
