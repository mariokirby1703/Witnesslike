import { COLOR_PALETTE, buildCellRegions, edgesFromPath, findBestLoopyPathByRegions, findRandomPath, mulberry32, randInt, shuffle } from '../puzzleUtils'
import type { ColorSquare } from './colorSquares'
import type { PolyominoSymbol } from './polyomino'

export type StarTarget = {
  cellX: number
  cellY: number
  color: string
}

export function generateStarsForEdges(
  edges: Set<string>,
  seed: number,
  minPairs: number,
  colorSquares: ColorSquare[],
  polyominoSymbols: PolyominoSymbol[],
  preferredPath?: { x: number; y: number }[]
) {
  const rng = mulberry32(seed)
  const solutionPath =
    preferredPath ?? findBestLoopyPathByRegions(edges, rng, 220, 10) ?? findRandomPath(edges, rng)
  if (!solutionPath) return null

  const regions = buildCellRegions(edgesFromPath(solutionPath))
  const regionCells = new Map<number, Array<{ x: number; y: number }>>()
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const region = regions.get(`${x},${y}`)
      if (region === undefined) continue
      if (!regionCells.has(region)) regionCells.set(region, [])
      regionCells.get(region)?.push({ x, y })
    }
  }

  const squareCounts = new Map<number, Map<string, number>>()
  for (const square of colorSquares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!squareCounts.has(region)) squareCounts.set(region, new Map())
    const regionMap = squareCounts.get(region)
    regionMap?.set(square.color, (regionMap.get(square.color) ?? 0) + 1)
  }
  for (const poly of polyominoSymbols) {
    const region = regions.get(`${poly.cellX},${poly.cellY}`)
    if (region === undefined) continue
    if (!squareCounts.has(region)) squareCounts.set(region, new Map())
    const regionMap = squareCounts.get(region)
    regionMap?.set(poly.color, (regionMap.get(poly.color) ?? 0) + 1)
  }

  const squareColors = Array.from(new Set(colorSquares.map((square) => square.color)))
  for (const poly of polyominoSymbols) {
    if (!squareColors.includes(poly.color)) {
      squareColors.push(poly.color)
    }
  }

  const desiredColorCount = Math.min(4, Math.max(2, squareColors.length, 2 + randInt(rng, 3)))
  const palette = [...squareColors]
  const remainingColors = shuffle(
    COLOR_PALETTE.filter((color) => !palette.includes(color)),
    rng
  )
  for (const color of remainingColors) {
    if (palette.length >= desiredColorCount) break
    palette.push(color)
  }

  const slots: Array<{
    region: number
    color: string
    starsNeeded: number
  }> = []
  for (const [regionId] of regionCells.entries()) {
    const counts = squareCounts.get(regionId)
    for (const color of palette) {
      const squareCount = counts?.get(color) ?? 0
      if (squareCount >= 2) continue
      const starsNeeded = squareCount === 1 ? 1 : 2
      slots.push({ region: regionId, color, starsNeeded })
    }
  }

  const shuffledSlots = shuffle(slots, rng)
  const targetPairs = Math.min(
    shuffledSlots.length,
    minPairs + randInt(rng, 2 + randInt(rng, 3))
  )
  if (shuffledSlots.length < minPairs) return null

  const stars: StarTarget[] = []
  const usedCells = new Set<string>(
    [
      ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
      ...polyominoSymbols.map((poly) => `${poly.cellX},${poly.cellY}`),
    ]
  )
  let pairsPlaced = 0
  for (const slot of shuffledSlots) {
    if (pairsPlaced >= targetPairs) break
    const cells = regionCells.get(slot.region)
    if (!cells) continue
    const available = shuffle(
      cells.filter((cell) => !usedCells.has(`${cell.x},${cell.y}`)),
      rng
    )
    if (available.length < slot.starsNeeded) continue
    for (let i = 0; i < slot.starsNeeded; i += 1) {
      const cell = available[i]
      usedCells.add(`${cell.x},${cell.y}`)
      stars.push({ cellX: cell.x, cellY: cell.y, color: slot.color })
    }
    pairsPlaced += 1
  }

  if (pairsPlaced < minPairs) return null

  return { stars, solutionPath }
}

export function checkStars(
  usedEdges: Set<string>,
  starTargets: StarTarget[],
  colorSquares: ColorSquare[],
  polyominoSymbols: PolyominoSymbol[]
) {
  const regions = buildCellRegions(usedEdges)
  const regionCounts = new Map<number, Map<string, { stars: number; squares: number }>>()

  for (const star of starTargets) {
    const region = regions.get(`${star.cellX},${star.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(star.color) ?? { stars: 0, squares: 0 }
    entry.stars += 1
    colorMap.set(star.color, entry)
  }

  for (const square of colorSquares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(square.color) ?? { stars: 0, squares: 0 }
    entry.squares += 1
    colorMap.set(square.color, entry)
  }

  for (const symbol of polyominoSymbols) {
    const region = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(symbol.color) ?? { stars: 0, squares: 0 }
    entry.squares += 1
    colorMap.set(symbol.color, entry)
  }

  for (const colorMap of regionCounts.values()) {
    for (const entry of colorMap.values()) {
      if (entry.stars === 0) continue
      if (entry.stars + entry.squares !== 2) {
        return false
      }
    }
  }

  return true
}
