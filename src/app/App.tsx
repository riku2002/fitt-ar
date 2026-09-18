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
        <span className="stage-label">DEVELOPMENT / PHASE 0</span>
      </header>
      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">THE FIRST STEP</p>
          <h1 id="page-title">
            Hello, <span>camera.</span>
          </h1>
          <p className="intro-copy">
            リアルタイム試着の、はじめの一歩。
            <br />
            カメラをつないで、あなたの映像を映してみましょう。
          </p>
        </section>
        <CameraView />
      </main>
      <footer className="site-footer">
        <span>REALTIME AR TRY-ON</span>
        <span>カメラ動作確認版 · 姿勢推定・AR試着は次のステップで追加</span>
      </footer>
    </div>
  )
}
