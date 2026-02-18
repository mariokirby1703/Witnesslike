import { useState } from 'react'
import './App.css'
import HomePage from './HomePage'
import type { Tile } from './HomePage'
import PuzzlePage from './PuzzlePage'

type View = 'home' | 'puzzle'

const TILES: Tile[] = (() => {
  const tiles: Tile[] = []
  for (let index = 0; index < 21; index += 1) {
    tiles.push({
      id: index,
      label:
        index === 0
          ? 'Gaps'
          : index === 1
            ? 'Hexagon'
            : index === 2
              ? 'Color Squares'
              : index === 3
                ? 'Stars'
                : index === 4
                ? 'Polyomino'
                : index === 5
                  ? 'Rotated Polyomino'
                : index === 6
                    ? 'Negative Polyominoes'
                    : index === 7
                      ? 'Triangles'
                : 'Placeholder',
      description:
        index === 0
          ? 'Missing segments block the path and force reroutes.'
          : index === 1
            ? 'Collect every hexagon before finishing the path.'
            : index === 2
              ? 'Separate colors so no region contains multiple colors.'
              : index === 3
                ? 'Pair stars by color inside each region.'
                : index === 4
                ? 'Outline the exact shape inside the region.'
                : index === 5
                  ? 'Outline the shape; rotations count, mirrors do not.'
                : index === 6
                    ? 'Subtract this shape from polyomino solutions.'
                    : index === 7
                      ? 'Touch each triangle cell edge exactly as many times as shown.'
                : 'Coming soon.',
      kind:
        index === 0
          ? 'gap-line'
          : index === 1
            ? 'hexagon'
            : index === 2
              ? 'color-squares'
              : index === 3
                ? 'stars'
                : index === 4
                ? 'polyomino'
                : index === 5
                  ? 'rotated-polyomino'
                : index === 6
                    ? 'negative-polyomino'
                    : index === 7
                      ? 'triangles'
                : 'placeholder',
      active:
        index === 0 ||
        index === 1 ||
        index === 2 ||
        index === 3 ||
        index === 4 ||
        index === 5 ||
        index === 6 ||
        index === 7,
    })
  }
  return tiles
})()

const NEGATIVE_TILE_ID = TILES.find((tile) => tile.kind === 'negative-polyomino')?.id ?? -1

function hasPositivePolySelection(ids: number[]) {
  return TILES.some(
    (tile) =>
      ids.includes(tile.id) &&
      (tile.kind === 'polyomino' || tile.kind === 'rotated-polyomino')
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
              const next = prev.filter((id) => id !== tile.id)
              const removedPositivePoly =
                tile.kind === 'polyomino' || tile.kind === 'rotated-polyomino'
              if (removedPositivePoly && !hasPositivePolySelection(next)) {
                return next.filter((id) => id !== NEGATIVE_TILE_ID)
              }
              return next
            }
            if (
              tile.kind === 'negative-polyomino' &&
              !hasPositivePolySelection(prev)
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
