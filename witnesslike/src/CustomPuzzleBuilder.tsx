import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Tile, TileKind } from './HomePage'
import { SymbolTile } from './HomePage'
import type { Point } from './puzzleConstants'
import { GAP_SIZE } from './puzzleConstants'
import { edgeKey, hexPoints, shapeBounds, starPoints } from './puzzleUtils'
import type { ArrowDirection, ArrowTarget } from './symbols/arrows'
import { arrowDirectionAngle } from './symbols/arrows'
import type { BlackHoleTarget } from './symbols/blackHoles'
import type { CardinalTarget } from './symbols/cardinal'
import type { ChevronTarget } from './symbols/chevrons'
import { chevronDirectionAngle } from './symbols/chevrons'
import type { ChipTarget } from './symbols/chips'
import type { ColorSquare } from './symbols/colorSquares'
import type { CompassTarget } from './symbols/compass'
import type { CrystalTarget } from './symbols/crystals'
import type { DiamondTarget } from './symbols/diamonds'
import type { DiceTarget } from './symbols/dice'
import type { DotTarget } from './symbols/dots'
import type { EyeTarget } from './symbols/eyes'
import type { GhostTarget } from './symbols/ghost'
import type { HexTarget } from './symbols/hexagon'
import type { MinesweeperNumberTarget } from './symbols/minesweeperNumbers'
import { minesweeperDigitPixels } from './symbols/minesweeperNumbers'
import type { NegatorTarget } from './symbols/negator'
import type { OpenPentagonTarget } from './symbols/openPentagons'
import type { PolyominoShape, PolyominoSymbol } from './symbols/polyomino'
import type { SentinelTarget } from './symbols/sentinel'
import { sentinelDirectionAngle } from './symbols/sentinel'
import type { SpinnerTarget } from './symbols/spinner'
import { spinnerDirectionScaleX } from './symbols/spinner'
import type { StarTarget } from './symbols/stars'
import type { TallyMarkTarget } from './symbols/tallyMarks'
import type { TriangleTarget } from './symbols/triangles'
import type { WaterDropletTarget } from './symbols/waterDroplet'
import { waterDropletDirectionAngle } from './symbols/waterDroplet'

export type CustomPuzzleConfig = {
  rows: number
  columns: number
  selectedTiles: Tile[]
  forcedEdgeKeys: string[]
  forcedStartPoint: Point
  forcedEndPoint: Point
  forcedStartPoints: Point[]
  forcedEndPoints: Point[]
  viewBoxOverride: { x: number; y: number; w: number; h: number }
  forcedArrowTargets: ArrowTarget[]
  forcedColorSquares: ColorSquare[]
  forcedStarTargets: StarTarget[]
  forcedTriangleTargets: TriangleTarget[]
  forcedDotTargets: DotTarget[]
  forcedDiamondTargets: DiamondTarget[]
  forcedChevronTargets: ChevronTarget[]
  forcedMinesweeperTargets: MinesweeperNumberTarget[]
  forcedWaterDropletTargets: WaterDropletTarget[]
  forcedCardinalTargets: CardinalTarget[]
  forcedSpinnerTargets: SpinnerTarget[]
  forcedSentinelTargets: SentinelTarget[]
  forcedGhostTargets: GhostTarget[]
  forcedCrystalTargets: CrystalTarget[]
  forcedChipTargets: ChipTarget[]
  forcedDiceTargets: DiceTarget[]
  forcedBlackHoleTargets: BlackHoleTarget[]
  forcedOpenPentagonTargets: OpenPentagonTarget[]
  forcedEyeTargets: EyeTarget[]
  forcedTallyTargets: TallyMarkTarget[]
  forcedCompassTargets: CompassTarget[]
  forcedPolyominoSymbols: PolyominoSymbol[]
  forcedNegatorTargets: NegatorTarget[]
  forcedHexTargets: HexTarget[]
}

type CustomPuzzleBuilderProps = {
  tiles: Tile[]
  onBack: () => void
  onPlay: (config: CustomPuzzleConfig) => void
}

type CellSymbolKind = Exclude<TileKind, 'gap-line' | 'hexagon'>
type PlacementMode = 'symbol' | 'start' | 'end' | 'erase'
type ColorChoice = 'default' | string
type PlacedCellSymbol = {
  id: string
  kind: CellSymbolKind
  cellX: number
  cellY: number
  color: ColorChoice
  variant: number
}
type BuilderState = {
  rows: number
  columns: number
  selectedKind: TileKind | null
  selectedColor: ColorChoice
  variantStep: number
  startPoints: Point[]
  endPoints: Point[]
  removedEdges: string[]
  hexTargets: HexTarget[]
  cellSymbols: PlacedCellSymbol[]
  polyCells: Point[]
}

const STORAGE_KEY = 'witnesslike-custom-builder-v2'
const DEFAULT_STATE: BuilderState = {
  rows: 4,
  columns: 4,
  selectedKind: null,
  selectedColor: 'default',
  variantStep: 0,
  startPoints: [{ x: 0, y: 4 }],
  endPoints: [{ x: 4, y: 0 }],
  removedEdges: [],
  hexTargets: [],
  cellSymbols: [],
  polyCells: [{ x: 2, y: 2 }],
}

const BUILDER_COLORS = [
  'default',
  '#f8f5ef',
  '#111111',
  '#e44b4b',
  '#f08a2f',
  '#f4c430',
  '#2fbf71',
  '#22c4e5',
  '#3b82f6',
  '#9b59b6',
  '#ec4899',
] as const

const DEFAULT_SYMBOL_COLORS: Partial<Record<TileKind, string>> = {
  'color-squares': '#f8f5ef',
  stars: '#f08a2f',
  triangles: '#ff8a00',
  polyomino: '#f4c430',
  'rotated-polyomino': '#f4c430',
  'negative-polyomino': '#1f43ff',
  'rotated-negative-polyomino': '#1f43ff',
  negator: '#f8f5ef',
  arrows: '#a855f7',
  'minesweeper-numbers': '#8f939b',
  'water-droplet': '#22c4e5',
  cardinal: '#ef2df5',
  sentinel: '#efe96f',
  spinner: '#39ff14',
  dots: '#f4eb2f',
  diamonds: '#9fbc00',
  chevrons: '#ff4c00',
  chips: '#8e2de2',
  dice: '#3f7fff',
  'open-pentagons': '#d88a14',
  compasses: '#7be0ff',
  'tally-marks': '#f8f5ef',
  'black-holes': '#111111',
  eyes: '#ef4b5f',
  crystals: '#c9153b',
  ghost: '#d7d4da',
}

const DIRECTION_8: ArrowDirection[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']
const DIRECTION_4 = ['up', 'right', 'down', 'left'] as const

type ForcedSymbolGroups = {
  forcedArrowTargets: ArrowTarget[]
  forcedColorSquares: ColorSquare[]
  forcedStarTargets: StarTarget[]
  forcedTriangleTargets: TriangleTarget[]
  forcedDotTargets: DotTarget[]
  forcedDiamondTargets: DiamondTarget[]
  forcedChevronTargets: ChevronTarget[]
  forcedMinesweeperTargets: MinesweeperNumberTarget[]
  forcedWaterDropletTargets: WaterDropletTarget[]
  forcedCardinalTargets: CardinalTarget[]
  forcedSpinnerTargets: SpinnerTarget[]
  forcedSentinelTargets: SentinelTarget[]
  forcedGhostTargets: GhostTarget[]
  forcedCrystalTargets: CrystalTarget[]
  forcedChipTargets: ChipTarget[]
  forcedDiceTargets: DiceTarget[]
  forcedBlackHoleTargets: BlackHoleTarget[]
  forcedOpenPentagonTargets: OpenPentagonTarget[]
  forcedEyeTargets: EyeTarget[]
  forcedTallyTargets: TallyMarkTarget[]
  forcedCompassTargets: CompassTarget[]
  forcedPolyominoSymbols: PolyominoSymbol[]
  forcedNegatorTargets: NegatorTarget[]
}

function clampSize(value: number) {
  return Math.max(1, Math.min(7, value))
}

function resolveColor(kind: TileKind, color: ColorChoice) {
  if (color !== 'default') return color
  return DEFAULT_SYMBOL_COLORS[kind] ?? '#d7e7fb'
}

function variantCount(kind: TileKind) {
  if (kind === 'triangles') return 3
  if (kind === 'dots' || kind === 'diamonds') return 4
  if (kind === 'minesweeper-numbers') return 9
  if (kind === 'dice') return 9
  if (kind === 'arrows') return 32
  if (kind === 'chevrons') return 24
  if (kind === 'compasses') return 8
  if (kind === 'water-droplet' || kind === 'sentinel' || kind === 'eyes') return 4
  if (kind === 'spinner') return 2
  if (kind === 'tally-marks') return 25
  return 1
}

function arrowVariant(variant: number) {
  return {
    direction: DIRECTION_8[variant % DIRECTION_8.length],
    count: (Math.floor(variant / DIRECTION_8.length) % 4) + 1 as 1 | 2 | 3 | 4,
  }
}

function chevronVariant(variant: number) {
  return {
    direction: DIRECTION_8[variant % DIRECTION_8.length],
    count: (Math.floor(variant / DIRECTION_8.length) % 3) + 1 as 1 | 2 | 3,
  }
}

function buildRectEdgeKeys(columns: number, rows: number) {
  const keys: string[] = []
  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      if (x < columns) keys.push(edgeKey({ x, y }, { x: x + 1, y }))
      if (y < rows) keys.push(edgeKey({ x, y }, { x, y: y + 1 }))
    }
  }
  return keys
}

function pointKey(point: Point) {
  return `${point.x},${point.y}`
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y
}

function isBoundaryPoint(point: Point, columns: number, rows: number) {
  return point.x === 0 || point.x === columns || point.y === 0 || point.y === rows
}

function snapPointToBoundary(point: Point, columns: number, rows: number) {
  const clamped = {
    x: Math.min(columns, Math.max(0, point.x)),
    y: Math.min(rows, Math.max(0, point.y)),
  }
  if (isBoundaryPoint(clamped, columns, rows)) return clamped
  const distances = [
    { x: 0, y: clamped.y, distance: clamped.x },
    { x: columns, y: clamped.y, distance: columns - clamped.x },
    { x: clamped.x, y: 0, distance: clamped.y },
    { x: clamped.x, y: rows, distance: rows - clamped.y },
  ]
  distances.sort((a, b) => a.distance - b.distance)
  return { x: distances[0].x, y: distances[0].y }
}

function hasAnyPath(edges: string[], starts: Point[], ends: Point[]) {
  const edgeSet = new Set(edges)
  const endKeys = new Set(ends.map(pointKey))
  const queue = [...starts]
  const visited = new Set(starts.map(pointKey))
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    if (endKeys.has(pointKey(current))) return true
    const candidates = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]
    for (const next of candidates) {
      const key = edgeKey(current, next)
      if (!edgeSet.has(key)) continue
      const id = pointKey(next)
      if (visited.has(id)) continue
      visited.add(id)
      queue.push(next)
    }
  }
  return false
}

function normalizeShapeCells(cells: Point[]) {
  if (cells.length === 0) return [{ x: 0, y: 0 }]
  const minX = Math.min(...cells.map((cell) => cell.x))
  const minY = Math.min(...cells.map((cell) => cell.y))
  return cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
}

function makePolyominoShape(cells: Point[]): PolyominoShape {
  const normalized = normalizeShapeCells(cells)
  return {
    id: `custom-poly-${normalized.map((cell) => `${cell.x}.${cell.y}`).join('-')}`,
    size: normalized.length,
    cells: normalized,
  }
}

function isCellKind(kind: TileKind): kind is CellSymbolKind {
  return kind !== 'gap-line' && kind !== 'hexagon'
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<BuilderState>
    const rows = clampSize(Number(parsed.rows ?? DEFAULT_STATE.rows))
    const columns = clampSize(Number(parsed.columns ?? DEFAULT_STATE.columns))
    return {
      ...DEFAULT_STATE,
      ...parsed,
      rows,
      columns,
      startPoints: (parsed.startPoints?.length ? parsed.startPoints : DEFAULT_STATE.startPoints)
        .map((point) => ({ x: Math.min(columns, Math.max(0, point.x)), y: Math.min(rows, Math.max(0, point.y)) })),
      endPoints: (parsed.endPoints?.length ? parsed.endPoints : DEFAULT_STATE.endPoints)
        .map((point) => snapPointToBoundary(point, columns, rows)),
      removedEdges: parsed.removedEdges ?? [],
      hexTargets: parsed.hexTargets ?? [],
      cellSymbols: parsed.cellSymbols ?? [],
      polyCells: parsed.polyCells?.length ? parsed.polyCells : DEFAULT_STATE.polyCells,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function getActiveKindsForBuilder(state: BuilderState) {
  const kinds = new Set<TileKind>()
  if (state.removedEdges.length > 0) kinds.add('gap-line')
  if (state.hexTargets.length > 0) kinds.add('hexagon')
  for (const symbol of state.cellSymbols) {
    kinds.add(symbol.kind)
    if (symbol.kind === 'negative-polyomino') kinds.add('polyomino')
    if (symbol.kind === 'rotated-negative-polyomino') kinds.add('rotated-polyomino')
  }
  if (kinds.size === 0) kinds.add('gap-line')
  return Array.from(kinds)
}

function buildSymbolsByKind(state: BuilderState): ForcedSymbolGroups {
  const grouped: ForcedSymbolGroups = {
    forcedArrowTargets: [],
    forcedColorSquares: [],
    forcedStarTargets: [],
    forcedTriangleTargets: [],
    forcedDotTargets: [],
    forcedDiamondTargets: [],
    forcedChevronTargets: [],
    forcedMinesweeperTargets: [],
    forcedWaterDropletTargets: [],
    forcedCardinalTargets: [],
    forcedSpinnerTargets: [],
    forcedSentinelTargets: [],
    forcedGhostTargets: [],
    forcedCrystalTargets: [],
    forcedChipTargets: [],
    forcedDiceTargets: [],
    forcedBlackHoleTargets: [],
    forcedOpenPentagonTargets: [],
    forcedEyeTargets: [],
    forcedTallyTargets: [],
    forcedCompassTargets: [],
    forcedPolyominoSymbols: [],
    forcedNegatorTargets: [],
  }
  const polyShape = makePolyominoShape(state.polyCells)
  for (const symbol of state.cellSymbols) {
    const color = resolveColor(symbol.kind, symbol.color)
    const base = { cellX: symbol.cellX, cellY: symbol.cellY, color }
    const count4 = (symbol.variant % 4) + 1 as 1 | 2 | 3 | 4
    const count3 = (symbol.variant % 3) + 1 as 1 | 2 | 3
    const arrow = arrowVariant(symbol.variant)
    const chevron = chevronVariant(symbol.variant)
    const direction4 = DIRECTION_4[symbol.variant % DIRECTION_4.length]
    if (symbol.kind === 'arrows') grouped.forcedArrowTargets.push({ ...base, direction: arrow.direction, count: arrow.count })
    else if (symbol.kind === 'color-squares') grouped.forcedColorSquares.push(base)
    else if (symbol.kind === 'stars') grouped.forcedStarTargets.push(base)
    else if (symbol.kind === 'triangles') grouped.forcedTriangleTargets.push({ ...base, count: count3 })
    else if (symbol.kind === 'dots') grouped.forcedDotTargets.push({ ...base, count: count4 })
    else if (symbol.kind === 'diamonds') grouped.forcedDiamondTargets.push({ ...base, count: count4 })
    else if (symbol.kind === 'chevrons') grouped.forcedChevronTargets.push({ ...base, direction: chevron.direction, count: chevron.count })
    else if (symbol.kind === 'minesweeper-numbers') grouped.forcedMinesweeperTargets.push({ ...base, value: (symbol.variant % 9) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 })
    else if (symbol.kind === 'water-droplet') grouped.forcedWaterDropletTargets.push({ ...base, direction: direction4 })
    else if (symbol.kind === 'cardinal') grouped.forcedCardinalTargets.push(base)
    else if (symbol.kind === 'spinner') grouped.forcedSpinnerTargets.push({ ...base, direction: symbol.variant % 2 === 0 ? 'clockwise' : 'counterclockwise' })
    else if (symbol.kind === 'sentinel') grouped.forcedSentinelTargets.push({ ...base, direction: direction4 })
    else if (symbol.kind === 'ghost') grouped.forcedGhostTargets.push(base)
    else if (symbol.kind === 'crystals') grouped.forcedCrystalTargets.push(base)
    else if (symbol.kind === 'chips') grouped.forcedChipTargets.push(base)
    else if (symbol.kind === 'dice') grouped.forcedDiceTargets.push({ ...base, value: ((symbol.variant % 9) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 })
    else if (symbol.kind === 'black-holes') grouped.forcedBlackHoleTargets.push(base)
    else if (symbol.kind === 'open-pentagons') grouped.forcedOpenPentagonTargets.push(base)
    else if (symbol.kind === 'eyes') grouped.forcedEyeTargets.push({ ...base, direction: direction4 })
    else if (symbol.kind === 'tally-marks') grouped.forcedTallyTargets.push({ ...base, count: (symbol.variant % 25) + 1 })
    else if (symbol.kind === 'compasses') grouped.forcedCompassTargets.push({ ...base, rotation: (symbol.variant % 4) as 0 | 1 | 2 | 3, mirrored: symbol.variant % 8 >= 4 })
    else if (symbol.kind === 'polyomino') grouped.forcedPolyominoSymbols.push({ ...base, shape: polyShape, rotatable: false, negative: false })
    else if (symbol.kind === 'rotated-polyomino') grouped.forcedPolyominoSymbols.push({ ...base, shape: polyShape, rotatable: true, negative: false })
    else if (symbol.kind === 'negative-polyomino') grouped.forcedPolyominoSymbols.push({ ...base, shape: polyShape, rotatable: false, negative: true })
    else if (symbol.kind === 'rotated-negative-polyomino') grouped.forcedPolyominoSymbols.push({ ...base, shape: polyShape, rotatable: true, negative: true })
    else if (symbol.kind === 'negator') grouped.forcedNegatorTargets.push(base)
  }
  return grouped
}

function CustomPuzzleBuilder({ tiles, onBack, onPlay }: CustomPuzzleBuilderProps) {
  const [builder, setBuilder] = useState<BuilderState>(() => loadState())
  const [mode, setMode] = useState<PlacementMode>('symbol')
  const [variantPickerKind, setVariantPickerKind] = useState<TileKind | null>(null)
  const rows = builder.rows
  const columns = builder.columns

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(builder))
  }, [builder])

  const removedEdges = useMemo(() => new Set(builder.removedEdges), [builder.removedEdges])
  const activeEdges = useMemo(
    () => buildRectEdgeKeys(columns, rows).filter((key) => !removedEdges.has(key)),
    [columns, rows, removedEdges]
  )
  const selectedTile = builder.selectedKind ? tiles.find((tile) => tile.kind === builder.selectedKind) : null
  const selectedVariantCount = builder.selectedKind ? variantCount(builder.selectedKind) : 1
  const selectedVariant = builder.variantStep % selectedVariantCount
  const activeKinds = useMemo(() => getActiveKindsForBuilder(builder), [builder])
  const activeTiles = activeKinds
    .map((kind) => tiles.find((tile) => tile.kind === kind))
    .filter((tile): tile is Tile => tile !== undefined)
  const hasSameStartEnd = builder.startPoints.some((start) =>
    builder.endPoints.some((end) => samePoint(start, end))
  )
  const hasPath = builder.startPoints.some((start) =>
    builder.endPoints.some((end) => !samePoint(start, end) && hasAnyPath(activeEdges, [start], [end]))
  )

  const updateBuilder = (updater: (current: BuilderState) => BuilderState) => {
    setBuilder((current) => updater(current))
  }

  const setDimension = (kind: 'rows' | 'columns', delta: number) => {
    updateBuilder((current) => {
      const nextRows = kind === 'rows' ? clampSize(current.rows + delta) : current.rows
      const nextColumns = kind === 'columns' ? clampSize(current.columns + delta) : current.columns
      const legalEdges = new Set(buildRectEdgeKeys(nextColumns, nextRows))
      const resizeEndPoint = (point: Point) => {
        const resized = {
          x: point.x === current.columns ? nextColumns : Math.min(point.x, nextColumns),
          y: point.y === current.rows ? nextRows : Math.min(point.y, nextRows),
        }
        return snapPointToBoundary(resized, nextColumns, nextRows)
      }
      return {
        ...current,
        rows: nextRows,
        columns: nextColumns,
        startPoints: current.startPoints.map((point) => ({ x: Math.min(point.x, nextColumns), y: Math.min(point.y, nextRows) })),
        endPoints: current.endPoints.map(resizeEndPoint),
        removedEdges: current.removedEdges.filter((key) => legalEdges.has(key)),
        cellSymbols: current.cellSymbols.filter((symbol) => symbol.cellX < nextColumns && symbol.cellY < nextRows),
        hexTargets: current.hexTargets.filter((target) => target.edgeKey && legalEdges.has(target.edgeKey)),
      }
    })
  }

  const handleSelectKind = (kind: TileKind | null, reverse = false) => {
    updateBuilder((current) => {
      if (kind === current.selectedKind && reverse && kind) {
        const count = variantCount(kind)
        return { ...current, variantStep: (current.variantStep - 1 + count) % count }
      }
      if (kind === current.selectedKind) return current
      return { ...current, selectedKind: kind, variantStep: 0 }
    })
    setVariantPickerKind(kind && variantCount(kind) > 1 ? kind : null)
    setMode('symbol')
  }

  const setSelectedVariant = (kind: TileKind, variant: number) => {
    updateBuilder((current) => ({
      ...current,
      selectedKind: kind,
      variantStep: variant % variantCount(kind),
    }))
    setVariantPickerKind(kind)
    setMode('symbol')
  }

  const clearPuzzle = () => {
    updateBuilder((current) => ({
      ...current,
      startPoints: [{ x: 0, y: current.rows }],
      endPoints: [{ x: current.columns, y: 0 }],
      removedEdges: [],
      hexTargets: [],
      cellSymbols: [],
    }))
  }

  const setPoint = (point: Point) => {
    if (mode !== 'start' && mode !== 'end') return
    if (mode === 'end' && !isBoundaryPoint(point, columns, rows)) return
    updateBuilder((current) => {
      const key = pointKey(point)
      const collection = mode === 'start' ? current.startPoints : current.endPoints
      const exists = collection.some((item) => pointKey(item) === key)
      const nextCollection = exists
        ? collection.filter((item) => pointKey(item) !== key)
        : [...collection, point]
      return mode === 'start'
        ? { ...current, startPoints: nextCollection }
        : { ...current, endPoints: nextCollection }
    })
  }

  const handleHexNodeClick = (point: Point) => {
    if (builder.selectedKind !== 'hexagon' || mode === 'start' || mode === 'end') return false
    updateBuilder((current) => {
      const id = `custom-hex-node-${point.x}-${point.y}`
      const exists = current.hexTargets.some((target) => target.id === id)
      return {
        ...current,
        hexTargets: exists
          ? current.hexTargets.filter((target) => target.id !== id)
          : [...current.hexTargets, { id, kind: 'node', position: point }],
      }
    })
    return true
  }

  const handleEdgeClick = (key: string, a: Point, b: Point) => {
    if (builder.selectedKind === 'gap-line') {
      updateBuilder((current) => {
        const next = new Set(current.removedEdges)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return { ...current, removedEdges: [...next], hexTargets: current.hexTargets.filter((target) => target.edgeKey !== key) }
      })
      return
    }
    if (builder.selectedKind !== 'hexagon') return
    updateBuilder((current) => {
      const exists = current.hexTargets.some((target) => target.edgeKey === key)
      if (exists) return { ...current, hexTargets: current.hexTargets.filter((target) => target.edgeKey !== key) }
      return {
        ...current,
        removedEdges: current.removedEdges.filter((edge) => edge !== key),
        hexTargets: [
          ...current.hexTargets,
          { id: `custom-hex-${key}`, kind: 'edge', edgeKey: key, position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } },
        ],
      }
    })
  }

  const placeCellSymbol = (cellX: number, cellY: number, kind = builder.selectedKind) => {
    if (mode === 'erase') {
      removeCellSymbol(cellX, cellY)
      return
    }
    if (!kind || !isCellKind(kind)) return
    updateBuilder((current) => ({
      ...current,
      cellSymbols: [
        ...current.cellSymbols.filter((symbol) => symbol.cellX !== cellX || symbol.cellY !== cellY),
        {
          id: `${kind}-${cellX}-${cellY}-${Date.now()}`,
          kind,
          cellX,
          cellY,
          color: kind === current.selectedKind ? current.selectedColor : 'default',
          variant: kind === current.selectedKind ? current.variantStep % variantCount(kind) : 0,
        },
      ],
    }))
  }

  const removeCellSymbol = (cellX: number, cellY: number) => {
    updateBuilder((current) => ({
      ...current,
      cellSymbols: current.cellSymbols.filter((symbol) => symbol.cellX !== cellX || symbol.cellY !== cellY),
    }))
  }

  const symbolsByKind = useMemo(() => buildSymbolsByKind(builder), [builder])

  const playConfig = () => {
    onPlay({
      rows,
      columns,
      selectedTiles: activeTiles,
      forcedEdgeKeys: activeEdges,
      forcedStartPoint: builder.startPoints[0] ?? { x: 0, y: rows },
      forcedEndPoint: builder.endPoints[0] ?? { x: columns, y: 0 },
      forcedStartPoints: builder.startPoints.length > 0 ? builder.startPoints : [{ x: 0, y: rows }],
      forcedEndPoints: builder.endPoints.length > 0 ? builder.endPoints : [{ x: columns, y: 0 }],
      viewBoxOverride: { x: -0.6, y: -0.6, w: columns + 1.2, h: rows + 1.2 },
      forcedHexTargets: builder.hexTargets,
      ...symbolsByKind,
    })
  }

  const edgeElements = []
  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      const point = { x, y }
      if (x < columns) edgeElements.push({ key: edgeKey(point, { x: x + 1, y }), a: point, b: { x: x + 1, y } })
      if (y < rows) edgeElements.push({ key: edgeKey(point, { x, y: y + 1 }), a: point, b: { x, y: y + 1 } })
    }
  }

  return (
    <div className="app custom-builder">
      <header className="builder-header">
        <button className="back-button" onClick={onBack} aria-label="Back"><span aria-hidden="true">&lt;</span></button>
        <div>
          <p className="eyebrow">Custom Puzzles</p>
          <h1>Puzzle Builder</h1>
          <p className="subtitle">Build, test, solve, go back, keep editing.</p>
        </div>
      </header>

      <main className="builder-layout">
        <aside className="builder-panel">
          <section className="builder-control-group compact">
            <p className="selection-title">Grid</p>
            <Stepper label="Rows" value={rows} onMinus={() => setDimension('rows', -1)} onPlus={() => setDimension('rows', 1)} />
            <Stepper label="Columns" value={columns} onMinus={() => setDimension('columns', -1)} onPlus={() => setDimension('columns', 1)} />
          </section>

          <section className="builder-control-group compact">
            <p className="selection-title">Tool</p>
            <div className="builder-segmented four">
              {(['symbol', 'start', 'end', 'erase'] as PlacementMode[]).map((tool) => (
                <button key={tool} type="button" className={mode === tool ? 'active' : ''} onClick={() => setMode(tool)}>
                  {tool}
                </button>
              ))}
            </div>
          </section>

          <section className="builder-control-group compact">
            <p className="selection-title">Color</p>
            <div className="builder-color-row">
              <button
                type="button"
                className={`builder-default-color ${builder.selectedColor === 'default' ? 'selected' : ''}`}
                aria-label="Use default symbol color"
                onClick={() => updateBuilder((current) => ({ ...current, selectedColor: 'default' }))}
              >
                D
              </button>
              <div className="builder-swatches">
              {BUILDER_COLORS.filter((color) => color !== 'default').map((color) => (
                <button
                  key={color}
                  type="button"
                  className={color === builder.selectedColor ? 'selected' : ''}
                  style={{ background: color }}
                  aria-label={`Use ${color}`}
                  onClick={() => updateBuilder((current) => ({ ...current, selectedColor: color }))}
                />
              ))}
              </div>
            </div>
          </section>

          <section className="builder-control-group compact">
            <p className="selection-title">Polyomino</p>
            <div className="poly-editor">
              {Array.from({ length: 25 }, (_, index) => {
                const x = index % 5
                const y = Math.floor(index / 5)
                const active = builder.polyCells.some((cell) => cell.x === x && cell.y === y)
                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    className={active ? 'active' : ''}
                    onClick={() => updateBuilder((current) => {
                      if (active && current.polyCells.length > 1) {
                      return { ...current, polyCells: current.polyCells.filter((cell) => cell.x !== x || cell.y !== y) }
                      }
                      if (active) return current
                      return { ...current, polyCells: [...current.polyCells, { x, y }] }
                    })}
                  />
                )
              })}
            </div>
          </section>
        </aside>

        <section className="builder-board-panel">
          <div className={`builder-status ${hasPath ? '' : 'problem'}`}>
            {hasPath ? 'At least one start can reach one end.' : hasSameStartEnd ? 'Start and end overlap.' : 'No start can currently reach an end.'}
          </div>
          <svg className="builder-board" viewBox={`-0.75 -0.75 ${columns + 1.5} ${rows + 1.5}`}>
            <rect className="builder-board-bg" x={-0.45} y={-0.45} width={columns + 0.9} height={rows + 0.9} rx={0.35} />
            {Array.from({ length: rows * columns }, (_, index) => {
              const cellX = index % columns
              const cellY = Math.floor(index / columns)
              const symbol = builder.cellSymbols.find((item) => item.cellX === cellX && item.cellY === cellY)
              return (
                <g key={`cell-${cellX}-${cellY}`}>
                  <rect
                    className="builder-cell"
                    x={cellX}
                    y={cellY}
                    width={1}
                    height={1}
                    onClick={() => placeCellSymbol(cellX, cellY)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      removeCellSymbol(cellX, cellY)
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      const kind = event.dataTransfer.getData('text/plain') as TileKind
                      placeCellSymbol(cellX, cellY, kind)
                    }}
                  />
                  {symbol && <PlacedSymbolIcon symbol={symbol} polyCells={builder.polyCells} />}
                </g>
              )
            })}
            {edgeElements.map(({ key, a, b }) => {
              const hex = builder.hexTargets.some((target) => target.edgeKey === key)
              return (
                <g key={key} onClick={() => handleEdgeClick(key, a, b)}>
                  <line className="builder-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  <line className="builder-edge-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  {hex && <polygon className="builder-hex-dot" points={hexPoints({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 0.105)} />}
                </g>
              )
            })}
            {edgeElements.map(({ key, a, b }) => {
              if (!removedEdges.has(key)) return null
              const midX = (a.x + b.x) / 2
              const midY = (a.y + b.y) / 2
              const half = GAP_SIZE / 2
              return (
                <rect
                  key={`gap-${key}`}
                  className="builder-gap"
                  x={midX - half}
                  y={midY - half}
                  width={GAP_SIZE}
                  height={GAP_SIZE}
                  rx={0.05}
                />
              )
            })}
            {Array.from({ length: (rows + 1) * (columns + 1) }, (_, index) => {
              const x = index % (columns + 1)
              const y = Math.floor(index / (columns + 1))
              const isStart = builder.startPoints.some((point) => point.x === x && point.y === y)
              const isEnd = builder.endPoints.some((point) => point.x === x && point.y === y)
              return (
                <g key={`node-${x}-${y}`} onClick={() => {
                  if (handleHexNodeClick({ x, y })) return
                  setPoint({ x, y })
                }}>
                  <circle className={`builder-node ${isStart ? 'start-node' : ''}`} cx={x} cy={y} r={isStart ? 0.24 : 0.085} />
                  {isEnd && <EndCap x={x} y={y} columns={columns} rows={rows} />}
                  {builder.hexTargets.some((target) => target.kind === 'node' && target.position.x === x && target.position.y === y) && (
                    <polygon className="builder-hex-dot" points={hexPoints({ x, y }, 0.12)} />
                  )}
                  <circle className="builder-node-hit" cx={x} cy={y} r={0.22} />
                </g>
              )
            })}
          </svg>
          <div className="builder-actions">
            <button type="button" className="btn ghost" onClick={clearPuzzle}>Clear puzzle</button>
            <button type="button" className="btn primary" onClick={playConfig} disabled={!hasPath}>Play / Solve</button>
          </div>
        </section>

        <aside className="builder-symbol-palette">
          <div className="builder-palette-header">
            <p className="selection-title">Symbols</p>
            <p>{selectedTile?.label ?? 'Pick a symbol'} {selectedVariantCount > 1 ? `${selectedVariant + 1}/${selectedVariantCount}` : ''}</p>
          </div>
          <div className="builder-symbol-grid">
            {tiles.map((tile) => {
              const isSelected = builder.selectedKind === tile.kind
              const showPicker = variantPickerKind === tile.kind && isCellKind(tile.kind) && variantCount(tile.kind) > 1
              return (
                <div className={`builder-symbol-slot ${showPicker ? 'picker-open' : ''}`} key={tile.kind}>
                  <button
                    type="button"
                    draggable
                    className={`builder-symbol-button ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectKind(tile.kind)}
                    onMouseEnter={() => {
                      if (isCellKind(tile.kind) && variantCount(tile.kind) > 1) setVariantPickerKind(tile.kind)
                    }}
                    onFocus={() => {
                      if (isCellKind(tile.kind) && variantCount(tile.kind) > 1) setVariantPickerKind(tile.kind)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      handleSelectKind(tile.kind, true)
                    }}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', tile.kind)}
                    aria-label={tile.label}
                  >
                    <BuilderPaletteSymbol
                    kind={tile.kind}
                    variant={isSelected ? selectedVariant : 0}
                    color={isSelected ? builder.selectedColor : 'default'}
                    polyCells={builder.polyCells}
                    />
                    <span>{tile.label}</span>
                  </button>
                  {showPicker && (
                    <VariantPicker
                      kind={tile.kind as CellSymbolKind}
                      selectedVariant={builder.selectedKind === tile.kind ? selectedVariant : 0}
                      selectedColor={builder.selectedKind === tile.kind ? builder.selectedColor : 'default'}
                      polyCells={builder.polyCells}
                      onSelect={(variant) => setSelectedVariant(tile.kind, variant)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </aside>
      </main>
    </div>
  )
}

function BuilderPaletteSymbol({
  kind,
  variant,
  color,
  polyCells,
}: {
  kind: TileKind
  variant: number
  color: ColorChoice
  polyCells: Point[]
}) {
  if (kind === 'gap-line') {
    return (
      <svg className="builder-palette-symbol builder-gap-preview" viewBox="0 0 100 100" aria-hidden="true">
        <rect x={14} y={40} width={28} height={14} rx={0} />
        <rect x={58} y={40} width={28} height={14} rx={0} />
      </svg>
    )
  }

  if (!isCellKind(kind)) {
    return (
      <span className="builder-palette-symbol fallback">
        <SymbolTile kind={kind} />
      </span>
    )
  }

  return (
    <svg className="builder-palette-symbol" viewBox="0 0 1 1" aria-hidden="true">
      <PlacedSymbolIcon
        symbol={{
          id: `palette-${kind}`,
          kind,
          cellX: 0,
          cellY: 0,
          color,
          variant,
        }}
        polyCells={polyCells}
      />
    </svg>
  )
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="stepper-row">
      <span>{label}</span>
      <button type="button" onClick={onMinus}>-</button>
      <strong>{value}</strong>
      <button type="button" onClick={onPlus}>+</button>
    </div>
  )
}

function VariantPicker({
  kind,
  selectedVariant,
  selectedColor,
  polyCells,
  onSelect,
}: {
  kind: CellSymbolKind
  selectedVariant: number
  selectedColor: ColorChoice
  polyCells: Point[]
  onSelect: (variant: number) => void
}) {
  const count = variantCount(kind)

  return (
    <section className="builder-variant-picker" aria-label={`${kind} variants`}>
      <div className="builder-variant-picker-header">
        <span>Variants</span>
        <strong>{variantLabel(kind, selectedVariant)}</strong>
      </div>
      <div
        className="builder-variant-grid"
        style={{ '--variant-columns': variantColumnCount(kind) } as CSSProperties}
      >
        {Array.from({ length: count }, (_, variant) => (
          <button
            key={`${kind}-${variant}`}
            type="button"
            className={variant === selectedVariant ? 'selected' : ''}
            onClick={() => onSelect(variant)}
            aria-label={`${kind} ${variantLabel(kind, variant) || variant + 1}`}
          >
            <BuilderPaletteSymbol kind={kind} variant={variant} color={selectedColor} polyCells={polyCells} />
            <span>{variantLabel(kind, variant) || variant + 1}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function variantColumnCount(kind: CellSymbolKind) {
  if (kind === 'minesweeper-numbers' || kind === 'dice') return 3
  if (kind === 'arrows' || kind === 'chevrons') return 8
  if (kind === 'tally-marks') return 10
  if (kind === 'triangles') return 3
  if (kind === 'dots' || kind === 'diamonds' || kind === 'water-droplet' || kind === 'sentinel' || kind === 'eyes') return 4
  if (kind === 'compasses') return 4
  return 3
}

function PlacedSymbolIcon({ symbol, polyCells }: { symbol: PlacedCellSymbol; polyCells: Point[] }) {
  const color = resolveColor(symbol.kind, symbol.color)
  const cx = symbol.cellX + 0.5
  const cy = symbol.cellY + 0.5
  const count4 = (symbol.variant % 4) + 1 as 1 | 2 | 3 | 4
  const count3 = (symbol.variant % 3) + 1 as 1 | 2 | 3
  const direction4 = DIRECTION_4[symbol.variant % DIRECTION_4.length]

  if (symbol.kind === 'color-squares') {
    return <rect className="color-square builder-symbol-render" x={cx - 0.17} y={cy - 0.17} width={0.34} height={0.34} rx={0.08} style={{ fill: color }} />
  }
  if (symbol.kind === 'stars') {
    return <polygon className="star builder-symbol-render" points={starPoints({ x: cx, y: cy }, 0.19, 0.135)} style={{ fill: color }} />
  }
  if (symbol.kind === 'triangles') {
    const offsets = count3 === 1 ? [0] : count3 === 2 ? [-0.095, 0.095] : [-0.165, 0, 0.165]
    return <g className="builder-symbol-render">{offsets.map((offset) => <polygon key={offset} className="triangle-target" points={trianglePoints(cx + offset, cy, 0.082)} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'dots') {
    const positions = symbolCountPositions(count4, 0.1, 0.2)
    return <g className="builder-symbol-render">{positions.map((offset, index) => <circle key={index} className="dot-target" cx={cx + offset.x} cy={cy + offset.y} r={0.085} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'diamonds') {
    const positions = symbolCountPositions(count4, 0.11, 0.2)
    return <g className="builder-symbol-render">{positions.map((offset, index) => <polygon key={index} className="diamond-target" points={diamondPoints(cx + offset.x, cy + offset.y, 0.09)} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'minesweeper-numbers') {
    const pixels = minesweeperDigitPixels((symbol.variant % 9) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8)
    const unit = 0.05
    const x = cx - (5 * unit) / 2
    const y = cy - (7 * unit) / 2
    return <g className="builder-symbol-render">{pixels.map((pixel, index) => <rect key={index} className="mine-number-fill" x={x + pixel.x * unit} y={y + pixel.y * unit} width={unit} height={unit} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'arrows') {
    const arrow = arrowVariant(symbol.variant)
    const headOffsets = Array.from({ length: arrow.count }, (_, index) => (arrow.count === 1 ? 0 : -0.08 + index * 0.08))
    const shaftEndX = 0.11 + headOffsets[headOffsets.length - 1] - 0.06
    return (
      <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) rotate(${arrowDirectionAngle(arrow.direction)})`}>
        <line className="arrow-shaft" x1={-0.24} y1={0} x2={shaftEndX} y2={0} style={{ stroke: color, strokeWidth: 0.064 }} />
        {headOffsets.map((offset, index) => <polyline key={index} className="arrow-head" points={`${-0.09 + offset},-0.2 ${0.11 + offset},0 ${-0.09 + offset},0.2`} style={{ stroke: color, strokeWidth: 0.052 }} />)}
      </g>
    )
  }
  if (symbol.kind === 'chevrons') {
    const chevron = chevronVariant(symbol.variant)
    const offsets = chevron.count === 1 ? [0] : chevron.count === 2 ? [-0.09, 0.09] : [-0.18, 0, 0.18]
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) rotate(${chevronDirectionAngle(chevron.direction)})`}>{offsets.map((offset) => <polygon key={offset} className="chevron-target" points={chevronPoints(offset, 0, 0.122)} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'water-droplet') {
    return <path className="water-droplet builder-symbol-render" transform={`translate(${cx} ${cy}) rotate(${waterDropletDirectionAngle(direction4)}) translate(0 -0.055)`} d="M 0 -0.2 C 0.17 -0.07 0.24 0.07 0.16 0.2 C 0.09 0.31 -0.09 0.31 -0.16 0.2 C -0.24 0.07 -0.17 -0.07 0 -0.2 Z" style={{ fill: color }} />
  }
  if (symbol.kind === 'spinner') {
    const direction = symbol.variant % 2 === 0 ? 'clockwise' : 'counterclockwise'
    return (
      <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) scale(0.0086) translate(-50 -50)`}>
        <g transform={spinnerDirectionScaleX(direction) < 0 ? 'translate(100 0) scale(-1 1)' : undefined}>
          <circle className="tile-spinner-ring" cx="50" cy="50" r="28" pathLength="100" strokeDasharray="86 14" transform="rotate(-10 50 50)" style={{ stroke: color }} />
          <polygon className="tile-spinner-head" points="62.8,22.6 69.1,30.7 59.6,29.3" style={{ stroke: color }} />
        </g>
      </g>
    )
  }
  if (symbol.kind === 'sentinel') {
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) rotate(${sentinelDirectionAngle(direction4)})`}><path className="sentinel-arc" d="M -0.17 0.095 A 0.17 0.17 0 0 1 0.17 0.095" style={{ stroke: color }} /><path className="sentinel-core" d="M -0.058 0.095 A 0.058 0.058 0 0 1 0.058 0.095 Z" style={{ fill: color }} /></g>
  }
  if (symbol.kind === 'dice') {
    const pips = dicePipOffsets((symbol.variant % 9) + 1)
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) rotate(-4)`}><rect className="dice-face" x={-0.16} y={-0.16} width={0.32} height={0.32} style={{ stroke: color }} />{pips.map((offset, index) => <circle key={index} className="dice-pip" cx={offset.x} cy={offset.y} r={0.022} style={{ fill: color }} />)}</g>
  }
  if (symbol.kind === 'open-pentagons') {
    return <polyline className="open-pentagon-line builder-symbol-render" points={openPentagonPoints(cx, cy, 0.33)} style={{ stroke: color }} />
  }
  if (symbol.kind === 'black-holes') {
    return (
      <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}>
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path className="black-hole-arm" d="M 0 0 C 0.045 -0.01 0.085 -0.046 0.098 -0.096 C 0.113 -0.145 0.095 -0.192 0.052 -0.212" style={{ stroke: color }} />
          </g>
        ))}
        <circle className="black-hole-center" cx={0} cy={0} r={0.067} style={{ fill: color }} />
      </g>
    )
  }
  if (symbol.kind === 'chips') {
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}><path className="chip-shell" d={rosettePath(0, 0, 0.165, 0.036, 6, Math.PI)} style={{ fill: color }} /><path className="chip-hole" d={rosettePath(0, 0, 0.082, 0.018, 6, Math.PI)} /></g>
  }
  if (symbol.kind === 'crystals') {
    return (
      <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) scale(0.72)`}>
        <polygon className="crystal-face" points="0,-0.34 -0.22,-0.2 -0.12,-0.08 0,-0.19" style={{ fill: color }} />
        <polygon className="crystal-face" points="0,-0.34 0.22,-0.2 0.12,-0.08 0,-0.19" style={{ fill: color }} />
        <polygon className="crystal-face" points="-0.22,-0.2 -0.12,-0.08 -0.12,0.08 -0.22,0.2" style={{ fill: color }} />
        <polygon className="crystal-face" points="0.22,-0.2 0.12,-0.08 0.12,0.08 0.22,0.2" style={{ fill: color }} />
        <polygon className="crystal-face" points="0,-0.19 -0.12,-0.08 -0.12,0.08 0,0.19" style={{ fill: color }} />
        <polygon className="crystal-face" points="0,-0.19 0.12,-0.08 0.12,0.08 0,0.19" style={{ fill: color }} />
        <polygon className="crystal-face" points="-0.22,0.2 -0.12,0.08 0,0.19 0,0.34" style={{ fill: color }} />
        <polygon className="crystal-face" points="0.22,0.2 0.12,0.08 0,0.19 0,0.34" style={{ fill: color }} />
      </g>
    )
  }
  if (symbol.kind === 'ghost') {
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy}) scale(0.0062) translate(-50 -48)`}><path className="ghost-body" d="M 16 80 L 24 34 C 28 20 38 12 50 12 C 62 12 72 20 76 34 L 84 80 L 68 72 L 58 84 L 50 74 L 42 84 L 32 72 Z" style={{ fill: color }} /><circle className="ghost-eye" cx={37} cy={45} r={5.3} /><circle className="ghost-eye" cx={63} cy={45} r={5.3} /></g>
  }
  if (symbol.kind === 'eyes') {
    const pupilOffset = eyePupilOffset(direction4)
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}><polygon className="eye-outline" points={eyeDiamondPoints(0, 0, 0.188)} style={{ stroke: color }} /><circle className="eye-pupil" cx={pupilOffset.x} cy={pupilOffset.y} r={0.028} style={{ fill: color }} /></g>
  }
  if (symbol.kind === 'compasses') {
    const rotation = (symbol.variant % 4) * 90
    const mirrored = symbol.variant % 8 >= 4
    const eastX = mirrored ? -0.23 : 0.23
    const westX = mirrored ? 0.23 : -0.23
    return (
      <g className="builder-symbol-render">
        <g transform={`translate(${cx} ${cy}) rotate(${rotation}) ${mirrored ? 'scale(-1 1)' : ''}`}>
          <circle className="compass-ring" cx={0} cy={0} r={0.205} style={{ stroke: color }} />
          <circle className="compass-dot" cx={0} cy={0} r={0.02} style={{ fill: color }} />
        </g>
        <g transform={`translate(${cx} ${cy}) rotate(${rotation})`}>
          <polygon className="compass-north-tip" points="0,-0.282 0.038,-0.214 -0.038,-0.214" style={{ fill: color }} />
          <text className="compass-label" x={0} y={-0.122} textAnchor="middle" dominantBaseline="middle" style={{ fill: color }}>N</text>
          <text className="compass-label" x={eastX * 0.56} y={0.01} textAnchor="middle" dominantBaseline="middle" style={{ fill: color }}>E</text>
          <text className="compass-label" x={0} y={0.132} textAnchor="middle" dominantBaseline="middle" style={{ fill: color }}>S</text>
          <text className="compass-label" x={westX * 0.56} y={0.01} textAnchor="middle" dominantBaseline="middle" style={{ fill: color }}>W</text>
        </g>
      </g>
    )
  }
  if (symbol.kind === 'tally-marks') {
    const segments = tallyMarkSegments((symbol.variant % 25) + 1, 0.2, 0.062, -0.18, 0.18)
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}>{segments.map((segment, index) => <line key={index} className="tally-mark-line" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} style={{ stroke: color }} />)}</g>
  }
  if (symbol.kind === 'cardinal') {
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}><rect className="cardinal-body" x={-0.04} y={-0.146} width={0.08} height={0.11} rx={0.03} style={{ fill: color }} /><rect className="cardinal-body" x={-0.04} y={0.036} width={0.08} height={0.11} rx={0.03} style={{ fill: color }} /><rect className="cardinal-body" x={-0.146} y={-0.04} width={0.11} height={0.08} rx={0.03} style={{ fill: color }} /><rect className="cardinal-body" x={0.036} y={-0.04} width={0.11} height={0.08} rx={0.03} style={{ fill: color }} /><polyline className="cardinal-chevron" points="-0.085,-0.164 0,-0.248 0.085,-0.164" style={{ stroke: color }} /><polyline className="cardinal-chevron" points="0.164,-0.085 0.248,0 0.164,0.085" style={{ stroke: color }} /><polyline className="cardinal-chevron" points="0.085,0.164 0,0.248 -0.085,0.164" style={{ stroke: color }} /><polyline className="cardinal-chevron" points="-0.164,0.085 -0.248,0 -0.164,-0.085" style={{ stroke: color }} /></g>
  }
  if (symbol.kind === 'negator') {
    return <g className="builder-symbol-render" transform={`translate(${cx} ${cy})`}><line className="negator-arm" x1="0" y1="0" x2="0" y2="-0.16" style={{ stroke: color }} /><line className="negator-arm" x1="0" y1="0" x2="0.14" y2="0.085" style={{ stroke: color }} /><line className="negator-arm" x1="0" y1="0" x2="-0.14" y2="0.085" style={{ stroke: color }} /></g>
  }
  if (symbol.kind.includes('polyomino')) {
    const shape = makePolyominoShape(polyCells)
    const bounds = shapeBounds(shape.cells)
    const unit = 0.145
    const negative = symbol.kind.includes('negative')
    const gap = negative ? 0.056 : 0.036
    const block = unit - gap
    const offsetX = cx - (bounds.width * unit) / 2
    const offsetY = cy - (bounds.height * unit) / 2
    return <g className="builder-symbol-render" transform={symbol.kind.includes('rotated') ? `rotate(12 ${cx} ${cy})` : undefined}>{shape.cells.map((cell, index) => <rect key={index} className={`polyomino-block ${negative ? 'negative' : ''}`} x={offsetX + (cell.x - bounds.minX) * unit + gap / 2} y={offsetY + (cell.y - bounds.minY) * unit + gap / 2} width={block} height={block} style={negative ? { stroke: color } : { fill: color }} />)}</g>
  }

  return (
    <text className="builder-symbol-text builder-symbol-render" x={cx} y={cy} style={{ fill: color }}>
      {fallbackSymbolLabel(symbol.kind)}
    </text>
  )
}

function symbolCountPositions(count: number, pairOffset: number, tripleOffset: number) {
  if (count === 1) return [{ x: 0, y: 0 }]
  if (count === 2) return [{ x: -pairOffset, y: 0 }, { x: pairOffset, y: 0 }]
  if (count === 3) return [{ x: -tripleOffset, y: 0 }, { x: 0, y: 0 }, { x: tripleOffset, y: 0 }]
  return [{ x: -pairOffset, y: -pairOffset }, { x: pairOffset, y: -pairOffset }, { x: -pairOffset, y: pairOffset }, { x: pairOffset, y: pairOffset }]
}

function trianglePoints(centerX: number, centerY: number, size: number) {
  const halfWidth = size * 0.9
  return `${centerX},${centerY - size} ${centerX - halfWidth},${centerY + size * 0.72} ${centerX + halfWidth},${centerY + size * 0.72}`
}

function diamondPoints(centerX: number, centerY: number, radius: number) {
  return `${centerX},${centerY - radius} ${centerX + radius},${centerY} ${centerX},${centerY + radius} ${centerX - radius},${centerY}`
}

function chevronPoints(centerX: number, centerY: number, size: number) {
  const halfHeight = size * 1.05
  const tailX = centerX - size * 0.95
  const shoulderX = centerX + size * 0.12
  const tipX = centerX + size - 0.01
  const notchX = centerX - size * 0.25
  return `${tailX},${centerY - halfHeight} ${shoulderX},${centerY - halfHeight} ${tipX},${centerY} ${shoulderX},${centerY + halfHeight} ${tailX},${centerY + halfHeight} ${notchX},${centerY}`
}

function openPentagonPoints(centerX: number, centerY: number, size: number) {
  const radius = size * 0.62
  return Array.from({ length: 5 }, (_, index) => 126 + 72 * index)
    .map((angleDeg) => {
      const angle = angleDeg * Math.PI / 180
      return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`
    })
    .join(' ')
}

function eyeDiamondPoints(centerX: number, centerY: number, size: number) {
  const halfWidth = size * 0.98
  const halfHeight = size * 0.64
  return `${centerX - halfWidth},${centerY} ${centerX},${centerY - halfHeight} ${centerX + halfWidth},${centerY} ${centerX},${centerY + halfHeight}`
}

function eyePupilOffset(direction: typeof DIRECTION_4[number]) {
  if (direction === 'left') return { x: -0.056, y: 0 }
  if (direction === 'up') return { x: 0, y: -0.04 }
  if (direction === 'down') return { x: 0, y: 0.04 }
  return { x: 0.056, y: 0 }
}

function rosettePath(centerX: number, centerY: number, baseRadius: number, waveAmplitude: number, waveCount: number, wavePhase = 0) {
  const points = Array.from({ length: 65 }, (_, index) => {
    const theta = (index / 64) * Math.PI * 2
    const radius = baseRadius + waveAmplitude * Math.cos(theta * waveCount + wavePhase)
    return `${centerX + radius * Math.cos(theta)},${centerY + radius * Math.sin(theta)}`
  })
  return `M ${points[0]} L ${points.slice(1).join(' ')} Z`
}

function tallyMarkSegments(count: number, groupWidth: number, groupGap: number, topY: number, bottomY: number) {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  const rowCounts: number[] = []
  let remaining = Math.max(0, Math.floor(count))
  while (remaining > 0) {
    rowCounts.push(Math.min(10, remaining))
    remaining -= 10
  }
  const totalHeight = bottomY - topY
  const rowGap = rowCounts.length > 1 ? totalHeight * 0.2 : 0
  const rowHeight = (totalHeight - rowGap * (rowCounts.length - 1)) / rowCounts.length
  rowCounts.forEach((rowCount, rowIndex) => {
    const fullGroups = Math.floor(rowCount / 5)
    const remainder = rowCount % 5
    const groupCount = fullGroups + (remainder > 0 ? 1 : 0)
    const startX = -(groupCount * groupWidth + (groupCount - 1) * groupGap) / 2
    const rowTop = topY + rowIndex * (rowHeight + rowGap)
    const rowBottom = rowTop + rowHeight
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const markCount = groupIndex < fullGroups ? 4 : remainder
      const withSlash = groupIndex < fullGroups
      const groupX = startX + groupIndex * (groupWidth + groupGap)
      const markSpacing = groupWidth / 3.4
      const marksSpan = (Math.min(4, markCount) - 1) * markSpacing
      const firstX = groupX + (groupWidth - marksSpan) / 2
      for (let markIndex = 0; markIndex < Math.min(4, markCount); markIndex += 1) {
        const x = firstX + markIndex * markSpacing
        segments.push({ x1: x, y1: rowTop, x2: x, y2: rowBottom })
      }
      if (withSlash) segments.push({ x1: groupX + groupWidth * 0.02, y1: rowBottom, x2: groupX + groupWidth * 0.98, y2: rowTop })
    }
  })
  return segments
}

function dicePipOffsets(value: number) {
  const tl = { x: -0.078, y: -0.078 }
  const tc = { x: 0, y: -0.078 }
  const tr = { x: 0.078, y: -0.078 }
  const ml = { x: -0.078, y: 0 }
  const c = { x: 0, y: 0 }
  const mr = { x: 0.078, y: 0 }
  const bl = { x: -0.078, y: 0.078 }
  const bc = { x: 0, y: 0.078 }
  const br = { x: 0.078, y: 0.078 }
  if (value <= 1) return [c]
  if (value === 2) return [tl, br]
  if (value === 3) return [tl, c, br]
  if (value === 4) return [tl, tr, bl, br]
  if (value === 5) return [tl, tr, c, bl, br]
  if (value === 6) return [tl, tr, ml, mr, bl, br]
  if (value === 7) return [tl, tr, ml, c, mr, bl, br]
  if (value === 8) return [tl, tc, tr, ml, mr, bl, bc, br]
  return [tl, tc, tr, ml, c, mr, bl, bc, br]
}

function fallbackSymbolLabel(kind: TileKind) {
  if (kind === 'black-holes') return 'BH'
  if (kind === 'chips') return 'C'
  if (kind === 'crystals') return 'X'
  if (kind === 'ghost') return 'G'
  if (kind === 'eyes') return 'E'
  if (kind === 'compasses') return 'N'
  return ''
}

function EndCap({ x, y, columns, rows }: { x: number; y: number; columns: number; rows: number }) {
  const length = 0.24
  const onLeft = x === 0
  const onRight = x === columns
  const onTop = y === 0
  const onBottom = y === rows
  const isCorner = (onLeft || onRight) && (onTop || onBottom)
  const dx = isCorner ? (onLeft ? -length : length) : onLeft ? -length : onRight ? length : 0
  const dy = isCorner ? (onTop ? -length : length) : onTop ? -length : onBottom ? length : 0
  return <line className="builder-end-cap" x1={x} y1={y} x2={x + dx} y2={y + dy} />
}

function variantLabel(kind: TileKind, variant: number) {
  if (kind === 'arrows') {
    const arrow = arrowVariant(variant)
    return `${arrow.count} ${arrow.direction}`
  }
  if (kind === 'chevrons') {
    const chevron = chevronVariant(variant)
    return `${chevron.count} ${chevron.direction}`
  }
  if (kind === 'triangles') return `${(variant % 3) + 1}`
  if (kind === 'dots' || kind === 'diamonds') return `${(variant % 4) + 1}`
  if (kind === 'minesweeper-numbers') return `${variant % 9}`
  if (kind === 'dice') return `${(variant % 9) + 1}`
  if (kind === 'tally-marks') return `${(variant % 25) + 1}`
  if (kind === 'water-droplet' || kind === 'sentinel' || kind === 'eyes') return DIRECTION_4[variant % 4]
  if (kind === 'spinner') return variant % 2 === 0 ? 'cw' : 'ccw'
  if (kind === 'compasses') return `${(variant % 4) * 90}${variant % 8 >= 4 ? ' flip' : ''}`
  return ''
}

export default CustomPuzzleBuilder
