import type { Point } from '../puzzleConstants'
import {
  COLOR_PALETTE,
  buildCellRegions,
  edgesFromPath,
  findBestLoopyPathByRegions,
  mulberry32,
  randInt,
  regionCountForPath,
  shuffle,
} from '../puzzleUtils'

export type ColorSquare = {
  cellX: number
  cellY: number
  color: string
}

function pathSatisfiesColorSquares(path: Point[], squares: ColorSquare[]) {
  if (path.length < 2) return false
  const regions = buildCellRegions(edgesFromPath(path))
  const regionColors = new Map<number, Set<string>>()
  for (const square of squares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!regionColors.has(region)) {
      regionColors.set(region, new Set())
    }
    const colors = regionColors.get(region)
    colors?.add(square.color)
    if (colors && colors.size > 1) {
      return false
    }
  }
  return true
}

export function generateColorSquaresForEdges(
  edges: Set<string>,
  seed: number,
  desiredColorCount: number,
  selectedSymbolCount = 1,
  colorPool?: string[]
) {
  const availableColors =
    colorPool && colorPool.length > 0
      ? Array.from(new Set(colorPool))
      : COLOR_PALETTE
  const effectiveColorCount = Math.max(1, Math.min(desiredColorCount, availableColors.length))
  const rng = mulberry32(seed)
  const path = findBestLoopyPathByRegions(edges, rng, 260, 12)
  if (!path) return null
  const regionCount = regionCountForPath(path)
  if (regionCount < effectiveColorCount) return null

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const localRng = mulberry32(seed + 4242 + attempt * 97)
    const usedEdges = edgesFromPath(path)
    const regions = buildCellRegions(usedEdges)
    const regionIds = Array.from(new Set(regions.values()))
    if (regionIds.length < effectiveColorCount) continue

    const colorCount = effectiveColorCount
    const minPerColor = colorCount === 2 ? 2 : 1
    const minSquares = colorCount * minPerColor
    const crowdedBoard = selectedSymbolCount >= 3
    const baseSquares = crowdedBoard
      ? colorCount === 2
        ? 5 + randInt(localRng, 4)
        : 6 + randInt(localRng, 4)
      : colorCount === 2
        ? 7 + randInt(localRng, 6)
        : 9 + randInt(localRng, 7)
    const maxSquares = crowdedBoard ? 10 : 16
    const totalSquares = Math.min(maxSquares, Math.max(minSquares, baseSquares))
    const counts = Array.from({ length: colorCount }, () => minPerColor)
    let remaining = totalSquares - minSquares
    while (remaining > 0) {
      counts[randInt(localRng, counts.length)] += 1
      remaining -= 1
    }

    const palette = shuffle(availableColors, localRng).slice(0, colorCount)
    const regionCells = new Map<number, Array<{ x: number; y: number }>>()
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const region = regions.get(`${x},${y}`)
        if (region === undefined) continue
        if (!regionCells.has(region)) regionCells.set(region, [])
        regionCells.get(region)?.push({ x, y })
      }
    }

    const regionList = shuffle(
      Array.from(regionCells.entries()).map(([id, cells]) => ({ id, cells })),
      localRng
    )

    const colorOrder = shuffle(
      Array.from({ length: colorCount }, (_, idx) => idx),
      localRng
    )
    const regionToColor = new Map<number, number>()
    const minRegionsPerColor = regionList.length >= colorCount * 2 ? 2 : 1
    let regionIndex = 0

    for (let round = 0; round < minRegionsPerColor; round += 1) {
      for (const colorIndex of colorOrder) {
        if (regionIndex >= regionList.length) break
        regionToColor.set(regionList[regionIndex].id, colorIndex)
        regionIndex += 1
      }
    }

    for (; regionIndex < regionList.length; regionIndex += 1) {
      regionToColor.set(
        regionList[regionIndex].id,
        colorOrder[randInt(localRng, colorOrder.length)]
      )
    }

    const colorPools: Array<Array<{ x: number; y: number }>> = Array.from(
      { length: colorCount },
      () => []
    )
    for (const region of regionList) {
      const colorIndex = regionToColor.get(region.id)
      if (colorIndex === undefined) continue
      colorPools[colorIndex].push(...region.cells)
    }

    if (colorPools.some((pool, idx) => pool.length < counts[idx])) {
      continue
    }

    const squares: ColorSquare[] = []
    for (let i = 0; i < colorCount; i += 1) {
      const pool = shuffle(colorPools[i], localRng)
      for (let j = 0; j < counts[i]; j += 1) {
        const cell = pool[j]
        squares.push({ cellX: cell.x, cellY: cell.y, color: palette[i] })
      }
    }

    if (!pathSatisfiesColorSquares(path, squares)) {
      continue
    }

    return { squares, solutionPath: path }
  }

  return null
}

export function checkColorSquares(usedEdges: Set<string>, colorSquares: ColorSquare[]) {
  const regions = buildCellRegions(usedEdges)
  const regionColors = new Map<number, Set<string>>()
  for (const square of colorSquares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!regionColors.has(region)) {
      regionColors.set(region, new Set())
    }
    regionColors.get(region)?.add(square.color)
  }
  for (const colors of regionColors.values()) {
    if (colors.size > 1) {
      return false
    }
  }
  return true
}
