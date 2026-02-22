import type { ArrowTarget } from './arrows'
import { COLOR_PALETTE, buildCellRegions, edgesFromPath, findBestLoopyPathByRegions, findRandomPath, mulberry32, randInt, shuffle } from '../puzzleUtils'
import type { ColorSquare } from './colorSquares'
import type { CardinalTarget } from './cardinal'
import type { MinesweeperNumberTarget } from './minesweeperNumbers'
import type { NegatorTarget } from './negator'
import type { PolyominoSymbol } from './polyomino'
import type { SentinelTarget } from './sentinel'
import type { SpinnerTarget } from './spinner'
import type { TriangleTarget } from './triangles'
import type { DotTarget } from './dots'
import type { DiamondTarget } from './diamonds'
import type { ChevronTarget } from './chevrons'
import type { WaterDropletTarget } from './waterDroplet'
import type { GhostTarget } from './ghost'
import type { CrystalTarget } from './crystals'
import type { ChipTarget } from './chips'
import type { DiceTarget } from './dice'
import type { BlackHoleTarget } from './blackHoles'
import type { TallyMarkTarget } from './tallyMarks'
import type { EyeTarget } from './eyes'
import type { CompassTarget } from './compass'

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
  dotTargets: DotTarget[],
  diamondTargets: DiamondTarget[],
  chevronTargets: ChevronTarget[],
  minesweeperTargets: MinesweeperNumberTarget[],
  waterDropletTargets: WaterDropletTarget[],
  cardinalTargets: CardinalTarget[],
  spinnerTargets: SpinnerTarget[],
  ghostTargets: GhostTarget[],
  crystalTargets: CrystalTarget[],
  chipTargets: ChipTarget[],
  diceTargets: DiceTarget[],
  blackHoleTargets: BlackHoleTarget[],
  tallyTargets: TallyMarkTarget[] = [],
  eyeTargets: EyeTarget[] = [],
  allowNegatorOrphan = false,
  preferredPath?: { x: number; y: number }[],
  selectedSymbolCount = 3,
  compassTargets: CompassTarget[] = []
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
  for (const dot of dotTargets) {
    const region = regions.get(`${dot.cellX},${dot.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(dot.color, (regionMap.get(dot.color) ?? 0) + 1)
  }
  for (const diamond of diamondTargets) {
    const region = regions.get(`${diamond.cellX},${diamond.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(diamond.color, (regionMap.get(diamond.color) ?? 0) + 1)
  }
  for (const chevron of chevronTargets) {
    const region = regions.get(`${chevron.cellX},${chevron.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(chevron.color, (regionMap.get(chevron.color) ?? 0) + 1)
  }
  for (const mine of minesweeperTargets) {
    const region = regions.get(`${mine.cellX},${mine.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(mine.color, (regionMap.get(mine.color) ?? 0) + 1)
  }
  for (const droplet of waterDropletTargets) {
    const region = regions.get(`${droplet.cellX},${droplet.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(droplet.color, (regionMap.get(droplet.color) ?? 0) + 1)
  }
  for (const cardinal of cardinalTargets) {
    const region = regions.get(`${cardinal.cellX},${cardinal.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(cardinal.color, (regionMap.get(cardinal.color) ?? 0) + 1)
  }
  for (const spinner of spinnerTargets) {
    const region = regions.get(`${spinner.cellX},${spinner.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(spinner.color, (regionMap.get(spinner.color) ?? 0) + 1)
  }
  for (const ghost of ghostTargets) {
    const region = regions.get(`${ghost.cellX},${ghost.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(ghost.color, (regionMap.get(ghost.color) ?? 0) + 1)
  }
  for (const crystal of crystalTargets) {
    const region = regions.get(`${crystal.cellX},${crystal.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(crystal.color, (regionMap.get(crystal.color) ?? 0) + 1)
  }
  for (const chip of chipTargets) {
    const region = regions.get(`${chip.cellX},${chip.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(chip.color, (regionMap.get(chip.color) ?? 0) + 1)
  }
  for (const dice of diceTargets) {
    const region = regions.get(`${dice.cellX},${dice.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(dice.color, (regionMap.get(dice.color) ?? 0) + 1)
  }
  for (const blackHole of blackHoleTargets) {
    const region = regions.get(`${blackHole.cellX},${blackHole.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(blackHole.color, (regionMap.get(blackHole.color) ?? 0) + 1)
  }
  for (const tally of tallyTargets) {
    const region = regions.get(`${tally.cellX},${tally.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(tally.color, (regionMap.get(tally.color) ?? 0) + 1)
  }
  for (const eye of eyeTargets) {
    const region = regions.get(`${eye.cellX},${eye.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(eye.color, (regionMap.get(eye.color) ?? 0) + 1)
  }
  for (const compass of compassTargets) {
    const region = regions.get(`${compass.cellX},${compass.cellY}`)
    if (region === undefined) continue
    if (!coloredCounts.has(region)) coloredCounts.set(region, new Map())
    const regionMap = coloredCounts.get(region)
    regionMap?.set(compass.color, (regionMap.get(compass.color) ?? 0) + 1)
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
  for (const dot of dotTargets) {
    if (!symbolColors.includes(dot.color)) {
      symbolColors.push(dot.color)
    }
  }
  for (const diamond of diamondTargets) {
    if (!symbolColors.includes(diamond.color)) {
      symbolColors.push(diamond.color)
    }
  }
  for (const chevron of chevronTargets) {
    if (!symbolColors.includes(chevron.color)) {
      symbolColors.push(chevron.color)
    }
  }
  for (const mine of minesweeperTargets) {
    if (!symbolColors.includes(mine.color)) {
      symbolColors.push(mine.color)
    }
  }
  for (const droplet of waterDropletTargets) {
    if (!symbolColors.includes(droplet.color)) {
      symbolColors.push(droplet.color)
    }
  }
  for (const cardinal of cardinalTargets) {
    if (!symbolColors.includes(cardinal.color)) {
      symbolColors.push(cardinal.color)
    }
  }
  for (const spinner of spinnerTargets) {
    if (!symbolColors.includes(spinner.color)) {
      symbolColors.push(spinner.color)
    }
  }
  for (const ghost of ghostTargets) {
    if (!symbolColors.includes(ghost.color)) {
      symbolColors.push(ghost.color)
    }
  }
  for (const crystal of crystalTargets) {
    if (!symbolColors.includes(crystal.color)) {
      symbolColors.push(crystal.color)
    }
  }
  for (const chip of chipTargets) {
    if (!symbolColors.includes(chip.color)) {
      symbolColors.push(chip.color)
    }
  }
  for (const dice of diceTargets) {
    if (!symbolColors.includes(dice.color)) {
      symbolColors.push(dice.color)
    }
  }
  for (const blackHole of blackHoleTargets) {
    if (!symbolColors.includes(blackHole.color)) {
      symbolColors.push(blackHole.color)
    }
  }
  for (const tally of tallyTargets) {
    if (!symbolColors.includes(tally.color)) {
      symbolColors.push(tally.color)
    }
  }
  for (const eye of eyeTargets) {
    if (!symbolColors.includes(eye.color)) {
      symbolColors.push(eye.color)
    }
  }
  for (const compass of compassTargets) {
    if (!symbolColors.includes(compass.color)) {
      symbolColors.push(compass.color)
    }
  }

  const baseColors = symbolColors.slice(0, 3)
  const desiredColorCount = Math.min(3, Math.max(2, baseColors.length, 2 + randInt(rng, 2)))
  const palette = [...baseColors]
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
      ...dotTargets.map((dot) => `${dot.cellX},${dot.cellY}`),
      ...diamondTargets.map((diamond) => `${diamond.cellX},${diamond.cellY}`),
      ...chevronTargets.map((chevron) => `${chevron.cellX},${chevron.cellY}`),
      ...minesweeperTargets.map((mine) => `${mine.cellX},${mine.cellY}`),
      ...waterDropletTargets.map((droplet) => `${droplet.cellX},${droplet.cellY}`),
      ...cardinalTargets.map((cardinal) => `${cardinal.cellX},${cardinal.cellY}`),
      ...spinnerTargets.map((spinner) => `${spinner.cellX},${spinner.cellY}`),
      ...ghostTargets.map((ghost) => `${ghost.cellX},${ghost.cellY}`),
      ...crystalTargets.map((crystal) => `${crystal.cellX},${crystal.cellY}`),
      ...chipTargets.map((chip) => `${chip.cellX},${chip.cellY}`),
      ...diceTargets.map((dice) => `${dice.cellX},${dice.cellY}`),
      ...blackHoleTargets.map((blackHole) => `${blackHole.cellX},${blackHole.cellY}`),
      ...tallyTargets.map((tally) => `${tally.cellX},${tally.cellY}`),
      ...eyeTargets.map((eye) => `${eye.cellX},${eye.cellY}`),
      ...compassTargets.map((compass) => `${compass.cellX},${compass.cellY}`),
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
    arrowTargets.length +
      colorSquares.length +
      polyominoSymbols.length +
      triangleTargets.length +
      dotTargets.length +
      diamondTargets.length +
      chevronTargets.length +
      minesweeperTargets.length +
      waterDropletTargets.length +
      cardinalTargets.length +
      spinnerTargets.length +
      ghostTargets.length +
      crystalTargets.length +
      chipTargets.length +
      diceTargets.length +
      blackHoleTargets.length +
      tallyTargets.length +
      eyeTargets.length +
      compassTargets.length >
    0
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
  dotTargets: DotTarget[],
  diamondTargets: DiamondTarget[],
  chevronTargets: ChevronTarget[],
  minesweeperTargets: MinesweeperNumberTarget[],
  waterDropletTargets: WaterDropletTarget[],
  cardinalTargets: CardinalTarget[],
  spinnerTargets: SpinnerTarget[] = [],
  ghostTargets: GhostTarget[] = [],
  crystalTargets: CrystalTarget[] = [],
  chipTargets: ChipTarget[] = [],
  diceTargets: DiceTarget[] = [],
  blackHoleTargets: BlackHoleTarget[] = [],
  tallyTargets: TallyMarkTarget[] = [],
  eyeTargets: EyeTarget[] = [],
  negatorTargets: NegatorTarget[] = [],
  sentinelTargets: SentinelTarget[] = [],
  compassTargets: CompassTarget[] = []
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
  for (const dot of dotTargets) {
    const region = regions.get(`${dot.cellX},${dot.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(dot.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(dot.color, entry)
  }
  for (const diamond of diamondTargets) {
    const region = regions.get(`${diamond.cellX},${diamond.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(diamond.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(diamond.color, entry)
  }
  for (const chevron of chevronTargets) {
    const region = regions.get(`${chevron.cellX},${chevron.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(chevron.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(chevron.color, entry)
  }

  for (const mine of minesweeperTargets) {
    const region = regions.get(`${mine.cellX},${mine.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(mine.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(mine.color, entry)
  }

  for (const droplet of waterDropletTargets) {
    const region = regions.get(`${droplet.cellX},${droplet.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(droplet.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(droplet.color, entry)
  }
  for (const cardinal of cardinalTargets) {
    const region = regions.get(`${cardinal.cellX},${cardinal.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(cardinal.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(cardinal.color, entry)
  }
  for (const spinner of spinnerTargets) {
    const region = regions.get(`${spinner.cellX},${spinner.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(spinner.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(spinner.color, entry)
  }
  for (const ghost of ghostTargets) {
    const region = regions.get(`${ghost.cellX},${ghost.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(ghost.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(ghost.color, entry)
  }
  for (const crystal of crystalTargets) {
    const region = regions.get(`${crystal.cellX},${crystal.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(crystal.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(crystal.color, entry)
  }
  for (const chip of chipTargets) {
    const region = regions.get(`${chip.cellX},${chip.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(chip.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(chip.color, entry)
  }
  for (const dice of diceTargets) {
    const region = regions.get(`${dice.cellX},${dice.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(dice.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(dice.color, entry)
  }
  for (const blackHole of blackHoleTargets) {
    const region = regions.get(`${blackHole.cellX},${blackHole.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(blackHole.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(blackHole.color, entry)
  }
  for (const tally of tallyTargets) {
    const region = regions.get(`${tally.cellX},${tally.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(tally.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(tally.color, entry)
  }
  for (const eye of eyeTargets) {
    const region = regions.get(`${eye.cellX},${eye.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(eye.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(eye.color, entry)
  }
  for (const compass of compassTargets) {
    const region = regions.get(`${compass.cellX},${compass.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(compass.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(compass.color, entry)
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
  for (const sentinel of sentinelTargets) {
    const region = regions.get(`${sentinel.cellX},${sentinel.cellY}`)
    if (region === undefined) continue
    if (!regionCounts.has(region)) regionCounts.set(region, new Map())
    const colorMap = regionCounts.get(region)
    if (!colorMap) continue
    const entry = colorMap.get(sentinel.color) ?? { stars: 0, symbols: 0 }
    entry.symbols += 1
    colorMap.set(sentinel.color, entry)
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


