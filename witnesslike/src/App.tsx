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
                : 'placeholder',
      active: index === 0 || index === 1 || index === 2 || index === 3 || index === 4,
    })
  }
  return tiles
})()

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
              return prev.filter((id) => id !== tile.id)
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
