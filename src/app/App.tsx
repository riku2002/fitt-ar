import { CameraView } from '../features/camera/CameraView'

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="wordmark"
          href="./"
          aria-label="Realtime AR Try-On ホーム"
        >
          <span className="brand-symbol" aria-hidden="true">
            ↗
          </span>
          Realtime AR Try-On
        </a>
      </header>
      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">THE NEXT STEP</p>
          <h1 id="page-title">
            Hello, <span>motion.</span>
          </h1>
        </section>
        <CameraView />
      </main>
      <footer className="site-footer">
        <span>REALTIME AR TRY-ON</span>
      </footer>
    </div>
  )
}
