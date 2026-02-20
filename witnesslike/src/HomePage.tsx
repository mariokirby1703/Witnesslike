import { minesweeperDigitPixels } from './symbols/minesweeperNumbers'

export type TileKind =
  | 'gap-line'
  | 'hexagon'
  | 'color-squares'
  | 'stars'
  | 'arrows'
  | 'chevrons'
  | 'minesweeper-numbers'
  | 'water-droplet'
  | 'cardinal'
  | 'spinner'
  | 'triangles'
  | 'dots'
  | 'diamonds'
  | 'ghost'
  | 'negator'
  | 'sentinel'
  | 'polyomino'
  | 'rotated-polyomino'
  | 'negative-polyomino'
  | 'rotated-negative-polyomino'
  | 'placeholder'

export type Tile = {
  id: number
  label: string
  description: string
  kind: TileKind
  active: boolean
}

type HomePageProps = {
  tiles: Tile[]
  selectedIds: number[]
  onToggle: (tile: Tile) => void
  onStart: () => void
}

function SymbolTile({ kind, variant = 'grid' }: { kind: TileKind; variant?: 'grid' | 'selected' }) {
  const starSvgPoints = (cx: number, cy: number, outer: number, inner: number, spikes = 8) => {
    const points: string[] = []
    const step = Math.PI / spikes
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = -Math.PI / 2 + step * i
      const radius = i % 2 === 0 ? outer : inner
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      points.push(`${x},${y}`)
    }
    return points.join(' ')
  }

  if (kind === 'gap-line') {
    const isSelectedVariant = variant === 'selected'
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect
          x={12}
          y="42"
          width={isSelectedVariant ? 30 : 32}
          height="16"
          rx="0"
          className={isSelectedVariant ? 'tile-gap-block' : 'tile-stroke'}
        />
        <rect
          x={isSelectedVariant ? 58 : 56}
          y="42"
          width={isSelectedVariant ? 30 : 32}
          height="16"
          rx="0"
          className={isSelectedVariant ? 'tile-gap-block' : 'tile-stroke'}
        />
      </svg>
    )
  }

  if (kind === 'hexagon') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon
          points="33,21 67,21 84,50 67,79 33,79 16,50"
          className="tile-hex"
        />
      </svg>
    )
  }

  if (kind === 'color-squares') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="47" y="10" width="6" height="80" rx="3" className="tile-color-bar" />
        <rect x="2" y="30" width="40" height="40" rx="12" className="tile-color-left" />
        <rect x="58" y="30" width="40" height="40" rx="12" className="tile-color-right" />
      </svg>
    )
  }

  if (kind === 'stars') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon
          points={starSvgPoints(25, 50, 24, 16.5)}
          className="tile-star"
        />
        <polygon
          points={starSvgPoints(75, 50, 24, 16.5)}
          className="tile-star"
        />
      </svg>
    )
  }

  if (kind === 'arrows') {
    const offsets = [0, 20]
    const shaftY = 52
    const headCenterY = 52
    const headHalfHeight = 33
    const headTailX = 33
    const headTipX = 72
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <line className="tile-arrow-shaft" x1="8" y1={shaftY} x2={headTipX + offsets[offsets.length - 1] - 6} y2={shaftY} />
        {offsets.map((offset, index) => (
          <polyline
            key={`tile-arrow-head-${index}`}
            points={`${headTailX + offset},${headCenterY - headHalfHeight} ${headTipX + offset},${headCenterY} ${headTailX + offset},${headCenterY + headHalfHeight}`}
            className="tile-arrow-head"
          />
        ))}
      </svg>
    )
  }

  if (kind === 'chevrons') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="tile-chevron" points="0,33 20,33 35,50 20,67 00,67 15,50" />
        <polygon className="tile-chevron" points="32,33 52,33 67,50 52,67 32,67 45,50" />
        <polygon className="tile-chevron" points="64,33 84,33 99,50 84,67 64,67 79,50" />
      </svg>
    )
  }

  if (kind === 'polyomino') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="18" y="18" width="26" height="26" rx="0" className="tile-poly" />
        <rect x="18" y="54" width="26" height="26" rx="0" className="tile-poly" />
        <rect x="54" y="54" width="26" height="26" rx="0" className="tile-poly" />
      </svg>
    )
  }

  if (kind === 'triangles') {
    return (
      <svg viewBox="-12 0 128 100" aria-hidden="true">
        <polygon points="-10,72 10,36 30,72" className="tile-triangle" />
        <polygon points="32,72 52,36 72,72" className="tile-triangle" />
        <polygon points="74,72 94,36 114,72" className="tile-triangle" />
      </svg>
    )
  }

  if (kind === 'dots') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="tile-dot" cx="31" cy="31" r="17" />
        <circle className="tile-dot" cx="69" cy="31" r="17" />
        <circle className="tile-dot" cx="31" cy="69" r="17" />
        <circle className="tile-dot" cx="69" cy="69" r="17" />
      </svg>
    )
  }

  if (kind === 'diamonds') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="tile-diamond" points="26,26 48,48 26,70 4,48" />
        <polygon className="tile-diamond" points="74,26 96,48 74,70 52,48" />
      </svg>
    )
  }

  if (kind === 'ghost') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path
          className="tile-ghost-body"
          d="M 16 80 L 24 34 C 28 20 38 12 50 12 C 62 12 72 20 76 34 L 84 80 L 68 72 L 58 84 L 50 74 L 42 84 L 32 72 Z"
        />
        <circle className="tile-ghost-eye" cx="37" cy="45" r="5.3" />
        <circle className="tile-ghost-eye" cx="63" cy="45" r="5.3" />
      </svg>
    )
  }

  if (kind === 'minesweeper-numbers') {
    const tileDigits: Array<{ value: 1 | 2 | 3 | 4; col: 0 | 1; row: 0 | 1 }> = [
      { value: 1, col: 0, row: 0 },
      { value: 2, col: 1, row: 0 },
      { value: 3, col: 0, row: 1 },
      { value: 4, col: 1, row: 1 },
    ]
    const pixel = 5.5
    const digitWidth = 5 * pixel
    const digitHeight = 7 * pixel
    const gapX = 14
    const gapY = 8
    const blockWidth = digitWidth * 2 + gapX
    const blockHeight = digitHeight * 2 + gapY
    const originX = (100 - blockWidth) / 2
    const originY = (100 - blockHeight) / 2
    const shadowOffset = 1.1
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {tileDigits.map((digit) => {
          const pixels = minesweeperDigitPixels(digit.value)
          const baseX = originX + digit.col * (digitWidth + gapX)
          const baseY = originY + digit.row * (digitHeight + gapY)
          return (
            <g key={`mine-tile-shadow-${digit.value}`}>
              {pixels.map((point, index) => (
                <rect
                  key={`mine-tile-shadow-${digit.value}-${index}`}
                  className="tile-mine-shadow"
                  x={baseX + point.x * pixel + shadowOffset}
                  y={baseY + point.y * pixel + shadowOffset}
                  width={pixel}
                  height={pixel}
                  rx="0"
                />
              ))}
            </g>
          )
        })}
        {tileDigits.map((digit) => {
          const pixels = minesweeperDigitPixels(digit.value)
          const baseX = originX + digit.col * (digitWidth + gapX)
          const baseY = originY + digit.row * (digitHeight + gapY)
          return (
            <g key={`mine-tile-fill-${digit.value}`}>
              {pixels.map((point, index) => (
                <rect
                  key={`mine-tile-fill-${digit.value}-${index}`}
                  className="tile-mine-fill"
                  x={baseX + point.x * pixel}
                  y={baseY + point.y * pixel}
                  width={pixel}
                  height={pixel}
                  rx="0"
                />
              ))}
            </g>
          )
        })}
      </svg>
    )
  }

  if (kind === 'water-droplet') {
    const dropletPath =
      'M50 14 C67 30 77 44 77 60 C77 79 65 93 50 93 C35 93 23 79 23 60 C23 44 33 30 50 14 Z'
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="translate(0 -3.5)">
          <path className="tile-water-droplet" d={dropletPath} />
          <path className="tile-water-droplet-rim" d={dropletPath} />
          <ellipse className="tile-water-droplet-gloss" cx="43" cy="39" rx="9.5" ry="6.8" transform="rotate(-24 43 39)" />
          <circle className="tile-water-droplet-bubble" cx="58.5" cy="65" r="3.8" />
        </g>
      </svg>
    )
  }

  if (kind === 'cardinal') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="translate(50 50)">
          <rect className="tile-cardinal-body" x={-6.5} y={-25} width={13} height={17.5} rx={5.2} />
          <rect className="tile-cardinal-body" x={-6.5} y={7.5} width={13} height={17.5} rx={5.2} />
          <rect className="tile-cardinal-body" x={-25} y={-6.5} width={17.5} height={13} rx={5.2} />
          <rect className="tile-cardinal-body" x={7.5} y={-6.5} width={17.5} height={13} rx={5.2} />
          <polyline className="tile-cardinal-chevron" points="-13,-30 0,-43 13,-30" />
          <polyline className="tile-cardinal-chevron" points="30,-13 43,0 30,13" />
          <polyline className="tile-cardinal-chevron" points="13,30 0,43 -13,30" />
          <polyline className="tile-cardinal-chevron" points="-30,13 -43,0 -30,-13" />
        </g>
      </svg>
    )
  }

  if (kind === 'sentinel') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path className="tile-sentinel-arc" d="M 18 66 A 32 32 0 0 1 82 66" />
        <path className="tile-sentinel-core" d="M 39 66 A 11 11 0 0 1 61 66 Z" />
      </svg>
    )
  }

  if (kind === 'spinner') {
    const spinnerScale = variant === 'selected' ? 1.2 : 1.14
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform={`translate(50 50) scale(${spinnerScale}) translate(-50 -50)`}>
          <circle
            className="tile-spinner-ring"
            cx="50"
            cy="50"
            r="28"
            pathLength="100"
            strokeDasharray="86 14"
            transform="rotate(-10 50 50)"
          />
          <polygon className="tile-spinner-head" points="62.8,22.6 69.1,30.7 59.6,29.3" />
        </g>
      </svg>
    )
  }

  if (kind === 'negator') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="translate(50 52)">
          <line className="tile-negator-arm" x1="0" y1="0" x2="0" y2="-22" />
          <line className="tile-negator-arm" x1="0" y1="0" x2="20" y2="12" />
          <line className="tile-negator-arm" x1="0" y1="0" x2="-20" y2="12" />
        </g>
      </svg>
    )
  }

  if (kind === 'rotated-polyomino') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(12 50 50)">
          <rect x="9" y="24" width="25" height="25" rx="0" className="tile-poly" />
          <rect x="39" y="24" width="25" height="25" rx="0" className="tile-poly" />
          <rect x="69" y="24" width="25" height="25" rx="0" className="tile-poly" />
          <rect x="9" y="54" width="25" height="25" rx="0" className="tile-poly" />
        </g>
      </svg>
    )
  }

  if (kind === 'negative-polyomino') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="39" y="20" width="22" height="22" rx="0" className="tile-poly-negative" />
        <rect x="4" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
        <rect x="39" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
        <rect x="74" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
      </svg>
    )
  }

  if (kind === 'rotated-negative-polyomino') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(-12 50 50)">
          <rect x="21" y="39" width="22" height="22" rx="0" className="tile-poly-negative" />
          <rect x="57" y="39" width="22" height="22" rx="0" className="tile-poly-negative" />
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="20" y="20" width="60" height="60" rx="18" className="tile-stroke muted" />
      <circle cx="50" cy="50" r="8" className="tile-fill muted" />
    </svg>
  )
}

function HomePage({ tiles, selectedIds, onToggle, onStart }: HomePageProps) {
  const selectedCount = selectedIds.length
  const maxReached = selectedCount >= 4
  const selectedTilesInOrder = selectedIds
    .map((id) => tiles.find((tile) => tile.id === id))
    .filter((tile): tile is Tile => tile !== undefined)
  const selectedKinds = new Set(
    tiles
      .filter((tile) => selectedIds.includes(tile.id))
      .map((tile) => tile.kind)
  )
  const hasNegatorPrereq =
    selectedKinds.has('hexagon') ||
    selectedKinds.has('color-squares') ||
    selectedKinds.has('stars') ||
    selectedKinds.has('arrows') ||
    selectedKinds.has('chevrons') ||
    selectedKinds.has('minesweeper-numbers') ||
    selectedKinds.has('water-droplet') ||
    selectedKinds.has('cardinal') ||
    selectedKinds.has('spinner') ||
    selectedKinds.has('sentinel') ||
    selectedKinds.has('ghost') ||
    selectedKinds.has('triangles') ||
    selectedKinds.has('dots') ||
    selectedKinds.has('diamonds') ||
    selectedKinds.has('polyomino') ||
    selectedKinds.has('rotated-polyomino') ||
    selectedKinds.has('negative-polyomino') ||
    selectedKinds.has('rotated-negative-polyomino')
  return (
    <div className="app home">
      <header className="home-hero">
        <div>
          <p className="eyebrow">Witness-like Puzzle Maker</p>
          <h1>Symbol Selector</h1>
          <p className="subtitle">Select up to 4 symbols to generate mixed puzzles.</p>
        </div>
      </header>
      <section className="symbol-grid" aria-label="Symbol selection">
        {tiles.map((tile) => {
          const isSelected = selectedIds.includes(tile.id)
          const missingPolyPrereq =
            (tile.kind === 'negative-polyomino' || tile.kind === 'rotated-negative-polyomino') &&
            !isSelected &&
            !selectedKinds.has('polyomino') &&
            !selectedKinds.has('rotated-polyomino')
          const missingNegatorPrereq =
            tile.kind === 'negator' &&
            !isSelected &&
            !hasNegatorPrereq
          const prereqLocked = missingPolyPrereq || missingNegatorPrereq
          const isDisabled = !tile.active || (!isSelected && maxReached) || prereqLocked
          return (
          <div
            key={tile.id}
            className={`symbol-tile ${isSelected ? 'selected' : ''} ${prereqLocked ? 'prereq-locked' : ''}`}
          >
            <button
              type="button"
              className={`symbol-button ${tile.active ? 'active' : 'placeholder'} ${
                isSelected ? 'selected' : ''
              } ${prereqLocked ? 'prereq-locked' : ''}`}
              onClick={tile.active ? () => onToggle(tile) : undefined}
              disabled={isDisabled}
              aria-label={tile.label}
            >
              <SymbolTile kind={tile.kind} />
            </button>
            <span className="symbol-label">{tile.label}</span>
          </div>
          )
        })}
      </section>
      <section className="home-actions">
        <div>
          <p className="selection-title">Selected symbols</p>
          {selectedTilesInOrder.length > 0 && (
            <div className="selected-symbols-order" aria-label="Selected symbols in chosen order">
              {selectedTilesInOrder.map((tile) => (
                <div className="selected-symbol-chip" key={`selected-${tile.id}`}>
                  <div className="selected-symbol-icon" aria-hidden="true">
                    <SymbolTile kind={tile.kind} variant="selected" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn primary" onClick={onStart} disabled={selectedCount === 0}>
          Start puzzles
        </button>
      </section>
    </div>
  )
}

export default HomePage



