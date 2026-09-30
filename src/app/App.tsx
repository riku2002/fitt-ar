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
          ARFitt
        </a>
      </header>
      <main className="main-content">
        <CameraView />
      </main>
      <footer className="site-footer">
        <span>ARFitt</span>
      </footer>
    </div>
  )
}
