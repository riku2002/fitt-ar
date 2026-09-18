import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraErrorMessage, requestCamera, stopCamera } from './cameraService'
import { VirtualMirror } from '../virtualTryOn/VirtualMirror'
import { demoGarment } from '../wardrobe/garments'

type CameraStatus = 'idle' | 'requesting' | 'playing' | 'error'

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 5 9.5 3h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // getUserMedia cannot be aborted. Ignore and release late permission responses.
  const requestId = useRef(0)
  const pendingRef = useRef(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')
  const [mirrored, setMirrored] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [showGarment, setShowGarment] = useState(true)
  const [resolution, setResolution] = useState('')

  const release = useCallback(() => {
    requestId.current += 1
    pendingRef.current = false
    stopCamera(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stop = useCallback(() => {
    release()
    setStatus('idle')
    setError('')
    setResolution('')
  }, [release])

  useEffect(() => {
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener('pagehide', stop)
      release()
    }
  }, [release, stop])

  async function start() {
    if (pendingRef.current || streamRef.current) return
    const id = ++requestId.current
    pendingRef.current = true
    setStatus('requesting')
    setError('')
    try {
      const stream = await requestCamera()
      if (id !== requestId.current) {
        stopCamera(stream)
        return
      }
      streamRef.current = stream
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          release()
          setStatus('error')
          setError(
            'カメラとの接続が切れました。接続や権限を確認して、もう一度お試しください。',
          )
          setResolution('')
        }
      })
      const video = videoRef.current
      if (!video) {
        release()
        return
      }
      video.srcObject = stream
      await video.play()
      if (id !== requestId.current) return
      pendingRef.current = false
      setResolution(`${video.videoWidth} × ${video.videoHeight}`)
      setStatus('playing')
    } catch (cause) {
      if (id !== requestId.current) return
      release()
      setStatus('error')
      setError(cameraErrorMessage(cause))
      setResolution('')
    }
  }

  const isPlaying = status === 'playing'
  const isRequesting = status === 'requesting'

  return (
    <section className="camera-layout" aria-label="カメラ動作確認">
      <div className="mirror-card">
        <div className="mirror-toolbar">
          <span className="panel-title">VIRTUAL MIRROR</span>
          <span
            className={`status-badge ${isPlaying ? 'is-live' : ''}`}
            role="status"
          >
            <span className="status-dot" />
            {isPlaying
              ? '接続中'
              : isRequesting
                ? '接続待ち'
                : status === 'error'
                  ? '要確認'
                  : 'カメラ OFF'}
          </span>
        </div>
        <div className="camera-stage">
          <div className={`camera-content ${mirrored ? 'is-mirrored' : ''}`}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="カメラのライブ映像"
              className={isPlaying ? 'is-visible' : ''}
            />
            {isPlaying && (showSkeleton || showGarment) && (
              <VirtualMirror
                videoRef={videoRef}
                mirrored={mirrored}
                showSkeleton={showSkeleton}
                showGarment={showGarment}
              />
            )}
          </div>
          {!isPlaying && (
            <div className="camera-placeholder">
              <div
                className={`camera-icon ${isRequesting ? 'is-pending' : ''}`}
              >
                <CameraIcon />
              </div>
              <h2>
                {isRequesting
                  ? 'カメラに接続しています'
                  : 'ここに、あなたの映像が映ります'}
              </h2>
              <p>
                {isRequesting
                  ? 'ブラウザに表示されるカメラの許可を確認してください。'
                  : '準備ができたら「カメラを起動」を押してください。'}
              </p>
            </div>
          )}
          <div className="frame-corner top-left" />
          <div className="frame-corner top-right" />
          <div className="frame-corner bottom-left" />
          <div className="frame-corner bottom-right" />
          <span className="stage-note">
            {isPlaying ? 'LIVE PREVIEW' : 'READY WHEN YOU ARE'}
          </span>
        </div>
        <div className="mirror-bottom">
          <span>{isPlaying ? resolution : '映像の保存・送信は行いません'}</span>
          <span>{mirrored ? '鏡表示 ON' : '鏡表示 OFF'}</span>
        </div>
      </div>
      <aside className="control-panel" aria-labelledby="setup-title">
        <span className="step-number">03 / VIRTUAL TRY-ON</span>
        <h2 id="setup-title">一着を、重ねてみる</h2>
        <p className="control-copy">
          肩と腰に合わせて、Tシャツがあなたの動きに追従します。
        </p>
        <div className="garment-preview">
          <img src={demoGarment.image} alt={`${demoGarment.name}の透過素材`} />
          <div>
            <strong>{demoGarment.name}</strong>
            <p>布の質感と縫い目を残した、実写のTシャツ</p>
          </div>
        </div>
        <ol className="steps">
          <li>
            <span>1</span>
            <div>
              <strong>カメラを起動</strong>
              <p>下のボタンから接続を開始します。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>アクセスを許可</strong>
              <p>ブラウザの確認で「許可」を選択。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>一歩下がって動いてみる</strong>
              <p>正面を向いて肩と腰を映し、身体を傾けてみましょう。</p>
            </div>
          </li>
        </ol>
        <label className="mirror-toggle">
          <span>鏡のように左右反転</span>
          <input
            type="checkbox"
            checked={mirrored}
            onChange={(event) => setMirrored(event.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
        </label>
        <label className="mirror-toggle">
          <span>Tシャツを表示</span>
          <input
            type="checkbox"
            checked={showGarment}
            onChange={(event) => setShowGarment(event.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
        </label>
        <label className="mirror-toggle">
          <span>骨格を表示</span>
          <input
            type="checkbox"
            checked={showSkeleton}
            onChange={(event) => setShowSkeleton(event.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
        </label>
        {isPlaying || isRequesting ? (
          <button className="primary-button stop-button" onClick={stop}>
            {isRequesting ? '接続をキャンセル' : 'カメラを停止'}
            <span aria-hidden="true">□</span>
          </button>
        ) : (
          <button className="primary-button" onClick={() => void start()}>
            {status === 'error' ? 'もう一度試す' : 'カメラを起動'}
            <span aria-hidden="true">↗</span>
          </button>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {isPlaying && (
          <p className="success-message">
            接続できました。カメラは正常に動作しています。
          </p>
        )}
        {isRequesting && (
          <p className="pending-message">
            許可画面が出ない場合は、アドレスバーのカメラ権限を確認してください。
          </p>
        )}
      </aside>
    </section>
  )
}
