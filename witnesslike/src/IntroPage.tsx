import { SymbolTile } from './HomePage'
import type { Tile, TileKind } from './HomePage'

type IntroPageProps = {
  tiles: Tile[]
  progressByKind: Record<TileKind, number>
  puzzleCount: number
  onBack: () => void
  onSelectSymbol: (kind: TileKind) => void
}

function IntroPage({
  tiles,
  progressByKind,
  puzzleCount,
  onBack,
  onSelectSymbol,
}: IntroPageProps) {
  return (
    <div className="app home intro-home">
      <header className="home-hero">
        <div className="intro-header-row">
          <button
            type="button"
            className="btn ghost intro-back-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <svg className="container-back-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="12" x2="8" y2="12" />
              <polyline points="12,8 8,12 12,16" />
            </svg>
          </button>
          <div>
            <p className="eyebrow">Symbol Progression</p>
            <h1>Intro Puzzles</h1>
            <p className="subtitle">Complete 10/10 for each symbol to unlock it for custom mode.</p>
          </div>
        </div>
      </header>

      <section className="symbol-grid" aria-label="Introduction symbols">
        {tiles.map((tile) => {
          const solved = progressByKind[tile.kind] ?? 0
          const completed = solved >= puzzleCount
          const locked = !tile.active
          return (
            <div
              key={tile.id}
              className={`symbol-tile intro-symbol-tile ${completed ? 'completed' : ''} ${locked ? 'prereq-locked' : ''}`}
            >
              <button
                type="button"
                className={`symbol-button intro-symbol-button ${locked ? 'prereq-locked' : 'active'}`}
                onClick={() => {
                  if (locked) return
                  onSelectSymbol(tile.kind)
                }}
                aria-label={tile.label}
                disabled={locked}
              >
                <SymbolTile kind={tile.kind} />
                {completed && !locked && (
                  <span className="intro-checkmark" aria-hidden="true">
                    &#10003;
                  </span>
                )}
              </button>
              <span className="symbol-label">{tile.label}</span>
              <span className="intro-progress-count">
                {locked ? 'Coming soon' : `${Math.min(solved, puzzleCount)} / ${puzzleCount}`}
              </span>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default IntroPage
