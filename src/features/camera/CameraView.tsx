import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cameraErrorMessage, requestCamera, stopCamera } from './cameraService'
import { VirtualMirror } from '../virtualTryOn/VirtualMirror'
import { filterGarments, garments } from '../wardrobe/garments'
import type { GarmentFilter } from '../wardrobe/garments'
import { GarmentSelector } from '../wardrobe/GarmentSelector'
import type { SwipeDirection } from '../gesture/swipeDetector'

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
  const [garmentFilter, setGarmentFilter] = useState<GarmentFilter>('all')
  const [garmentId, setGarmentId] = useState<string | null>(
    garments[0]?.id ?? null,
  )
  const filteredGarments = useMemo(
    () => filterGarments(garments, garmentFilter),
    [garmentFilter],
  )
  const garmentIndex = Math.max(
    0,
    filteredGarments.findIndex((garment) => garment.id === garmentId),
  )
  const garment = filteredGarments[garmentIndex] ?? null
  const [swipeEnabled, setSwipeEnabled] = useState(true)
  const [gestureResetKey, setGestureResetKey] = useState(0)
  const onSwipe = useCallback(
    (direction: SwipeDirection) => {
      setGarmentId((id) => {
        if (!filteredGarments.length) return null
        const index = Math.max(
          0,
          filteredGarments.findIndex((item) => item.id === id),
        )
        const next =
          (index + (direction === 'next' ? 1 : -1) + filteredGarments.length) %
          filteredGarments.length
        return filteredGarments[next].id
      })
    },
    [filteredGarments],
  )
  const selectGarment = useCallback(
    (index: number) => {
      setGarmentId(filteredGarments[index]?.id ?? null)
      setGestureResetKey((key) => key + 1)
    },
    [filteredGarments],
  )

  function selectFilter(filter: GarmentFilter) {
    const available = filterGarments(garments, filter)
    setGarmentFilter(filter)
    setGarmentId((id) =>
      available.some((item) => item.id === id)
        ? id
        : (available[0]?.id ?? null),
    )
    // Do not let a partially completed swipe select a garment in the new category.
    setGestureResetKey((key) => key + 1)
  }

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
                garment={garment}
                swipeEnabled={swipeEnabled && filteredGarments.length > 1}
                gestureResetKey={gestureResetKey}
                onSwipe={onSwipe}
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
        {isRequesting && (
          <p className="pending-message">
            許可画面が出ない場合は、アドレスバーのカメラ権限を確認してください。
          </p>
        )}
        <GarmentSelector
          garments={filteredGarments}
          index={garmentIndex}
          filter={garmentFilter}
          onFilterChange={selectFilter}
          onSelect={selectGarment}
        />
        {filteredGarments.length > 1 && (
          <p className="swipe-guide">
            画面で 右 → 左：次の服
            <br />左 → 右：前の服
          </p>
        )}
        <ol className="steps">
          <li>
            <span>1</span>
            <div>
              <strong>カメラを起動</strong>
              <p>起動ボタンから接続を開始します。</p>
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
              <strong>胸の高さで手をスワイプ</strong>
              <p>
                正面を向いて肩・腰・手首を映します。切り替わったら手を少し止めて、次の操作へ。
              </p>
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
          <span>手のスワイプで切り替え</span>
          <input
            type="checkbox"
            checked={swipeEnabled}
            disabled={!showGarment || filteredGarments.length < 2}
            onChange={(event) => setSwipeEnabled(event.target.checked)}
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
      </aside>
    </section>
  )
}
