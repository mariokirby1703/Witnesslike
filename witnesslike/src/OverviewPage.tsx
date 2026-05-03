type OverviewPageProps = {
  unlockedCount: number
  totalCount: number
  onOpenIntro: () => void
  onOpenCustom: () => void
  onOpenCustomPuzzles: () => void
}

function OverviewPage({
  unlockedCount,
  totalCount,
  onOpenIntro,
  onOpenCustom,
  onOpenCustomPuzzles,
}: OverviewPageProps) {
  return (
    <div className="app home overview">
      <header className="home-hero">
        <div>
          <p className="eyebrow">Witness-like Puzzle Maker</p>
          <h1>Grand Overview</h1>
          <p className="subtitle">Choose a mode.</p>
        </div>
      </header>

      <section className="overview-grid" aria-label="Mode selection">
        <button type="button" className="overview-card" onClick={onOpenIntro}>
          <p className="overview-card-eyebrow">Recommended first</p>
          <h2>Intro Puzzles</h2>
          <p>
            Fixed progression per symbol with 10 puzzles.
          </p>
        </button>

        <button type="button" className="overview-card" onClick={onOpenCustom}>
          <p className="overview-card-eyebrow">Unlocked</p>
          <h2>Symbol Combinations</h2>
          <p>
            {unlockedCount} / {totalCount} symbols available.
          </p>
        </button>

        <button type="button" className="overview-card" onClick={onOpenCustomPuzzles}>
          <p className="overview-card-eyebrow">Build</p>
          <h2>Custom Puzzles</h2>
          <p>
            Place symbols, tune the grid, then solve or play your own layout.
          </p>
        </button>
      </section>
    </div>
  )
}

export default OverviewPage
