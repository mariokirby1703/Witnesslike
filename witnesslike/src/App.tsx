import { useState } from 'react'
import './App.css'
import HomePage from './HomePage'
import type { Tile, TileKind } from './HomePage'
import PuzzlePage from './PuzzlePage'

type View = 'home' | 'puzzle'

const ACTIVE_SYMBOLS: Array<{ label: string; description: string; kind: TileKind }> = [
  { label: 'Gaps', description: 'Missing segments block the path and force reroutes.', kind: 'gap-line' },
  { label: 'Hexagons', description: 'Collect every hexagon before finishing the path.', kind: 'hexagon' },
  { label: 'Colored Squares', description: 'Separate colors so no region contains multiple colors.', kind: 'color-squares' },
  { label: 'Stars', description: 'Pair stars by color inside each region.', kind: 'stars' },
  { label: 'Triangles', description: 'Touch each triangle cell edge exactly as many times as shown.', kind: 'triangles' },
  { label: 'Polyominoes', description: 'Outline the exact shape inside the region.', kind: 'polyomino' },
  { label: 'Rotated Polyominoes', description: 'Outline the shape; rotations count, mirrors do not.', kind: 'rotated-polyomino' },
  { label: 'Negative Polyominoes', description: 'Subtract this shape from polyomino solutions.', kind: 'negative-polyomino' },
  {
    label: 'Rotated Negative Polyominoes',
    description: 'Subtract this shape; rotated placement is required.',
    kind: 'rotated-negative-polyomino',
  },
  { label: 'Negators', description: 'Eliminates one symbol in the same region; both then count as removed.', kind: 'negator' },
  { label: 'Arrows', description: 'Cross the ray direction exactly as many times as shown by arrowheads.', kind: 'arrows' },
  {
    label: 'Minesweeper Numbers',
    description: 'A number counts surrounding cells that are separated into other regions.',
    kind: 'minesweeper-numbers',
  },
  {
    label: 'Water Droplets',
    description: 'Catch the flow: water under its heavy side must stay contained inside the grid.',
    kind: 'water-droplet',
  },
  {
    label: 'Cardinal',
    description: 'From the symbol, all four directions must be blocked by the path before the grid edge.',
    kind: 'cardinal',
  },
  {
    label: 'Sentinel',
    description: 'In its facing half-plane, no symbols may appear in the same region.',
    kind: 'sentinel',
  },
  {
    label: 'Spinner',
    description: 'Whenever the path touches this cell border, movement must follow the shown spin direction.',
    kind: 'spinner',
  },
  { label: 'Dots', description: 'Pass through each marked cell corner exactly as many times as shown.', kind: 'dots' },
  { label: 'Diamonds', description: 'Count bends on the four corners of that cell.', kind: 'diamonds' },
  {
    label: 'Chevrons',
    description: 'Count cells in the shown direction that stay in the same region as the symbol.',
    kind: 'chevrons',
  },
  {
    label: 'Ghost',
    description: 'Each ghost needs its own region, and the total region count must equal ghost count.',
    kind: 'ghost',
  },
]

const TOTAL_SYMBOL_FIELDS = 20

const TILES: Tile[] = (() => {
  const activeTiles: Tile[] = ACTIVE_SYMBOLS.map((symbol, index) => ({
    id: index,
    label: symbol.label,
    description: symbol.description,
    kind: symbol.kind,
    active: true,
  }))

  const placeholderCount = Math.max(0, TOTAL_SYMBOL_FIELDS - activeTiles.length)
  const placeholders: Tile[] = Array.from({ length: placeholderCount }, (_, placeholderIndex) => ({
    id: activeTiles.length + placeholderIndex,
    label: 'Placeholder',
    description: 'Coming soon.',
    kind: 'placeholder',
    active: false,
  }))

  return [...activeTiles, ...placeholders]
})()

const NEGATIVE_TILE_ID = TILES.find((tile) => tile.kind === 'negative-polyomino')?.id ?? -1
const ROTATED_NEGATIVE_TILE_ID = TILES.find((tile) => tile.kind === 'rotated-negative-polyomino')?.id ?? -1
const NEGATOR_TILE_ID = TILES.find((tile) => tile.kind === 'negator')?.id ?? -1

function hasPositivePolySelection(ids: number[]) {
  return TILES.some(
    (tile) =>
      ids.includes(tile.id) &&
      (tile.kind === 'polyomino' || tile.kind === 'rotated-polyomino')
  )
}

function hasNegatorPrereqSelection(ids: number[]) {
  return TILES.some(
    (tile) =>
      ids.includes(tile.id) &&
      tile.kind !== 'gap-line' &&
      tile.kind !== 'negator' &&
      tile.kind !== 'placeholder'
  )
}

function App() {
  const [view, setView] = useState<View>('home')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const selectedTiles = TILES.filter((tile) => selectedIds.includes(tile.id))

  if (view === 'home') {
    return (
      <HomePage
        tiles={TILES}
        selectedIds={selectedIds}
        onToggle={(tile) => {
          setSelectedIds((prev) => {
            if (prev.includes(tile.id)) {
              let next = prev.filter((id) => id !== tile.id)
              const removedPositivePoly =
                tile.kind === 'polyomino' || tile.kind === 'rotated-polyomino'
              if (removedPositivePoly && !hasPositivePolySelection(next)) {
                next = next.filter((id) => id !== NEGATIVE_TILE_ID)
                next = next.filter((id) => id !== ROTATED_NEGATIVE_TILE_ID)
              }
              if (tile.kind !== 'negator' && !hasNegatorPrereqSelection(next)) {
                next = next.filter((id) => id !== NEGATOR_TILE_ID)
              }
              return next
            }
            if (
              (tile.kind === 'negative-polyomino' || tile.kind === 'rotated-negative-polyomino') &&
              !hasPositivePolySelection(prev)
            ) {
              return prev
            }
            if (
              tile.kind === 'negator' &&
              !hasNegatorPrereqSelection(prev)
            ) {
              return prev
            }
            if (prev.length >= 4) return prev
            return [...prev, tile.id]
          })
        }}
        onStart={() => {
          if (selectedIds.length === 0) return
          setView('puzzle')
        }}
      />
    )
  }

  return <PuzzlePage selectedTiles={selectedTiles} onBack={() => setView('home')} />
}

export default App
