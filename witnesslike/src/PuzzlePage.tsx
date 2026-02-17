import { useMemo, useRef, useState } from 'react'
import type { Tile, TileKind } from './HomePage'
import { END, END_CAP_LENGTH, GAP_SIZE, START, VIEWBOX } from './puzzleConstants'
import type { Point } from './puzzleConstants'
import {
  buildEdges,
  buildFullEdges,
  closestPointOnSegment,
  distance,
  edgeKey,
  hasPath,
  hexPoints,
  listAllEdges,
  mulberry32,
  neighbors,
  shapeBounds,
  shuffle,
  starPoints,
} from './puzzleUtils'
import type { ColorSquare } from './symbols/colorSquares'
import { checkColorSquares, generateColorSquaresForEdges } from './symbols/colorSquares'
import type { HexTarget } from './symbols/hexagon'
import { checkHexTargets, generateHexTargets } from './symbols/hexagon'
import type { StarTarget } from './symbols/stars'
import { checkStars, generateStarsForEdges } from './symbols/stars'
import type { PolyominoSymbol } from './symbols/polyomino'
import {
  buildPolyominoPalette,
  checkPolyominoes,
  generatePolyominoesForEdges,
} from './symbols/polyomino'

type Puzzle = {
  edges: Set<string>
}

type Result = 'idle' | 'success' | 'fail'

type PuzzlePageProps = {
  selectedTiles: Tile[]
  onBack: () => void
}

function generatePuzzle(seed: number): Puzzle {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = mulberry32(seed + attempt * 97)
    const edges = buildEdges(rng)
    if (hasPath(edges)) {
      return { edges }
    }
  }
  const fallbackEdges = buildEdges(mulberry32(seed))
  return { edges: fallbackEdges }
}

function pickActiveKinds(kinds: TileKind[], rng: () => number) {
  if (kinds.length <= 1) return kinds
  const active = kinds.filter(() => rng() < 0.6)
  if (active.length >= 2) return active
  return shuffle(kinds, rng).slice(0, 2)
}

function PuzzlePage({ selectedTiles, onBack }: PuzzlePageProps) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [path, setPath] = useState<Point[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [result, setResult] = useState<Result>('idle')
  const boardRef = useRef<SVGSVGElement | null>(null)

  const selectedKinds = useMemo<TileKind[]>(
    () => selectedTiles.map((tile) => tile.kind).filter((kind) => kind !== 'placeholder'),
    [selectedTiles]
  )

  const allEdges = useMemo(() => listAllEdges(), [])

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const { puzzle, activeKinds, colorSquares, starTargets, polyominoSymbols, hexTargets } = useMemo(() => {
    const baseKinds = selectedKinds.length > 0 ? selectedKinds : (['gap-line'] as TileKind[])
    const minActive = baseKinds.length >= 2 ? 2 : 1
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const rng = mulberry32(seed + attempt * 313 + 11)
      let active: TileKind[]

      if (baseKinds.length >= 2) {
        if (attempt < 50) {
          active = [...baseKinds]
        } else if (attempt < 70) {
          active = shuffle(baseKinds, rng).slice(0, baseKinds.length - 1)
        } else {
          active = pickActiveKinds(baseKinds, rng)
        }
      } else {
        active = [...baseKinds]
      }

      let edges = active.includes('gap-line')
        ? generatePuzzle(seed + attempt * 131).edges
        : buildFullEdges()

      let colorSquares: ColorSquare[] = []
      let starTargets: StarTarget[] = []
      let polyominoSymbols: PolyominoSymbol[] = []
      let solutionPath: Point[] | null = null

      if (active.includes('color-squares')) {
        const desiredColorCount = rng() < 0.5 ? 2 : 3
        let colorResult = generateColorSquaresForEdges(
          edges,
          seed + attempt * 2001,
          desiredColorCount
        )

        if (!colorResult && active.includes('gap-line')) {
          const fullEdges = buildFullEdges()
          const retry = generateColorSquaresForEdges(
            fullEdges,
            seed + attempt * 2001 + 99,
            desiredColorCount
          )
          if (retry) {
            edges = fullEdges
            colorResult = retry
            active = active.filter((kind) => kind !== 'gap-line')
          }
        }

        if (colorResult) {
          colorSquares = colorResult.squares
          solutionPath = colorResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'color-squares')
        }
      }

      if (active.includes('polyomino')) {
        const baseUsedCells = new Set<string>(
          colorSquares.map((square) => `${square.cellX},${square.cellY}`)
        )
        const polyPalette = buildPolyominoPalette(
          rng,
          colorSquares,
          active.includes('stars')
        )
        const minRegions =
          baseKinds.length === 1 && baseKinds[0] === 'polyomino' ? 1 : 1
        let polyResult = generatePolyominoesForEdges(
          edges,
          seed + attempt * 9107,
          minRegions,
          new Set(baseUsedCells),
          polyPalette,
          solutionPath ?? undefined
        )

        if (!polyResult && active.includes('gap-line')) {
          const fullEdges = buildFullEdges()
          const retry = generatePolyominoesForEdges(
            fullEdges,
            seed + attempt * 9107 + 31,
            minRegions,
            new Set(baseUsedCells),
            polyPalette,
            solutionPath ?? undefined
          )
          if (retry) {
            edges = fullEdges
            polyResult = retry
            active = active.filter((kind) => kind !== 'gap-line')
          }
        }

        if (polyResult) {
          polyominoSymbols = polyResult.symbols
          solutionPath = solutionPath ?? polyResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'polyomino')
        }
      }

      if (active.includes('stars')) {
        const minPairs =
          baseKinds.length === 1 && baseKinds[0] === 'stars' ? 2 : 1
        const starResult = generateStarsForEdges(
          edges,
          seed + attempt * 5003,
          minPairs,
          active.includes('color-squares') ? colorSquares : [],
          active.includes('polyomino') ? polyominoSymbols : [],
          solutionPath ?? undefined
        )
        if (starResult) {
          starTargets = starResult.stars
          solutionPath = solutionPath ?? starResult.solutionPath
        } else {
          active = active.filter((kind) => kind !== 'stars')
        }
      }

      let hexTargets: HexTarget[] = []
      if (active.includes('hexagon')) {
        hexTargets = generateHexTargets(edges, seed + attempt * 7)
      }

      if (active.length < minActive) continue

      return {
        puzzle: { edges },
        activeKinds: active,
        colorSquares,
        starTargets,
        polyominoSymbols,
        hexTargets,
      }
    }

    return {
      puzzle: generatePuzzle(seed),
      activeKinds: baseKinds.slice(0, Math.min(baseKinds.length, Math.max(minActive, 1))),
      colorSquares: [],
      starTargets: [],
      polyominoSymbols: [],
      hexTargets: [],
    }
  }, [seed, selectedKinds])

  const gaps = useMemo(
    () => allEdges.filter((edge) => !puzzle.edges.has(edge.key)),
    [allEdges, puzzle.edges]
  )

  const title =
    selectedTiles.length === 1 ? `${selectedTiles[0].label}-Puzzles` : 'Custom Set Puzzles'
  const subtitle =
    selectedTiles.length === 1
      ? selectedTiles[0].description
      : `Symbols: ${selectedTiles.map((tile) => tile.label).join(', ')}`

  const resetPath = () => {
    setPath([])
    setIsDrawing(false)
    setLocked(false)
    setCursor(null)
    setResult('idle')
  }

  const handleNewPuzzle = () => {
    setSeed(Math.floor(Math.random() * 1_000_000_000))
    resetPath()
  }

  const handleStartClick = () => {
    if (locked) return
    setIsDrawing(true)
    setPath([START])
    setCursor(START)
    setResult('idle')
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || locked || path.length === 0) return
    const svg = boardRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * VIEWBOX.w + VIEWBOX.x
    const py = ((event.clientY - rect.top) / rect.height) * VIEWBOX.h + VIEWBOX.y
    const pointer = { x: px, y: py }

    const last = path[path.length - 1]
    if (!last) return

    const candidates = neighbors(last)
      .map((neighbor) => ({ neighbor, key: edgeKey(last, neighbor) }))
      .filter((candidate) => puzzle.edges.has(candidate.key))

    if (candidates.length === 0) {
      setCursor(last)
      return
    }

    let best = {
      neighbor: candidates[0].neighbor,
      point: last,
      t: 0,
      distance: Number.POSITIVE_INFINITY,
    }

    for (const candidate of candidates) {
      const closest = closestPointOnSegment(pointer, last, candidate.neighbor)
      const dist = distance(pointer, closest)
      if (dist < best.distance) {
        best = { neighbor: candidate.neighbor, point: closest, t: closest.t, distance: dist }
      }
    }

    if (last.x === END.x && last.y === END.y) {
      const endCapPoint = { x: END.x + END_CAP_LENGTH, y: END.y }
      const closest = closestPointOnSegment(pointer, END, endCapPoint)
      const dist = distance(pointer, closest)
      if (dist < best.distance) {
        setCursor({ x: closest.x, y: closest.y })
        return
      }
    }

    setCursor({ x: best.point.x, y: best.point.y })

    const shouldAdvance = best.t > 0.82 || distance(pointer, best.neighbor) < 0.32
    if (!shouldAdvance) return

    setPath((prev) => {
      const current = prev[prev.length - 1]
      if (!current) return prev

      const secondLast = prev[prev.length - 2]
      if (secondLast && secondLast.x === best.neighbor.x && secondLast.y === best.neighbor.y) {
        return prev.slice(0, -1)
      }

      const nextEdge = edgeKey(current, best.neighbor)
      for (let i = 1; i < prev.length; i += 1) {
        if (edgeKey(prev[i - 1], prev[i]) === nextEdge) {
          return prev
        }
      }

      if (prev.some((point) => point.x === best.neighbor.x && point.y === best.neighbor.y)) {
        return prev
      }

      return [...prev, best.neighbor]
    })
  }

  const handleContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    resetPath()
  }

  const handleCheck = () => {
    if (locked || result === 'success') return
    const last = path[path.length - 1]
    if (!last) return

    const isConnected = path[0].x === START.x && path[0].y === START.y
    const atEnd = last.x === END.x && last.y === END.y
    if (!isConnected || !atEnd) return

    const usedEdges = new Set<string>()
    for (let i = 1; i < path.length; i += 1) {
      usedEdges.add(edgeKey(path[i - 1], path[i]))
    }

    if (activeKinds.includes('hexagon')) {
      const collected = checkHexTargets(path, usedEdges, hexTargets)
      if (!collected) {
        console.log('Solution failed: not all hexagons collected.')
        setResult('fail')
        setIsDrawing(false)
        setCursor(null)
        return
      }
    }

    if (activeKinds.includes('color-squares')) {
      if (!checkColorSquares(usedEdges, colorSquares)) {
        console.log('Solution failed: color squares share a region.')
        setResult('fail')
        setIsDrawing(false)
        setCursor(null)
        return
      }
    }

    if (activeKinds.includes('stars')) {
      if (!checkStars(usedEdges, starTargets, colorSquares, polyominoSymbols)) {
        console.log('Solution failed: star pairing mismatch.')
        setResult('fail')
        setIsDrawing(false)
        setCursor(null)
        return
      }
    }

    if (activeKinds.includes('polyomino')) {
      if (!checkPolyominoes(usedEdges, polyominoSymbols)) {
        console.log('Solution failed: polyomino region cannot be tiled by given shapes.')
        setResult('fail')
        setIsDrawing(false)
        setCursor(null)
        return
      }
    }

    setResult('success')
    setLocked(true)
    setIsDrawing(false)
    setCursor(null)

    window.setTimeout(() => {
      setSeed(Math.floor(Math.random() * 1_000_000_000))
      resetPath()
    }, 650)
  }

  const last = path[path.length - 1]
  const isConnected = path.length > 0 && path[0].x === START.x && path[0].y === START.y
  const canCheck = !!last && isConnected && last.x === END.x && last.y === END.y
  const displayPoints = [...path]
  if (isDrawing && cursor) {
    displayPoints.push(cursor)
  } else if (canCheck) {
    displayPoints.push({ x: END.x + END_CAP_LENGTH, y: END.y })
  }
  const pathPoints = displayPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const boardClass = ['board', result !== 'idle' ? result : '', canCheck ? 'can-check' : '']
    .filter(Boolean)
    .join(' ')
  const startActive = isDrawing || path.length > 0
  const startClass = [
    'start',
    startActive ? 'active' : '',
    result === 'success' ? 'success' : '',
    result === 'fail' ? 'fail' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="app puzzle">
      <div className="puzzle-top">
        <button className="back-button" onClick={onBack} aria-label="Back">
          <span aria-hidden="true">&lt;</span>
        </button>
        <div className="puzzle-hero">
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="board-shell">
        <svg
          ref={boardRef}
          className={boardClass}
          viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
          role="img"
          aria-label="Puzzle Grid"
          onPointerMove={handlePointerMove}
          onContextMenu={handleContextMenu}
        >
          <rect className="board-bg" x={-0.45} y={-0.45} width={4.9} height={4.9} />
          <g className="edges">
            {allEdges.map((segment) => (
              <line
                key={segment.key}
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
              />
            ))}
          </g>
          <g className="gaps">
            {gaps.map((gap) => {
              const midX = (gap.a.x + gap.b.x) / 2
              const midY = (gap.a.y + gap.b.y) / 2
              const half = GAP_SIZE / 2
              return (
                <rect
                  key={`gap-${gap.key}`}
                  className="gap"
                  x={midX - half}
                  y={midY - half}
                  width={GAP_SIZE}
                  height={GAP_SIZE}
                  rx={0.05}
                />
              )
            })}
          </g>
          {hexTargets.length > 0 && (
            <g className="hexes">
              {hexTargets.map((target) => (
                <polygon
                  key={`hex-${target.id}`}
                  className="hexagon"
                  points={hexPoints(target.position, 0.12)}
                />
              ))}
            </g>
          )}
          {colorSquares.length > 0 && (
            <g className="color-squares">
              {colorSquares.map((square, index) => (
                <rect
                  key={`color-${square.cellX}-${square.cellY}-${index}`}
                  className="color-square"
                  x={square.cellX + 0.5 - 0.17}
                  y={square.cellY + 0.5 - 0.17}
                  width={0.34}
                  height={0.34}
                  rx={0.08}
                  style={{ fill: square.color }}
                />
              ))}
            </g>
          )}
          {starTargets.length > 0 && (
            <g className="stars">
              {starTargets.map((star, index) => (
                <polygon
                  key={`star-${star.cellX}-${star.cellY}-${index}`}
                  className="star"
                  points={starPoints({ x: star.cellX + 0.5, y: star.cellY + 0.5 }, 0.19, 0.135)}
                  style={{ fill: star.color }}
                />
              ))}
            </g>
          )}
          {polyominoSymbols.length > 0 && (
            <g className="polyominoes">
              {polyominoSymbols.map((symbol, index) => {
                const bounds = shapeBounds(symbol.shape.cells)
                const unit = 0.145
                const gap = 0.018
                const block = unit - gap
                const offsetX = symbol.cellX + 0.5 - (bounds.width * unit) / 2
                const offsetY = symbol.cellY + 0.5 - (bounds.height * unit) / 2
                return (
                  <g key={`poly-${symbol.cellX}-${symbol.cellY}-${index}`}>
                    {symbol.shape.cells.map((cell, cellIndex) => (
                      <rect
                        key={`poly-cell-${cellIndex}`}
                        className="polyomino-block"
                        x={offsetX + (cell.x - bounds.minX) * unit + gap / 2}
                        y={offsetY + (cell.y - bounds.minY) * unit + gap / 2}
                        width={block}
                        height={block}
                        style={{ fill: symbol.color }}
                        rx={0}
                      />
                    ))}
                  </g>
                )
              })}
            </g>
          )}

          <g className={`end-group ${canCheck ? 'active' : ''}`}>
            <path
              className="end-hit"
              d={`M ${END.x} ${END.y} H ${END.x + END_CAP_LENGTH}`}
              onClick={handleCheck}
            />
            <path
              className="end-cap"
              d={`M ${END.x} ${END.y} H ${END.x + END_CAP_LENGTH}`}
              onClick={handleCheck}
            />
          </g>

          {pathPoints.length > 0 && <polyline className="path" points={pathPoints} />}

          <circle className={startClass} cx={START.x} cy={START.y} r={0.24} onClick={handleStartClick} />
        </svg>
      </section>

      <div className="puzzle-actions">
        <button className="btn primary" onClick={handleNewPuzzle}>
          New puzzle
        </button>
        <p className="puzzle-hint">Right-click resets the path.</p>
      </div>
    </div>
  )
}

export default PuzzlePage
