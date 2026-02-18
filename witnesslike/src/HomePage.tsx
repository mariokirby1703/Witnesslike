export type TileKind =
  | 'gap-line'
  | 'hexagon'
  | 'color-squares'
  | 'stars'
  | 'triangles'
  | 'polyomino'
  | 'rotated-polyomino'
  | 'negative-polyomino'
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

function SymbolTile({ kind }: { kind: TileKind }) {
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
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="12" y="42" width="32" height="16" rx="0" className="tile-stroke" />
        <rect x="56" y="42" width="32" height="16" rx="0" className="tile-stroke" />
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
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="0,76 14,50 28,76" className="tile-triangle" />
        <polygon points="36,76 50,50 64,76" className="tile-triangle" />
        <polygon points="72,76 86,50 100,76" className="tile-triangle" />
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
        <rect x="6" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
        <rect x="39" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
        <rect x="72" y="56" width="22" height="22" rx="0" className="tile-poly-negative" />
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
  const selectedKinds = new Set(
    tiles
      .filter((tile) => selectedIds.includes(tile.id))
      .map((tile) => tile.kind)
  )
  return (
    <div className="app home">
      <header className="home-hero">
        <div>
          <p className="eyebrow">Witness-like Archive</p>
          <h1>Symbol Boards</h1>
          <p className="subtitle">Select up to 4 symbols to generate mixed puzzles.</p>
        </div>
      </header>
      <section className="symbol-grid" aria-label="Symbol selection">
        {tiles.map((tile) => {
          const isSelected = selectedIds.includes(tile.id)
          const missingPolyPrereq =
            tile.kind === 'negative-polyomino' &&
            !isSelected &&
            !selectedKinds.has('polyomino') &&
            !selectedKinds.has('rotated-polyomino')
          const isDisabled = !tile.active || (!isSelected && maxReached) || missingPolyPrereq
          return (
          <div
            key={tile.id}
            className={`symbol-tile ${isSelected ? 'selected' : ''} ${missingPolyPrereq ? 'prereq-locked' : ''}`}
          >
            <button
              type="button"
              className={`symbol-button ${tile.active ? 'active' : 'placeholder'} ${
                isSelected ? 'selected' : ''
              } ${missingPolyPrereq ? 'prereq-locked' : ''}`}
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
          <p className="selection-count">
            {selectedCount} / 4
          </p>
        </div>
        <button className="btn primary" onClick={onStart} disabled={selectedCount === 0}>
          Start puzzles
        </button>
      </section>
    </div>
  )
}

export default HomePage
