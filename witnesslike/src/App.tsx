import { useEffect, useMemo, useState } from 'react'
import './App.css'
import HomePage from './HomePage'
import type { Tile, TileKind } from './HomePage'
import IntroPage from './IntroPage'
import OverviewPage from './OverviewPage'
import PuzzlePage from './PuzzlePage'
import type { HexTarget } from './symbols/hexagon'
import type { ColorSquare } from './symbols/colorSquares'
import type { StarTarget } from './symbols/stars'
import type { TriangleTarget } from './symbols/triangles'
import { NEGATIVE_POLYOMINO_COLOR } from './symbols/polyomino'
import type { PolyominoShape, PolyominoSymbol } from './symbols/polyomino'

type View = 'overview' | 'intro-home' | 'intro-puzzle' | 'custom-home' | 'custom-puzzle'
type IntroProgress = Record<TileKind, number>

const INTRO_PUZZLE_COUNT = 10
const INTRO_PROGRESS_STORAGE_KEY = 'witnesslike-intro-progress-v1'
const INTRO_STAGE_SEED_OFFSETS = [1103, 2017, 3191, 4021, 5059, 6089, 7103, 8089, 9011, 10093]
const INTRO_STAGE_CELL_COUNTS = [1, 2, 2, 2, 3, 3, 3, 3, 3, 3]
const INTRO_ONE_BY_ONE_SAFE_SYMBOLS = new Set<TileKind>([
  'gap-line',
  'hexagon',
  'triangles',
  'dots',
  'diamonds',
])
const GAP_INTRO_STAGE_SPECS: Array<{ cellCount: number; gapCount: number; requireTopGap?: boolean }> = [
  { cellCount: 1, gapCount: 1, requireTopGap: true },
  { cellCount: 2, gapCount: 3 },
  { cellCount: 2, gapCount: 5 },
  { cellCount: 2, gapCount: 8 },
  { cellCount: 3, gapCount: 4 },
  { cellCount: 3, gapCount: 6 },
  { cellCount: 3, gapCount: 9 },
  { cellCount: 3, gapCount: 12 },
  { cellCount: 3, gapCount: 15 },
  { cellCount: 3, gapCount: 18 },
]
const GAP_INTRO_REQUIRED_PATHS: Array<Array<[number, number]>> = [
  [[0, 1], [1, 1], [1, 0]],
  [[0, 2], [1, 2], [1, 1], [2, 1], [2, 0]],
  [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0]],
  [[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [2, 1], [2, 0]],
  [[0, 3], [1, 3], [1, 2], [2, 2], [2, 1], [3, 1], [3, 0]],
  [[0, 3], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0], [3, 0]],
  [[0, 3], [1, 3], [2, 3], [2, 2], [1, 2], [1, 1], [2, 1], [3, 1], [3, 0]],
  [[0, 3], [0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [3, 1], [3, 0]],
  [[0, 3], [1, 3], [1, 2], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 3], [0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [1, 0], [2, 0], [3, 0]],
]
const HEX_INTRO_STAGE_SPECS: Array<{ cellCount: number; nodeCount: number; edgeCount: number }> = [
  { cellCount: 1, nodeCount: 1, edgeCount: 0 },
  { cellCount: 2, nodeCount: 2, edgeCount: 0 },
  { cellCount: 2, nodeCount: 4, edgeCount: 0 },
  { cellCount: 2, nodeCount: 4, edgeCount: 2 },
  { cellCount: 3, nodeCount: 6, edgeCount: 3 },
  { cellCount: 3, nodeCount: 8, edgeCount: 4 },
  { cellCount: 3, nodeCount: 10, edgeCount: 5 },
  { cellCount: 3, nodeCount: 10, edgeCount: 6 },
  { cellCount: 3, nodeCount: 11, edgeCount: 7 },
  { cellCount: 4, nodeCount: 25, edgeCount: 1 },
]
const HEX_INTRO_REQUIRED_PATHS: Array<Array<[number, number]>> = [
  [[0, 1], [0, 0], [1, 0]],
  [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]],
  [[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 1], [2, 0]],
  [[0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0]],
  [[0, 3], [0, 2], [1, 2], [1, 3], [2, 3], [2, 2], [3, 2], [3, 1], [2, 1], [2, 0], [3, 0]],
  [[0, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [3, 1], [3, 0]],
  [[0, 3], [0, 2], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1], [2, 0], [3, 0]],
  [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [3, 0]],
  [[0, 3], [0, 2], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [3, 1], [3, 0]],
]
const COLOR_WHITE = '#f8fafc'
const COLOR_BLACK = '#0b0f14'
const COLOR_THIRD = '#1d4ed8'
const STAR_ORANGE = '#f08a2f'
const STAR_PINK = '#ec4899'
const STAR_LIGHT_GREEN = '#2fbf71'
const TRIANGLE_ORANGE = '#ff8a00'
const POLYOMINO_GOLD = '#f4c430'
const INTRO_VIEWBOX_MARGIN = 0.6
const COLOR_SQUARE_INTRO_SPECS: Array<{
  cellCount: number
  path: Array<[number, number]>
  squares: ColorSquare[]
}> = [
  {
    // Internally this stage uses a 2x2 node space to allow a 1x2 rectangular board.
    cellCount: 2,
    path: [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 0, cellY: 1, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 2,
    path: [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 0, cellY: 1, color: COLOR_WHITE },
      { cellX: 1, cellY: 0, color: COLOR_BLACK },
      { cellX: 1, cellY: 1, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 2,
    path: [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 1, cellY: 0, color: COLOR_BLACK },
      { cellX: 0, cellY: 1, color: COLOR_BLACK },
      { cellX: 1, cellY: 1, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 1, cellY: 2, color: COLOR_WHITE },
      { cellX: 2, cellY: 0, color: COLOR_WHITE },
      { cellX: 0, cellY: 2, color: COLOR_BLACK },
      { cellX: 1, cellY: 1, color: COLOR_BLACK },
      { cellX: 2, cellY: 2, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 1, cellY: 1, color: COLOR_WHITE },
      { cellX: 2, cellY: 2, color: COLOR_WHITE },
      { cellX: 2, cellY: 0, color: COLOR_BLACK },
      { cellX: 0, cellY: 1, color: COLOR_BLACK },
      { cellX: 1, cellY: 2, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 2, cellY: 0, color: COLOR_WHITE },
      { cellX: 2, cellY: 1, color: COLOR_WHITE },
      { cellX: 0, cellY: 2, color: COLOR_WHITE },
      { cellX: 1, cellY: 0, color: COLOR_BLACK },
      { cellX: 0, cellY: 1, color: COLOR_BLACK },
      { cellX: 1, cellY: 1, color: COLOR_BLACK },
      { cellX: 1, cellY: 2, color: COLOR_BLACK },
      { cellX: 2, cellY: 2, color: COLOR_BLACK },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [3, 1], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 2, cellY: 0, color: COLOR_BLACK },
      { cellX: 0, cellY: 2, color: COLOR_THIRD },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [2, 0], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 1, cellY: 0, color: COLOR_WHITE },
      { cellX: 2, cellY: 0, color: COLOR_BLACK },
      { cellX: 2, cellY: 1, color: COLOR_BLACK },
      { cellX: 0, cellY: 2, color: COLOR_THIRD },
      { cellX: 1, cellY: 2, color: COLOR_THIRD },
    ],
  },
  {
    cellCount: 3,
    path: [[0, 3], [1, 3], [2, 3], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [2, 0], [3, 0]],
    squares: [
      { cellX: 0, cellY: 0, color: COLOR_WHITE },
      { cellX: 0, cellY: 1, color: COLOR_WHITE },
      { cellX: 2, cellY: 2, color: COLOR_BLACK },
      { cellX: 2, cellY: 0, color: COLOR_BLACK },
      { cellX: 0, cellY: 2, color: COLOR_THIRD },
      { cellX: 1, cellY: 1, color: COLOR_THIRD },
    ],
  },
  {
    cellCount: 4,
    path: [
      [0, 4], [1, 4], [1, 3], [0, 3], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2],
      [2, 3], [2, 4], [3, 4], [3, 3], [4, 3], [4, 2], [4, 1], [3, 1], [3, 0], [4, 0],
    ],
    squares: (() => {
      const squares: ColorSquare[] = []
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const isCorner = (x === 0 || x === 3) && (y === 0 || y === 3)
          squares.push({ cellX: x, cellY: y, color: isCorner ? COLOR_WHITE : COLOR_BLACK })
        }
      }
      return squares
    })(),
  },
]
const STAR_INTRO_SPECS: Array<{
  cellCount: number
  stars: StarTarget[]
  squares?: ColorSquare[]
  rectangular?: { width: number; height: number }
}> = [
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 0, cellY: 1, color: STAR_ORANGE },
    ],
  },
  {
    cellCount: 2,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_ORANGE },
      { cellX: 0, cellY: 1, color: STAR_ORANGE },
      { cellX: 1, cellY: 1, color: STAR_ORANGE },
    ],
  },
  {
    cellCount: 2,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 1, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_PINK },
      { cellX: 0, cellY: 1, color: STAR_PINK },
    ],
  },
  {
    cellCount: 2,
    stars: [{ cellX: 0, cellY: 0, color: STAR_ORANGE }],
    squares: [{ cellX: 1, cellY: 0, color: STAR_ORANGE }],
  },
  {
    cellCount: 2,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 1, color: STAR_ORANGE },
    ],
    squares: [
      { cellX: 1, cellY: 0, color: STAR_ORANGE },
      { cellX: 0, cellY: 1, color: STAR_PINK },
    ],
  },
  {
    cellCount: 3,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_ORANGE },
      { cellX: 2, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 1, color: STAR_ORANGE },
      { cellX: 1, cellY: 2, color: STAR_ORANGE },
      { cellX: 2, cellY: 2, color: STAR_ORANGE },
    ],
  },
  {
    cellCount: 3,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 2, cellY: 1, color: STAR_ORANGE },
      { cellX: 0, cellY: 2, color: STAR_PINK },
      { cellX: 1, cellY: 0, color: STAR_PINK },
      { cellX: 0, cellY: 1, color: STAR_LIGHT_GREEN },
      { cellX: 2, cellY: 2, color: STAR_LIGHT_GREEN },
    ],
  },
  {
    cellCount: 3,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_ORANGE },
      { cellX: 0, cellY: 1, color: STAR_ORANGE },
      { cellX: 2, cellY: 2, color: STAR_ORANGE },
      { cellX: 2, cellY: 0, color: STAR_PINK },
      { cellX: 2, cellY: 1, color: STAR_PINK },
      { cellX: 0, cellY: 2, color: STAR_LIGHT_GREEN },
      { cellX: 1, cellY: 1, color: STAR_LIGHT_GREEN },
    ],
  },
  {
    cellCount: 3,
    stars: [
      { cellX: 0, cellY: 0, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_ORANGE },
      { cellX: 2, cellY: 0, color: STAR_PINK },
      { cellX: 2, cellY: 1, color: STAR_PINK },
      { cellX: 0, cellY: 2, color: STAR_LIGHT_GREEN },
      { cellX: 1, cellY: 2, color: STAR_LIGHT_GREEN },
    ],
    squares: [
      { cellX: 0, cellY: 1, color: STAR_ORANGE },
      { cellX: 1, cellY: 1, color: STAR_PINK },
      { cellX: 2, cellY: 2, color: STAR_LIGHT_GREEN },
    ],
  },
  {
    cellCount: 3,
    stars: [
      { cellX: 0, cellY: 1, color: STAR_ORANGE },
      { cellX: 1, cellY: 2, color: STAR_ORANGE },
      { cellX: 1, cellY: 0, color: STAR_PINK },
      { cellX: 2, cellY: 2, color: STAR_PINK },
      { cellX: 0, cellY: 0, color: STAR_LIGHT_GREEN },
      { cellX: 1, cellY: 1, color: STAR_LIGHT_GREEN },
    ],
    squares: [
      { cellX: 0, cellY: 2, color: STAR_PINK },
      { cellX: 2, cellY: 0, color: STAR_LIGHT_GREEN },
    ],
  },
]
const TRIANGLE_INTRO_SPECS: Array<{
  cellCount: number
  triangles: TriangleTarget[]
  rectangular?: { width: number; height: number }
}> = [
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    triangles: [{ cellX: 0, cellY: 1, count: 1, color: TRIANGLE_ORANGE }],
  },
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    triangles: [{ cellX: 0, cellY: 0, count: 2, color: TRIANGLE_ORANGE }],
  },
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    triangles: [{ cellX: 0, cellY: 1, count: 3, color: TRIANGLE_ORANGE }],
  },
  {
    cellCount: 2,
    triangles: [
      { cellX: 0, cellY: 1, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 0, count: 1, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 2,
    triangles: [
      { cellX: 0, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 0, cellY: 0, count: 1, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 1, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 3,
    triangles: [
      { cellX: 0, cellY: 2, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 0, count: 1, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 3,
    triangles: [
      { cellX: 0, cellY: 0, count: 1, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 2, count: 2, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 3,
    triangles: [
      { cellX: 1, cellY: 0, count: 1, color: TRIANGLE_ORANGE },
      { cellX: 0, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 2, count: 1, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 3,
    triangles: [
      { cellX: 0, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 0, cellY: 2, count: 1, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 2, count: 1, color: TRIANGLE_ORANGE },
    ],
  },
  {
    cellCount: 3,
    triangles: [
      { cellX: 0, cellY: 0, count: 3, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 0, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 2, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 1, cellY: 1, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 0, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 0, cellY: 2, count: 2, color: TRIANGLE_ORANGE },
      { cellX: 2, cellY: 2, count: 3, color: TRIANGLE_ORANGE },
    ],
  },
]
const POLY_MONO_SHAPE: PolyominoShape = {
  id: 'intro-poly-mono',
  size: 1,
  cells: [{ x: 0, y: 0 }],
}
const POLY_DOMINO_VERTICAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-domino-v',
  size: 2,
  cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }],
}
const POLY_DOMINO_HORIZONTAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-domino-h',
  size: 2,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
}
const POLY_TRI_LINE_HORIZONTAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-tri-line-h',
  size: 3,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
}
const POLY_TRI_LINE_VERTICAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-tri-line-v',
  size: 3,
  cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
}
const POLY_TRI_STAIR_SHAPE: PolyominoShape = {
  id: 'intro-poly-tri-stair',
  size: 3,
  cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
}
const POLY_TRI_STAIR_ROTATED_SHAPE: PolyominoShape = {
  id: 'intro-poly-tri-stair-rot',
  size: 3,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
}
const POLY_TET_SQUARE_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-square',
  size: 4,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
}
const POLY_TET_LINE_HORIZONTAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-line-h',
  size: 4,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
}
const POLY_TET_L_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-l',
  size: 4,
  cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
}
const POLY_TET_S_SIDE_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-s-side',
  size: 4,
  cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
}
const POLY_TET_S_VERTICAL_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-s-vertical',
  size: 4,
  cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
}
const POLY_TET_T_LYING_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-t-lying',
  size: 4,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
}
const POLY_TET_WEIRD_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-weird',
  size: 3,
  cells: [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: 0 }],
}
const POLY_TET_SPLIT_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-split',
  size: 2,
  cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
}
const POLY_TET_SPLIT2_SHAPE: PolyominoShape = {
  id: 'intro-poly-tet-split-2',
  size: 2,
  cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
}
const POLY_NONO_CUBE_SHAPE: PolyominoShape = {
  id: 'intro-poly-nono-cube',
  size: 9,
  cells: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ],
}
const POLY_OCTA_CHEESE: PolyominoShape = {
  id: 'intro-poly-octa-cheese',
  size: 8,
  cells: [
    { x: 0, y: 0 }, { x: 2, y: 0 },
    { x: 1, y: 1 }, { x: 3, y: 1 },
    { x: 0, y: 2 }, { x: 2, y: 2 },
    { x: 1, y: 3 }, { x: 3, y: 3 },
  ],
}
const POLY_OCTA_CIRCLE: PolyominoShape = {
  id: 'intro-poly-octa-circle',
  size: 8,
  cells: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    { x: 0, y: 1 }, { x: 3, y: 1 },
    { x: 0, y: 2 }, { x: 3, y: 2 },
    { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  ],
}

type PolyominoIntroSpec = {
  cellCount: number
  symbols: PolyominoSymbol[]
  rectangular?: { width: number; height: number }
}

const POLYOMINO_INTRO_SPECS: PolyominoIntroSpec[] = [
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    rectangular: { width: 1, height: 3 },
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_STAIR_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_TET_SQUARE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_STAIR_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TET_L_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 2,
        shape: POLY_TET_S_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_TET_T_LYING_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 2,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TET_WEIRD_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 1,
        shape: POLY_TET_SPLIT_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
]
const ROTATED_POLYOMINO_INTRO_SPECS: PolyominoIntroSpec[] = [
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    rectangular: { width: 1, height: 2 },
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_DOMINO_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    rectangular: { width: 1, height: 3 },
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_TRI_STAIR_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_DOMINO_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TET_L_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 2,
        shape: POLY_MONO_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TRI_STAIR_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TET_L_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TET_S_SIDE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 2,
        cellY: 1,
        shape: POLY_TET_T_LYING_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TET_SPLIT2_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TET_SPLIT_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
]

const NEGATIVE_POLYOMINO_INTRO_SPECS: PolyominoIntroSpec[] = [
  {
    cellCount: 3,
    rectangular: { width: 1, height: 3 },
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TET_SQUARE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_TRI_STAIR_ROTATED_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: true,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_STAIR_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_NONO_CUBE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 2,
        shape: POLY_TET_T_LYING_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TET_L_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 2,
        cellY: 2,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_DOMINO_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TET_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: true,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 0,
        shape: POLY_TET_LINE_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 2,
        cellY: 1,
        shape: POLY_TET_T_LYING_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TET_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 0,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: true,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 3,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 1,
        cellY: 3,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 3,
        cellY: 0,
        shape: POLY_OCTA_CIRCLE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_OCTA_CHEESE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 1,
        shape: POLY_TET_T_LYING_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_MONO_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: false,
        negative: true,
      },
    ],
  },
]

const ROTATED_NEGATIVE_POLYOMINO_INTRO_SPECS: PolyominoIntroSpec[] = [
  {
    cellCount: 3,
    rectangular: { width: 1, height: 3 },
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_STAIR_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 1,
        shape: POLY_TRI_STAIR_ROTATED_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 2,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_DOMINO_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 1,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TRI_LINE_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 3,
    symbols: [
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TET_S_SIDE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 1,
        shape: POLY_TET_S_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 3,
        cellY: 0,
        shape: POLY_OCTA_CIRCLE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 3,
        shape: POLY_TET_LINE_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TET_S_SIDE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 0,
        shape: POLY_TET_S_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 0,
        cellY: 0,
        shape: POLY_TRI_STAIR_ROTATED_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 3,
        cellY: 1,
        shape: POLY_DOMINO_HORIZONTAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
      {
        cellX: 3,
        cellY: 3,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 1,
        cellY: 0,
        shape: POLY_TET_S_SIDE_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 1,
        cellY: 2,
        shape: POLY_TET_S_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
      {
        cellX: 2,
        cellY: 2,
        shape: POLY_TET_S_VERTICAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
    ],
  },
  {
    cellCount: 4,
    symbols: [
      {
        cellX: 1,
        cellY: 3,
        shape: POLY_TET_LINE_HORIZONTAL_SHAPE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 2,
        cellY: 1,
        shape: POLY_OCTA_CIRCLE,
        color: POLYOMINO_GOLD,
        rotatable: false,
        negative: false,
      },
      {
        cellX: 0,
        cellY: 2,
        shape: POLY_TRI_LINE_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
      {
        cellX: 3,
        cellY: 3,
        shape: POLY_DOMINO_VERTICAL_SHAPE,
        color: NEGATIVE_POLYOMINO_COLOR,
        rotatable: true,
        negative: true,
      },
    ],
  },
]

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
    label: 'Cardinals',
    description: 'From the symbol, all four directions must be blocked by the path before the grid edge.',
    kind: 'cardinal',
  },
  {
    label: 'Sentinels',
    description: 'In its facing half-plane, no symbols may appear in the same region.',
    kind: 'sentinel',
  },
  {
    label: 'Spinners',
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
    label: 'Chips',
    description:
      'For each chip color in a region, there must be at least two symbols of that color, and they must line up in one row or one column.',
    kind: 'chips',
  },
  {
    label: 'Dice',
    description:
      'In each region with dice, the region area must equal the sum of all dice pips in that region.',
    kind: 'dice',
  },
  {
    label: 'Open Pentagons',
    description:
      'Same-color open pentagons must be linked by exactly one cell path that avoids line crossings and symbols of other colors.',
    kind: 'open-pentagons',
  },
  {
    label: 'Compasses',
    description:
      'All same-color compasses must have exactly the same cell edges touched by the line; rotated/flipped compasses rotate/flip that required edge pattern too.',
    kind: 'compasses',
  },
  {
    label: 'Tally Marks',
    description:
      'Each tally mark equals the outline side count of its region (grouped as 1-4 vertical marks and a slash on every 5th).',
    kind: 'tally-marks',
  },
  {
    label: 'Black Holes',
    description:
      'The path may not touch any side of their cell (corners are allowed). If a same-color symbol shares the region, the puzzle fails.',
    kind: 'black-holes',
  },
  {
    label: 'Eyes',
    description:
      'At least one line must exist in the facing direction; the first such segment merges both adjacent regions for other symbol checks.',
    kind: 'eyes',
  },
  {
    label: 'Crystals',
    description:
      'Each crystal must be alone in its region, and all crystal regions must match in shape (rotations/flips count).',
    kind: 'crystals',
  },
  {
    label: 'Ghosts',
    description: 'Each ghost needs its own region, and the total region count must equal ghost count.',
    kind: 'ghost',
  },
]

const INTRO_LOCK_START_KIND: TileKind = 'negator'
const INTRO_LOCK_END_KIND: TileKind = 'ghost'
const INTRO_LOCKED_KINDS = (() => {
  const startIndex = ACTIVE_SYMBOLS.findIndex((symbol) => symbol.kind === INTRO_LOCK_START_KIND)
  const endIndex = ACTIVE_SYMBOLS.findIndex((symbol) => symbol.kind === INTRO_LOCK_END_KIND)
  if (startIndex < 0 || endIndex < startIndex) return new Set<TileKind>()
  return new Set<TileKind>(
    ACTIVE_SYMBOLS.slice(startIndex, endIndex + 1).map((symbol) => symbol.kind)
  )
})()

function isIntroKindAvailable(kind: TileKind) {
  return !INTRO_LOCKED_KINDS.has(kind)
}

const TILES: Tile[] = (() => {
  return ACTIVE_SYMBOLS.map((symbol, index) => ({
    id: index,
    label: symbol.label,
    description: symbol.description,
    kind: symbol.kind,
    active: true,
  }))
})()

const INTRO_TILES: Tile[] = TILES.map((tile) => ({
  ...tile,
  active: isIntroKindAvailable(tile.kind),
}))

const TILES_BY_KIND = new Map<TileKind, Tile>(TILES.map((tile) => [tile.kind, tile]))
const INTRO_SEEDS_BY_KIND: Record<TileKind, number[]> = TILES.reduce((acc, tile) => {
  const seeds = INTRO_STAGE_SEED_OFFSETS.map((offset, stageIndex) => {
    const raw = (tile.id + 1) * 1_000_003 + offset * 97_003 + stageIndex * 65_537
    return raw % 1_000_000_000
  })
  acc[tile.kind] = seeds
  return acc
}, {} as Record<TileKind, number[]>)

const NEGATIVE_TILE_ID = TILES.find((tile) => tile.kind === 'negative-polyomino')?.id ?? -1
const ROTATED_NEGATIVE_TILE_ID = TILES.find((tile) => tile.kind === 'rotated-negative-polyomino')?.id ?? -1
const NEGATOR_TILE_ID = TILES.find((tile) => tile.kind === 'negator')?.id ?? -1
const CRYSTAL_TILE_ID = TILES.find((tile) => tile.kind === 'crystals')?.id ?? -1
const GHOST_TILE_ID = TILES.find((tile) => tile.kind === 'ghost')?.id ?? -1
const TALLY_TILE_ID = TILES.find((tile) => tile.kind === 'tally-marks')?.id ?? -1

function createEmptyIntroProgress(): IntroProgress {
  const progress = {} as IntroProgress
  for (const tile of TILES) {
    progress[tile.kind] = 0
  }
  return progress
}

function clampIntroValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const integer = Math.floor(value)
  if (integer < 0) return 0
  if (integer > INTRO_PUZZLE_COUNT) return INTRO_PUZZLE_COUNT
  return integer
}

function loadIntroProgress(): IntroProgress {
  if (typeof window === 'undefined') {
    return createEmptyIntroProgress()
  }
  const fallback = createEmptyIntroProgress()
  const raw = window.localStorage.getItem(INTRO_PROGRESS_STORAGE_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<Record<TileKind, unknown>>
    for (const tile of TILES) {
      fallback[tile.kind] = clampIntroValue(parsed[tile.kind])
    }
    return fallback
  } catch {
    return fallback
  }
}

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
      tile.kind !== 'negator'
  )
}

function hasGhostAndCrystalSelection(ids: number[]) {
  return ids.includes(CRYSTAL_TILE_ID) && ids.includes(GHOST_TILE_ID)
}

function hasCrystalAndTallySelection(ids: number[]) {
  return ids.includes(CRYSTAL_TILE_ID) && ids.includes(TALLY_TILE_ID)
}

function hasNegatorBlockedCombo(ids: number[]) {
  return hasGhostAndCrystalSelection(ids) || hasCrystalAndTallySelection(ids)
}

function enforceNegatorComboRule(ids: number[]) {
  if (!hasNegatorBlockedCombo(ids)) return ids
  return ids.filter((id) => id !== NEGATOR_TILE_ID)
}

function getIntroKindBundle(kind: TileKind): TileKind[] {
  if (kind === 'negative-polyomino') return ['negative-polyomino', 'polyomino']
  if (kind === 'rotated-negative-polyomino') {
    return ['rotated-negative-polyomino', 'rotated-polyomino']
  }
  if (kind === 'negator') return ['negator', 'hexagon']
  return [kind]
}

function introEdgeKey(ax: number, ay: number, bx: number, by: number) {
  if (ax === bx) {
    return ay < by ? `${ax},${ay}-${bx},${by}` : `${bx},${by}-${ax},${ay}`
  }
  if (ay === by) {
    return ax < bx ? `${ax},${ay}-${bx},${by}` : `${bx},${by}-${ax},${ay}`
  }
  return `${ax},${ay}-${bx},${by}`
}

function introPathToEdgeKeys(path: Array<[number, number]>) {
  const keys = new Set<string>()
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1]
    const [bx, by] = path[i]
    keys.add(introEdgeKey(ax, ay, bx, by))
  }
  return keys
}

function listIntroFullEdgeKeys(cellCount: number) {
  const nodeCount = cellCount + 1
  const maxIndex = nodeCount - 1
  const keys: string[] = []
  for (let y = 0; y < nodeCount; y += 1) {
    for (let x = 0; x < nodeCount; x += 1) {
      if (x < maxIndex) keys.push(introEdgeKey(x, y, x + 1, y))
      if (y < maxIndex) keys.push(introEdgeKey(x, y, x, y + 1))
    }
  }
  return keys
}

function parseIntroEdgeKey(key: string) {
  const [start, end] = key.split('-')
  const [ax, ay] = start.split(',').map(Number)
  const [bx, by] = end.split(',').map(Number)
  return { ax, ay, bx, by }
}

function introEdgeHash(stageIndex: number, key: string) {
  let hash = (stageIndex + 1) * 2654435761
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  }
  return hash
}

function sortIntroEdgesDeterministic(stageIndex: number, keys: string[]) {
  return [...keys].sort((a, b) => introEdgeHash(stageIndex, a) - introEdgeHash(stageIndex, b))
}

function buildGapIntroRequiredPathEdgeKeys(stageIndex: number, cellCount: number) {
  const stagePath = GAP_INTRO_REQUIRED_PATHS[stageIndex]
  if (stagePath && stagePath.length >= 2) {
    const pathFitsGrid = stagePath.every(
      ([x, y]) => x >= 0 && y >= 0 && x <= cellCount && y <= cellCount
    )
    if (pathFitsGrid) {
      return introPathToEdgeKeys(stagePath)
    }
  }
  const required = new Set<string>()
  if (cellCount === 1) {
    required.add(introEdgeKey(0, 1, 1, 1))
    required.add(introEdgeKey(1, 1, 1, 0))
    return required
  }
  if (cellCount === 2) {
    required.add(introEdgeKey(0, 2, 1, 2))
    required.add(introEdgeKey(1, 2, 1, 1))
    required.add(introEdgeKey(1, 1, 2, 1))
    required.add(introEdgeKey(2, 1, 2, 0))
    return required
  }
  if (cellCount === 3) {
    required.add(introEdgeKey(0, 3, 1, 3))
    required.add(introEdgeKey(1, 3, 1, 2))
    required.add(introEdgeKey(1, 2, 2, 2))
    required.add(introEdgeKey(2, 2, 2, 1))
    required.add(introEdgeKey(2, 1, 3, 1))
    required.add(introEdgeKey(3, 1, 3, 0))
    return required
  }
  for (let x = 0; x < cellCount; x += 1) {
    required.add(introEdgeKey(x, cellCount, x + 1, cellCount))
  }
  for (let y = cellCount; y > 0; y -= 1) {
    required.add(introEdgeKey(cellCount, y, cellCount, y - 1))
  }
  return required
}

function buildBottomRightBorderRouteEdges(cellCount: number) {
  const route = new Set<string>()
  for (let x = 0; x < cellCount; x += 1) {
    route.add(introEdgeKey(x, cellCount, x + 1, cellCount))
  }
  for (let y = cellCount; y > 0; y -= 1) {
    route.add(introEdgeKey(cellCount, y, cellCount, y - 1))
  }
  return route
}

function buildLeftTopBorderRouteEdges(cellCount: number) {
  const route = new Set<string>()
  for (let y = cellCount; y > 0; y -= 1) {
    route.add(introEdgeKey(0, y, 0, y - 1))
  }
  for (let x = 0; x < cellCount; x += 1) {
    route.add(introEdgeKey(x, 0, x + 1, 0))
  }
  return route
}

function isPerimeterIntroEdge(key: string, cellCount: number) {
  const { ax, ay, bx, by } = parseIntroEdgeKey(key)
  const top = ay === 0 && by === 0
  const bottom = ay === cellCount && by === cellCount
  const left = ax === 0 && bx === 0
  const right = ax === cellCount && bx === cellCount
  return top || bottom || left || right
}

function buildGapRemovalPriority(stageIndex: number, cellCount: number, removable: string[]) {
  const easyBottomRight = buildBottomRightBorderRouteEdges(cellCount)
  const easyLeftTop = buildLeftTopBorderRouteEdges(cellCount)
  const easySet = new Set<string>()
  for (const key of removable) {
    if (easyBottomRight.has(key) || easyLeftTop.has(key)) {
      easySet.add(key)
    }
  }
  const easy = sortIntroEdgesDeterministic(
    stageIndex,
    removable.filter((key) => easySet.has(key))
  )
  const perimeter = sortIntroEdgesDeterministic(
    stageIndex + 101,
    removable.filter((key) => !easySet.has(key) && isPerimeterIntroEdge(key, cellCount))
  )
  const interior = sortIntroEdgesDeterministic(
    stageIndex + 503,
    removable.filter((key) => !easySet.has(key) && !isPerimeterIntroEdge(key, cellCount))
  )
  return [...easy, ...perimeter, ...interior]
}

function buildGapIntroStageEdgeKeys(stageIndex: number) {
  const spec = GAP_INTRO_STAGE_SPECS[stageIndex] ?? GAP_INTRO_STAGE_SPECS[GAP_INTRO_STAGE_SPECS.length - 1]
  const fullEdges = listIntroFullEdgeKeys(spec.cellCount)
  const requiredPath = buildGapIntroRequiredPathEdgeKeys(stageIndex, spec.cellCount)
  const removable = fullEdges.filter((key) => !requiredPath.has(key))
  const topEdgeKey = introEdgeKey(0, 0, 1, 0)
  const removed: string[] = []
  if (spec.requireTopGap && removable.includes(topEdgeKey)) {
    removed.push(topEdgeKey)
  }
  const orderedCandidates = buildGapRemovalPriority(stageIndex, spec.cellCount, removable)
  for (const key of orderedCandidates) {
    if (removed.length >= spec.gapCount) break
    if (removed.includes(key)) continue
    removed.push(key)
  }
  const removedSet = new Set(removed)
  return fullEdges.filter((key) => !removedSet.has(key))
}

function buildHexIntroStagePath(stageIndex: number, cellCount: number) {
  const stagePath = HEX_INTRO_REQUIRED_PATHS[stageIndex]
  if (stagePath && stagePath.length >= 2) {
    const pathFitsGrid = stagePath.every(
      ([x, y]) => x >= 0 && y >= 0 && x <= cellCount && y <= cellCount
    )
    if (pathFitsGrid) {
      return stagePath
    }
  }
  return [
    [0, cellCount],
    [cellCount, cellCount],
    [cellCount, 0],
  ] as Array<[number, number]>
}

function listIntroRectFullEdgeKeys(widthCells: number, heightCells: number) {
  const keys: string[] = []
  for (let y = 0; y <= heightCells; y += 1) {
    for (let x = 0; x <= widthCells; x += 1) {
      if (x < widthCells) keys.push(introEdgeKey(x, y, x + 1, y))
      if (y < heightCells) keys.push(introEdgeKey(x, y, x, y + 1))
    }
  }
  return keys
}

function buildColorSquareIntroStageEdgeKeys(stageIndex: number) {
  if (stageIndex === 0) {
    return listIntroRectFullEdgeKeys(1, 2)
  }
  const spec = COLOR_SQUARE_INTRO_SPECS[stageIndex] ?? COLOR_SQUARE_INTRO_SPECS[COLOR_SQUARE_INTRO_SPECS.length - 1]
  return listIntroFullEdgeKeys(spec.cellCount)
}

function buildColorSquareIntroStageSquares(stageIndex: number) {
  const spec =
    COLOR_SQUARE_INTRO_SPECS[stageIndex] ??
    COLOR_SQUARE_INTRO_SPECS[COLOR_SQUARE_INTRO_SPECS.length - 1]
  return spec.squares.map((square) => ({ ...square }))
}

function buildStarIntroStageEdgeKeys(stageIndex: number) {
  const spec = STAR_INTRO_SPECS[stageIndex] ?? STAR_INTRO_SPECS[STAR_INTRO_SPECS.length - 1]
  if (spec.rectangular) {
    return listIntroRectFullEdgeKeys(spec.rectangular.width, spec.rectangular.height)
  }
  return listIntroFullEdgeKeys(spec.cellCount)
}

function buildStarIntroStageTargets(stageIndex: number) {
  const spec = STAR_INTRO_SPECS[stageIndex] ?? STAR_INTRO_SPECS[STAR_INTRO_SPECS.length - 1]
  return spec.stars.map((star) => ({ ...star }))
}

function buildStarIntroStageSquares(stageIndex: number) {
  const spec = STAR_INTRO_SPECS[stageIndex] ?? STAR_INTRO_SPECS[STAR_INTRO_SPECS.length - 1]
  return (spec.squares ?? []).map((square) => ({ ...square }))
}

function buildTriangleIntroStageEdgeKeys(stageIndex: number) {
  const spec =
    TRIANGLE_INTRO_SPECS[stageIndex] ??
    TRIANGLE_INTRO_SPECS[TRIANGLE_INTRO_SPECS.length - 1]
  if (spec.rectangular) {
    return listIntroRectFullEdgeKeys(spec.rectangular.width, spec.rectangular.height)
  }
  return listIntroFullEdgeKeys(spec.cellCount)
}

function buildTriangleIntroStageTargets(stageIndex: number) {
  const spec =
    TRIANGLE_INTRO_SPECS[stageIndex] ??
    TRIANGLE_INTRO_SPECS[TRIANGLE_INTRO_SPECS.length - 1]
  return spec.triangles.map((triangle) => ({ ...triangle }))
}

function isFixedPolyominoIntroKind(kind: TileKind): kind is 'polyomino' | 'rotated-polyomino' | 'negative-polyomino' | 'rotated-negative-polyomino' {
  return (
    kind === 'polyomino' ||
    kind === 'rotated-polyomino' ||
    kind === 'negative-polyomino' ||
    kind === 'rotated-negative-polyomino'
  )
}

function getPolyominoIntroSpec(kind: TileKind, stageIndex: number) {
  const specs =
    kind === 'rotated-polyomino'
      ? ROTATED_POLYOMINO_INTRO_SPECS
      : kind === 'negative-polyomino'
        ? NEGATIVE_POLYOMINO_INTRO_SPECS
        : kind === 'rotated-negative-polyomino'
          ? ROTATED_NEGATIVE_POLYOMINO_INTRO_SPECS
        : POLYOMINO_INTRO_SPECS
  return specs[stageIndex] ?? specs[specs.length - 1]
}

function buildPolyominoIntroStageEdgeKeys(kind: TileKind, stageIndex: number) {
  const spec =
    getPolyominoIntroSpec(kind, stageIndex)
  const fullEdges = spec.rectangular
    ? listIntroRectFullEdgeKeys(spec.rectangular.width, spec.rectangular.height)
    : listIntroFullEdgeKeys(spec.cellCount)

  if (
    stageIndex === 7 &&
    (kind === 'polyomino' || kind === 'rotated-polyomino')
  ) {
    const edges = new Set(fullEdges)
    if (kind === 'rotated-polyomino') {
      edges.delete(introEdgeKey(0, 2, 0, 3))
      edges.delete(introEdgeKey(3, 0, 3, 1))
    } else {
      edges.delete(introEdgeKey(0, 3, 1, 3))
      edges.delete(introEdgeKey(3, 0, 3, 1))
    }
    return [...edges]
  }

  if (kind === 'rotated-negative-polyomino') {
    const edges = new Set(fullEdges)
    const removedEdgesByStage: Record<number, string[]> = {
      0: [introEdgeKey(0, 0, 1, 0)],
      1: [introEdgeKey(0, 2, 1, 2), introEdgeKey(0, 0, 0, 1)],
      2: [introEdgeKey(1, 2, 2, 2), introEdgeKey(0, 0, 0, 1)],
      3: [introEdgeKey(1, 3, 2, 3), introEdgeKey(1, 0, 2, 0)],
      4: [introEdgeKey(0, 0, 1, 0)],
      6: [introEdgeKey(1, 4, 2, 4), introEdgeKey(2, 0, 3, 0)],
    }
    for (const edge of removedEdgesByStage[stageIndex] ?? []) {
      edges.delete(edge)
    }
    return [...edges]
  }

  return fullEdges
}

function buildPolyominoIntroStageSymbols(kind: TileKind, stageIndex: number) {
  const spec = getPolyominoIntroSpec(kind, stageIndex)
  const forcedRotatable =
    kind === 'rotated-polyomino' ? true : kind === 'polyomino' ? false : null
  const forcedNegative =
    kind === 'polyomino' || kind === 'rotated-polyomino' ? false : null
  return spec.symbols.map((symbol) => ({
    ...symbol,
    rotatable: forcedRotatable ?? symbol.rotatable,
    negative: forcedNegative ?? symbol.negative,
    shape: {
      ...symbol.shape,
      id: symbol.shape.id,
      cells: symbol.shape.cells.map((cell) => ({ ...cell })),
    },
  }))
}

function getRectIntroGeometry(width: number, height: number) {
  return {
    width,
    height,
    start: { x: 0, y: height },
    end: { x: width, y: 0 },
    viewBox: {
      x: -INTRO_VIEWBOX_MARGIN,
      y: -INTRO_VIEWBOX_MARGIN,
      w: width + INTRO_VIEWBOX_MARGIN * 2,
      h: height + INTRO_VIEWBOX_MARGIN * 2,
    },
  }
}

function getIntroGeometry(kind: TileKind, stageIndex: number) {
  if (kind === 'color-squares' && stageIndex === 0) {
    return getRectIntroGeometry(1, 2)
  }
  if (kind === 'stars') {
    const spec = STAR_INTRO_SPECS[stageIndex] ?? STAR_INTRO_SPECS[STAR_INTRO_SPECS.length - 1]
    if (spec.rectangular) {
      return getRectIntroGeometry(spec.rectangular.width, spec.rectangular.height)
    }
  }
  if (kind === 'triangles') {
    const spec =
      TRIANGLE_INTRO_SPECS[stageIndex] ??
      TRIANGLE_INTRO_SPECS[TRIANGLE_INTRO_SPECS.length - 1]
    if (spec.rectangular) {
      return getRectIntroGeometry(spec.rectangular.width, spec.rectangular.height)
    }
  }
  if (isFixedPolyominoIntroKind(kind)) {
    const spec = getPolyominoIntroSpec(kind, stageIndex)
    if (spec.rectangular) {
      return getRectIntroGeometry(spec.rectangular.width, spec.rectangular.height)
    }
  }
  return null
}

function pickPathTargetsDeterministic<T>(items: T[], count: number, stageIndex: number) {
  if (count <= 0 || items.length === 0) return [] as T[]
  if (count >= items.length) return [...items]
  const picked: T[] = []
  const used = new Set<number>()
  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0.5 : i / (count - 1)
    let index = Math.round(ratio * (items.length - 1))
    if ((stageIndex + i) % 2 === 1) {
      index = items.length - 1 - index
    }
    while (used.has(index)) {
      index = (index + 1) % items.length
    }
    used.add(index)
    picked.push(items[index])
  }
  return picked
}

function listIntroNodeCoords(cellCount: number) {
  const nodes: Array<[number, number]> = []
  for (let y = 0; y <= cellCount; y += 1) {
    for (let x = 0; x <= cellCount; x += 1) {
      nodes.push([x, y])
    }
  }
  return nodes
}

function buildHexIntroStageTargets(stageIndex: number): HexTarget[] {
  const spec = HEX_INTRO_STAGE_SPECS[stageIndex] ?? HEX_INTRO_STAGE_SPECS[HEX_INTRO_STAGE_SPECS.length - 1]
  const stagePath = buildHexIntroStagePath(stageIndex, spec.cellCount)
  const pathNodeCandidates = stagePath.slice(1, -1)
  const nodeCandidates =
    spec.nodeCount > pathNodeCandidates.length
      ? listIntroNodeCoords(spec.cellCount)
      : pathNodeCandidates
  const edgeCandidates = stagePath.slice(1).map(([bx, by], edgeIndex) => {
    const [ax, ay] = stagePath[edgeIndex]
    return { ax, ay, bx, by }
  })
  const chosenNodes = pickPathTargetsDeterministic(nodeCandidates, spec.nodeCount, stageIndex)
  const chosenEdges = pickPathTargetsDeterministic(edgeCandidates, spec.edgeCount, stageIndex + 1000)
  const nodeTargets = chosenNodes.map(([x, y], index) => ({
    id: `intro-hex-node-${stageIndex}-${index}-${x},${y}`,
    kind: 'node' as const,
    position: { x, y },
  }))
  const edgeTargets = chosenEdges.map(({ ax, ay, bx, by }, index) => ({
    id: `intro-hex-edge-${stageIndex}-${index}-${introEdgeKey(ax, ay, bx, by)}`,
    kind: 'edge' as const,
    position: { x: (ax + bx) / 2, y: (ay + by) / 2 },
    edgeKey: introEdgeKey(ax, ay, bx, by),
  }))
  return [...nodeTargets, ...edgeTargets]
}

function getIntroCellCount(kind: TileKind, stageIndex: number) {
  if (kind === 'gap-line') {
    const spec = GAP_INTRO_STAGE_SPECS[stageIndex] ?? GAP_INTRO_STAGE_SPECS[GAP_INTRO_STAGE_SPECS.length - 1]
    return spec.cellCount
  }
  if (kind === 'stars') {
    const spec = STAR_INTRO_SPECS[stageIndex] ?? STAR_INTRO_SPECS[STAR_INTRO_SPECS.length - 1]
    return spec.cellCount
  }
  if (kind === 'color-squares') {
    const spec =
      COLOR_SQUARE_INTRO_SPECS[stageIndex] ??
      COLOR_SQUARE_INTRO_SPECS[COLOR_SQUARE_INTRO_SPECS.length - 1]
    return spec.cellCount
  }
  if (kind === 'hexagon') {
    const spec = HEX_INTRO_STAGE_SPECS[stageIndex] ?? HEX_INTRO_STAGE_SPECS[HEX_INTRO_STAGE_SPECS.length - 1]
    return spec.cellCount
  }
  if (kind === 'triangles') {
    const spec =
      TRIANGLE_INTRO_SPECS[stageIndex] ??
      TRIANGLE_INTRO_SPECS[TRIANGLE_INTRO_SPECS.length - 1]
    return spec.cellCount
  }
  if (isFixedPolyominoIntroKind(kind)) {
    const spec = getPolyominoIntroSpec(kind, stageIndex)
    return spec.cellCount
  }
  const stageCellCount = INTRO_STAGE_CELL_COUNTS[stageIndex] ?? 3
  const minCellCount = INTRO_ONE_BY_ONE_SAFE_SYMBOLS.has(kind) ? 1 : 2
  return Math.max(stageCellCount, minCellCount)
}

function App() {
  const [view, setView] = useState<View>('overview')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [introKind, setIntroKind] = useState<TileKind>('gap-line')
  const [introStageIndex, setIntroStageIndex] = useState(0)
  const [introProgress, setIntroProgress] = useState<IntroProgress>(() => loadIntroProgress())

  useEffect(() => {
    window.localStorage.setItem(INTRO_PROGRESS_STORAGE_KEY, JSON.stringify(introProgress))
  }, [introProgress])

  const selectedTiles = useMemo(
    () => TILES.filter((tile) => selectedIds.includes(tile.id)),
    [selectedIds]
  )

  const customTiles = useMemo(
    () =>
      TILES.map((tile) => ({
        ...tile,
        active: introProgress[tile.kind] >= INTRO_PUZZLE_COUNT,
      })),
    [introProgress]
  )

  const unlockedSymbolCount = useMemo(
    () => customTiles.filter((tile) => tile.active).length,
    [customTiles]
  )

  const introStageSeed = INTRO_SEEDS_BY_KIND[introKind][introStageIndex]
  const introCellCount = getIntroCellCount(introKind, introStageIndex)
  const introForcedEdgeKeys = introKind === 'gap-line'
    ? buildGapIntroStageEdgeKeys(introStageIndex)
    : introKind === 'stars'
      ? buildStarIntroStageEdgeKeys(introStageIndex)
    : introKind === 'triangles'
      ? buildTriangleIntroStageEdgeKeys(introStageIndex)
    : isFixedPolyominoIntroKind(introKind)
      ? buildPolyominoIntroStageEdgeKeys(introKind, introStageIndex)
    : introKind === 'color-squares'
      ? buildColorSquareIntroStageEdgeKeys(introStageIndex)
    : introKind === 'hexagon'
      ? listIntroFullEdgeKeys(introCellCount)
      : undefined
  const introForcedColorSquares =
    introKind === 'color-squares'
      ? buildColorSquareIntroStageSquares(introStageIndex)
      : introKind === 'stars'
        ? buildStarIntroStageSquares(introStageIndex)
        : undefined
  const introForcedStarTargets =
    introKind === 'stars' ? buildStarIntroStageTargets(introStageIndex) : undefined
  const introForcedTriangleTargets =
    introKind === 'triangles' ? buildTriangleIntroStageTargets(introStageIndex) : undefined
  const introForcedPolyominoSymbols =
    isFixedPolyominoIntroKind(introKind)
      ? buildPolyominoIntroStageSymbols(introKind, introStageIndex)
      : undefined
  const introGeometry = getIntroGeometry(introKind, introStageIndex)
  const introForcedHexTargets =
    introKind === 'hexagon' ? buildHexIntroStageTargets(introStageIndex) : undefined
  const introHideGaps =
    introKind === 'color-squares' ||
    introKind === 'stars' ||
    introKind === 'triangles' ||
      (
        isFixedPolyominoIntroKind(introKind) &&
        (
          introKind === 'negative-polyomino' ||
          introKind === 'rotated-negative-polyomino' ||
          introStageIndex !== 7
        )
      )
  const introDisplayGridLabel = introGeometry
    ? `${introGeometry.width}x${introGeometry.height}`
    : `${introCellCount}x${introCellCount}`
  const introSolvedCount = introProgress[introKind] ?? 0
  const introCompleted = introSolvedCount >= INTRO_PUZZLE_COUNT
  const introCanGoPrev = introStageIndex > 0
  const introCanGoNext =
    introStageIndex < INTRO_PUZZLE_COUNT - 1 && introStageIndex < introSolvedCount
  const introDisplayTile = TILES_BY_KIND.get(introKind)
  const introBundleTiles = getIntroKindBundle(introKind)
    .map((kind) => TILES_BY_KIND.get(kind))
    .filter((tile): tile is Tile => tile !== undefined)

  if (view === 'overview') {
    return (
      <OverviewPage
        unlockedCount={unlockedSymbolCount}
        totalCount={TILES.length}
        onOpenIntro={() => setView('intro-home')}
        onOpenCustom={() => setView('custom-home')}
      />
    )
  }

  if (view === 'intro-home') {
    return (
      <IntroPage
        tiles={INTRO_TILES}
        progressByKind={introProgress}
        puzzleCount={INTRO_PUZZLE_COUNT}
        onBack={() => setView('overview')}
        onSelectSymbol={(kind) => {
          if (!isIntroKindAvailable(kind)) return
          setIntroKind(kind)
          setIntroStageIndex(Math.min(introProgress[kind], INTRO_PUZZLE_COUNT - 1))
          setView('intro-puzzle')
        }}
      />
    )
  }

  if (view === 'intro-puzzle') {
    return (
      <PuzzlePage
        selectedTiles={introBundleTiles}
        onBack={() => setView('intro-home')}
        allowAutoSolve={false}
        allowNewPuzzle={false}
        allowLastSolved={false}
        cellCount={introCellCount}
        fixedSeed={introStageSeed}
        forcedEdgeKeys={introForcedEdgeKeys}
        hideGaps={introHideGaps}
        forcedColorSquares={introForcedColorSquares}
        forcedStarTargets={introForcedStarTargets}
        forcedTriangleTargets={introForcedTriangleTargets}
        forcedPolyominoSymbols={introForcedPolyominoSymbols}
        forcedHexTargets={introForcedHexTargets}
        forcedStartPoint={introGeometry?.start}
        forcedEndPoint={introGeometry?.end}
        viewBoxOverride={introGeometry?.viewBox}
        titleOverride={introDisplayTile ? `${introDisplayTile.label} - Intro` : 'Intro'}
        subtitleOverride={`Puzzle ${introStageIndex + 1} / ${INTRO_PUZZLE_COUNT} - ${introDisplayGridLabel}${introCompleted ? ' - completed' : ''}`}
        progression={{
          current: introStageIndex + 1,
          total: INTRO_PUZZLE_COUNT,
          canPrev: introCanGoPrev,
          canNext: introCanGoNext,
          onPrev: () => {
            if (!introCanGoPrev) return
            setIntroStageIndex((prev) => Math.max(0, prev - 1))
          },
          onNext: () => {
            if (!introCanGoNext) return
            setIntroStageIndex((prev) => Math.min(INTRO_PUZZLE_COUNT - 1, prev + 1))
          },
        }}
        onSolved={() => {
          setIntroProgress((prev) => {
            const current = prev[introKind] ?? 0
            if (introStageIndex !== current || current >= INTRO_PUZZLE_COUNT) {
              return prev
            }
            return {
              ...prev,
              [introKind]: current + 1,
            }
          })
        }}
      />
    )
  }

  if (view === 'custom-home') {
    return (
      <HomePage
        tiles={customTiles}
        selectedIds={selectedIds}
        onToggle={(tile) => {
          if (!tile.active) return
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
              return enforceNegatorComboRule(next)
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
            if (tile.kind === 'negator' && hasNegatorBlockedCombo(prev)) {
              return prev
            }
            if (prev.length >= 4) return prev
            return enforceNegatorComboRule([...prev, tile.id])
          })
        }}
        onStart={() => {
          if (selectedIds.length === 0) return
          setView('custom-puzzle')
        }}
        onBack={() => setView('overview')}
      />
    )
  }

  return (
    <PuzzlePage
      selectedTiles={selectedTiles}
      onBack={() => setView('custom-home')}
      titleOverride={selectedTiles.length === 1 ? `${selectedTiles[0].label}-Puzzles` : 'Custom Set Puzzles'}
      subtitleOverride={`Symbols: ${selectedTiles.map((tile) => tile.label).join(', ')}`}
    />
  )
}

export default App

