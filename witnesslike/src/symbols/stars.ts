import type { ArrowTarget } from './arrows'
import { COLOR_PALETTE, buildCellRegions, edgesFromPath, findBestLoopyPathByRegions, findRandomPath, mulberry32, randInt, shuffle } from '../puzzleUtils'
import type { ColorSquare } from './colorSquares'
import type { NegatorTarget } from './negator'
import type { PolyominoSymbol } from './polyomino'
import type { TriangleTarget } from './triangles'

export type StarTarget = {
  cellX: number
  cellY: number
  color: string
}

export function generateStarsForEdges(
  edges: Set<string>,
  seed: number,
  minPairs: number,
  arrowTargets: ArrowTarget[],
  colorSquares: ColorSquare[],
  polyominoSymbols: PolyominoSymbol[],
  triangleTargets: TriangleTarget[],
  allowNegatorOrphan = false,
  preferredPath?: { x: number; y: number }[],
  selectedSymbolCount = 3
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

  const coloredCounts = new Map<number, Map<string, number>>()
  for (const arrow of arrowTargets) {
    const region = regions.get(`${arrow.cellX},${arrow.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(arrow.color, (regionMap.get(arrow.color) ?? 0) + 1)
  }
  for (const square of colorSquares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(square.color, (regionMap.get(square.color) ?? 0) + 1)
  }
  for (const poly of polyominoSymbols) {
    const region = regions.get(`${poly.cellX},${poly.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(poly.color, (regionMap.get(poly.color) ?? 0) + 1)
  }
  for (const triangle of triangleTargets) {
    const region = regions.get(`${triangle.cellX},${triangle.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(triangle.color, (regionMap.get(triangle.color) ?? 0) + 1)
  }

  const symbolColors = Array.from(new Set(arrowTargets.map((arrow) => arrow.color)))
  for (const square of colorSquares) {
    if (!symbolColors.includes(square.color)) {
      symbolColors.push(square.color)
    }
  }
  for (const poly of polyominoSymbols) {
    if (!symbolColors.includes(poly.color)) {
      symbolColors.push(poly.color)
    }
  }
  for (const triangle of triangleTargets) {
    if (!symbolColors.includes(triangle.color)) {
      symbolColors.push(triangle.color)
    }
  }

  const desiredColorCount = Math.min(3, Math.max(2, symbolColors.length, 2 + randInt(rng, 2)))
  const palette = [...symbolColors]
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
    const counts = coloredCounts.get(regionId)
    for (const color of palette) {
      const coloredCount = counts?.get(color) ?? 0
      if (coloredCount >= 2) continue
      const starsNeeded = coloredCount === 1 ? 1 : 2
      slots.push({ region: regionId, color, starsNeeded })
    }
  }

  const shuffledSlots = shuffle(slots, rng)
  const boostedDensity = selectedSymbolCount <= 2
  const extraPairs = boostedDensity
    ? 2 + randInt(rng, 3 + randInt(rng, 4))
    : randInt(rng, 2 + randInt(rng, 3))
  const targetPairs = Math.min(
    shuffledSlots.length,
    minPairs + extraPairs
  )
  if (shuffledSlots.length < minPairs) return null

  const stars: StarTarget[] = []
  const usedCells = new Set<string>(
    [
      ...arrowTargets.map((arrow) => `${arrow.cellX},${arrow.cellY}`),
      ...colorSquares.map((square) => `${square.cellX},${square.cellY}`),
      ...polyominoSymbols.map((poly) => `${poly.cellX},${poly.cellY}`),
      ...triangleTargets.map((triangle) => `${triangle.cellX},${triangle.cellY}`),
    ]
  )

  const placeSlot = (slot: { region: number; color: string; starsNeeded: number }) => {
    const cells = regionCells.get(slot.region)
    if (!cells) return false
    const available = shuffle(
      cells.filter((cell) => !usedCells.has(`${cell.x},${cell.y}`)),
      rng
    )
    if (available.length < slot.starsNeeded) return false
    for (let i = 0; i < slot.starsNeeded; i += 1) {
      const cell = available[i]
      usedCells.add(`${cell.x},${cell.y}`)
      stars.push({ cellX: cell.x, cellY: cell.y, color: slot.color })
    }
    return true
  }

  const hasSupportSymbols =
    arrowTargets.length + colorSquares.length + polyominoSymbols.length + triangleTargets.length > 0
  const oneStarSlots = shuffledSlots.filter((slot) => slot.starsNeeded === 1)
  const placeableOneStarSlots = oneStarSlots.filter((slot) => {
    const cells = regionCells.get(slot.region)
    if (!cells) return false
    return cells.some((cell) => !usedCells.has(`${cell.x},${cell.y}`))
  })
  const preferOddStarTotal =
    hasSupportSymbols && placeableOneStarSlots.length > 0 && rng() < 0.78
  const prioritizedOneStarSlot = preferOddStarTotal
    ? placeableOneStarSlots[randInt(rng, placeableOneStarSlots.length)] ?? null
    : null

  let pairsPlaced = 0
  let oneStarSlotsPlaced = 0
  if (prioritizedOneStarSlot && pairsPlaced < targetPairs) {
    if (placeSlot(prioritizedOneStarSlot)) {
      pairsPlaced += 1
      oneStarSlotsPlaced += 1
    }
  }

  for (const slot of shuffledSlots) {
    if (slot === prioritizedOneStarSlot) continue
    if (pairsPlaced >= targetPairs) break
    if (
      preferOddStarTotal &&
      oneStarSlotsPlaced % 2 === 1 &&
      slot.starsNeeded === 1 &&
      pairsPlaced >= minPairs &&
      rng() < 0.8
    ) {
      continue
    }
    if (!placeSlot(slot)) continue
    pairsPlaced += 1
    if (slot.starsNeeded === 1) {
      oneStarSlotsPlaced += 1
    }
  }

  if (pairsPlaced < minPairs) return null

  let orphanStarAdded = false
  if (allowNegatorOrphan && stars.length > 0 && rng() < 0.42) {
    const starCountByRegionColor = new Map<string, number>()
    for (const star of stars) {
      const region = regions.get(`${star.cellX},${star.cellY}`)
      if (region === undefined) continue
      const key = `${region}|${star.color}`
      starCountByRegionColor.set(key, (starCountByRegionColor.get(key) ?? 0) + 1)
    }

    const orphanCandidates: Array<{ region: number; color: string; cell: { x: number; y: number } }> = []
    for (const [region, cells] of regionCells.entries()) {
      const available = cells.filter((cell) => !usedCells.has(`${cell.x},${cell.y}`))
      if (available.length === 0) continue
      const counts = coloredCounts.get(region)
      for (const color of palette) {
        const symbolsInRegion = counts?.get(color) ?? 0
        const starsInRegion = starCountByRegionColor.get(`${region}|${color}`) ?? 0
        if (symbolsInRegion + starsInRegion !== 2) continue
        orphanCandidates.push({
          region,
          color,
          cell: available[randInt(rng, available.length)] ?? available[0],
        })
      }
    }

    if (orphanCandidates.length > 0) {
      const pick = orphanCandidates[randInt(rng, orphanCandidates.length)] ?? orphanCandidates[0]
      usedCells.add(`${pick.cell.x},${pick.cell.y}`)
      stars.push({ cellX: pick.cell.x, cellY: pick.cell.y, color: pick.color })
      orphanStarAdded = true
    }
  }

  return { stars, solutionPath, orphanStarAdded }
}

export function checkStars(
  usedEdges: Set<string>,
  starTargets: StarTarget[],
  arrowTargets: ArrowTarget[],
  colorSquares: ColorSquare[],
  polyominoSymbols: PolyominoSymbol[],
  triangleTargets: TriangleTarget[],
  negatorTargets: NegatorTarget[] = []
) {
  const regions = buildCellRegions(usedEdges)
  const regionCounts = new Map<number, Map<string, { stars: number; symbols: number }>>()

  for (const star of starTargets) {
    const region = regions.get(`${star.cellX},${star.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(star.color) ?? { stars: 0, symbols: 0 }
    entry.stars += 1
    colorMap.set(star.color, entry)
  }

  for (const square of colorSquares) {
    const region = regions.get(`${square.cellX},${square.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(square.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(square.color, entry)
  }

  for (const arrow of arrowTargets) {
    const region = regions.get(`${arrow.cellX},${arrow.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(arrow.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(arrow.color, entry)
  }

  for (const symbol of polyominoSymbols) {
    const region = regions.get(`${symbol.cellX},${symbol.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(symbol.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(symbol.color, entry)
  }

  for (const triangle of triangleTargets) {
    const region = regions.get(`${triangle.cellX},${triangle.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(triangle.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(triangle.color, entry)
  }

  for (const negator of negatorTargets) {
    const region = regions.get(`${negator.cellX},${negator.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(negator.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(negator.color, entry)
  }

  for (const colorMap of regionCounts.values()) {
    for (const entry of colorMap.values()) {
      if (entry.stars === 0) continue
      if (entry.stars + entry.symbols !== 2) {
        return false
      }
    }
  }

  return true
}
