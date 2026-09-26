import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  cameraErrorMessage,
  requestCamera,
  stopCamera,
} from './cameraService'
import { VirtualMirror } from '../virtualTryOn/VirtualMirror'
import {
  filterGarments,
  garments,
} from '../wardrobe/garments'
import type { GarmentFilter } from '../wardrobe/garments'
import { GarmentSelector } from '../wardrobe/GarmentSelector'
import type { SwipeDirection } from '../gesture/swipeDetector'

type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'playing'
  | 'error'

type InputKind = 'camera' | 'debug'

const DEBUG_VIDEO_URL = '/debug-pose.mp4'

interface CapturableVideoElement extends HTMLVideoElement {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

const DEBUG_PANEL_STYLE: CSSProperties = {
  all: 'initial',
  position: 'fixed',
  left: '16px',
  bottom: '16px',
  zIndex: 2147483647,
  boxSizing: 'border-box',
  display: 'flex',
  width: '230px',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '10px',
  background: 'rgba(17, 24, 39, 0.94)',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.32)',
  color: '#ffffff',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.4',
  pointerEvents: 'auto',
}

const DEBUG_BUTTON_BASE_STYLE: CSSProperties = {
  all: 'initial',
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  border: '1px solid rgba(255, 255, 255, 0.25)',
  borderRadius: '7px',
  color: '#ffffff',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '1.4',
  textAlign: 'center',
  userSelect: 'none',
}

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

function waitForVideoMetadata(
  video: HTMLVideoElement,
): Promise<void> {
  if (
    video.readyState >= 1 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    let timeoutId = 0

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('error', handleError)
    }

    const handleLoaded = () => {
      cleanup()

      if (
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        reject(
          new Error(
            'デバッグ動画の解像度を取得できませんでした。',
          ),
        )
        return
      }

      resolve()
    }

    const handleError = () => {
      cleanup()

      reject(
        new Error(
          `${DEBUG_VIDEO_URL} を読み込めませんでした。public/debug-pose.mp4 を確認してください。`,
        ),
      )
    }

    video.addEventListener(
      'loadedmetadata',
      handleLoaded,
    )

    video.addEventListener(
      'error',
      handleError,
    )

    timeoutId = window.setTimeout(() => {
      cleanup()

      reject(
        new Error(
          `${DEBUG_VIDEO_URL} の読み込みがタイムアウトしました。`,
        ),
      )
    }, 5000)

    /*
     * The source is already assigned by JSX. load() explicitly starts
     * metadata loading when preload has not yet begun.
     */
    if (video.readyState === 0) {
      video.load()
    }
  })
}

function captureDebugVideoStream(
  video: HTMLVideoElement,
): MediaStream {
  const capturable =
    video as CapturableVideoElement

  const capture =
    capturable.captureStream ??
    capturable.mozCaptureStream

  if (!capture) {
    throw new Error(
      'このブラウザは動画の captureStream() に対応していません。Chrome の最新版でデバッグしてください。',
    )
  }

  const stream = capture.call(capturable)

  /*
   * The AR pipeline only needs video.
   * Even if debug-pose.mp4 contains audio, never propagate its audio track.
   */
  for (const track of stream.getAudioTracks()) {
    track.stop()
    stream.removeTrack(track)
  }

  if (stream.getVideoTracks().length === 0) {
    stopCamera(stream)

    throw new Error(
      'デバッグ動画から映像トラックを取得できませんでした。',
    )
  }

  return stream
}

function DebugVideoPanel({
  active,
  busy,
  videoRef,
  onToggle,
}: {
  active: boolean
  busy: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onToggle: () => void
}) {
  if (!import.meta.env.DEV) {
    return null
  }

  return createPortal(
    <div
      style={DEBUG_PANEL_STYLE}
      data-debug-pose-panel
    >
      <div
        style={{
          all: 'initial',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#ffffff',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: '1.4',
        }}
      >
        <span
          style={{
            all: 'initial',
            color: '#ffffff',
            font: 'inherit',
          }}
        >
          DEV INPUT
        </span>

        <span
          style={{
            all: 'initial',
            color: active ? '#86efac' : '#cbd5e1',
            font: 'inherit',
          }}
        >
          {active ? 'VIDEO' : 'CAMERA'}
        </span>
      </div>

      <button
        type="button"
        aria-pressed={active}
        disabled={busy}
        onClick={onToggle}
        style={{
          ...DEBUG_BUTTON_BASE_STYLE,
          background: active
            ? '#166534'
            : '#1f2937',
          opacity: busy ? 0.55 : 1,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy
          ? '切り替え中…'
          : active
            ? 'テスト動画を停止'
            : 'テスト動画を使用'}
      </button>

      <div
        style={{
          all: 'initial',
          display: 'block',
          color: '#94a3b8',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '10px',
          lineHeight: '1.4',
          overflowWrap: 'anywhere',
        }}
      >
        {DEBUG_VIDEO_URL}
      </div>

      {/*
       * Keep the source video outside layout flow but not display:none.
       * Some media implementations behave more reliably for playback /
       * captureStream when the element remains renderable.
       */}
      <video
        ref={videoRef}
        src={DEBUG_VIDEO_URL}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          left: '-10000px',
          top: '-10000px',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>,
    document.body,
  )
}

export function CameraView() {
  const videoRef =
    useRef<HTMLVideoElement>(null)

  const debugVideoRef =
    useRef<HTMLVideoElement>(null)

  const streamRef =
    useRef<MediaStream | null>(null)

  /*
   * True while the hidden debug source video belongs to the current
   * request. This avoids calling HTMLMediaElement.pause() during ordinary
   * camera tests / sessions.
   */
  const debugPlaybackRef = useRef(false)

  /*
   * getUserMedia cannot be aborted.
   * Ignore and release late permission responses.
   */
  const requestId = useRef(0)

  const pendingRef = useRef(false)

  const [status, setStatus] =
    useState<CameraStatus>('idle')

  const [error, setError] =
    useState('')

  const [mirrored, setMirrored] =
    useState(true)

  const [showSkeleton, setShowSkeleton] =
    useState(false)

  const [showGarment, setShowGarment] =
    useState(true)

  const [resolution, setResolution] =
    useState('')

  const [debugActive, setDebugActive] =
    useState(false)

  const [
    garmentFilter,
    setGarmentFilter,
  ] = useState<GarmentFilter>('all')

  const [
    garmentId,
    setGarmentId,
  ] = useState<string | null>(
    garments[0]?.id ?? null,
  )

  const filteredGarments = useMemo(
    () =>
      filterGarments(
        garments,
        garmentFilter,
      ),
    [garmentFilter],
  )

  const garmentIndex = Math.max(
    0,
    filteredGarments.findIndex(
      (garment) =>
        garment.id === garmentId,
    ),
  )

  const garment =
    filteredGarments[garmentIndex] ??
    null

  const [
    swipeEnabled,
    setSwipeEnabled,
  ] = useState(true)

  const [
    gestureResetKey,
    setGestureResetKey,
  ] = useState(0)

  const onSwipe = useCallback(
    (direction: SwipeDirection) => {
      setGarmentId((id) => {
        if (!filteredGarments.length) {
          return null
        }

        const index = Math.max(
          0,
          filteredGarments.findIndex(
            (item) => item.id === id,
          ),
        )

        const next =
          (
            index +
            (direction === 'next'
              ? 1
              : -1) +
            filteredGarments.length
          ) %
          filteredGarments.length

        return filteredGarments[next].id
      })
    },
    [filteredGarments],
  )

  const selectGarment = useCallback(
    (index: number) => {
      setGarmentId(
        filteredGarments[index]?.id ??
          null,
      )

      setGestureResetKey(
        (key) => key + 1,
      )
    },
    [filteredGarments],
  )

  function selectFilter(
    filter: GarmentFilter,
  ) {
    const available =
      filterGarments(
        garments,
        filter,
      )

    setGarmentFilter(filter)

    setGarmentId((id) =>
      available.some(
        (item) => item.id === id,
      )
        ? id
        : (available[0]?.id ?? null),
    )

    /*
     * Do not let a partially completed swipe
     * select a garment in the new category.
     */
    setGestureResetKey(
      (key) => key + 1,
    )
  }

  const release = useCallback(() => {
    /*
     * Invalidate all currently pending async start operations.
     */
    requestId.current += 1

    pendingRef.current = false

    stopCamera(streamRef.current)
    streamRef.current = null

    const video = videoRef.current

    if (video) {
      video.srcObject = null
    }

    /*
     * Only call pause() when the debug video was actually participating
     * in the current request. This also keeps jsdom camera tests clean.
     */
    if (debugPlaybackRef.current) {
      debugPlaybackRef.current = false

      const debugVideo =
        debugVideoRef.current

      if (debugVideo) {
        debugVideo.pause()
      }
    }
  }, [])

  const stop = useCallback(() => {
    release()

    setDebugActive(false)
    setStatus('idle')
    setError('')
    setResolution('')
  }, [release])

  useEffect(() => {
    window.addEventListener(
      'pagehide',
      stop,
    )

    return () => {
      window.removeEventListener(
        'pagehide',
        stop,
      )

      release()
    }
  }, [release, stop])

  async function attachStream(
    stream: MediaStream,
    id: number,
    kind: InputKind,
  ): Promise<boolean> {
    if (id !== requestId.current) {
      stopCamera(stream)
      return false
    }

    streamRef.current = stream

    stream
      .getVideoTracks()
      .forEach((track) => {
        track.onended = () => {
          /*
           * Ignore an old track ending after another stream has replaced it.
           */
          if (
            streamRef.current !== stream
          ) {
            return
          }

          release()

          setDebugActive(false)
          setStatus('error')
          setResolution('')

          setError(
            kind === 'debug'
              ? 'デバッグ動画の映像ストリームが停止しました。もう一度テスト動画を開始してください。'
              : 'カメラとの接続が切れました。接続や権限を確認して、もう一度お試しください。',
          )
        }
      })

    const video = videoRef.current

    if (!video) {
      release()
      return false
    }

    video.srcObject = stream

    await video.play()

    if (id !== requestId.current) {
      return false
    }

    pendingRef.current = false

    /*
     * captureStream() -> visible video can briefly report zero dimensions
     * while its metadata propagates. For debug input, use the source video's
     * intrinsic dimensions as a fallback.
     */
    const debugSource =
      kind === 'debug'
        ? debugVideoRef.current
        : null

    const width =
      video.videoWidth ||
      debugSource?.videoWidth ||
      0

    const height =
      video.videoHeight ||
      debugSource?.videoHeight ||
      0

    setResolution(
      width > 0 && height > 0
        ? `${width} × ${height}`
        : '映像ストリーム',
    )

    setDebugActive(
      kind === 'debug',
    )

    setStatus('playing')

    return true
  }

  async function start() {
    if (
      pendingRef.current ||
      streamRef.current
    ) {
      return
    }

    debugPlaybackRef.current = false
    setDebugActive(false)

    const id =
      ++requestId.current

    pendingRef.current = true

    setStatus('requesting')
    setError('')

    try {
      const stream =
        await requestCamera()

      if (
        id !== requestId.current
      ) {
        stopCamera(stream)
        return
      }

      await attachStream(
        stream,
        id,
        'camera',
      )
    } catch (cause) {
      if (
        id !== requestId.current
      ) {
        return
      }

      release()

      setDebugActive(false)
      setStatus('error')
      setError(
        cameraErrorMessage(cause),
      )
      setResolution('')
    }
  }

  async function startDebugVideo() {
    if (!import.meta.env.DEV) {
      return
    }

    if (pendingRef.current) {
      return
    }

    /*
     * Allow switching directly from a real camera to the local debug video.
     * Existing tracks are released before the new request starts.
     */
    if (streamRef.current) {
      release()
    }

    const debugVideo =
      debugVideoRef.current

    if (!debugVideo) {
      setDebugActive(false)
      setStatus('error')
      setError(
        'デバッグ動画要素を初期化できませんでした。',
      )
      setResolution('')
      return
    }

    const id =
      ++requestId.current

    pendingRef.current = true
    debugPlaybackRef.current = true

    setDebugActive(true)
    setStatus('requesting')
    setError('')

    try {
      await waitForVideoMetadata(
        debugVideo,
      )

      if (
        id !== requestId.current
      ) {
        return
      }

      /*
       * Restart from the beginning whenever debug input is explicitly enabled.
       */
      debugVideo.currentTime = 0

      await debugVideo.play()

      if (
        id !== requestId.current
      ) {
        return
      }

      const stream =
        captureDebugVideoStream(
          debugVideo,
        )

      if (
        id !== requestId.current
      ) {
        stopCamera(stream)
        return
      }

      await attachStream(
        stream,
        id,
        'debug',
      )
    } catch (cause) {
      if (
        id !== requestId.current
      ) {
        return
      }

      release()

      setDebugActive(false)
      setStatus('error')
      setResolution('')

      setError(
        cause instanceof Error
          ? cause.message
          : 'デバッグ動画を開始できませんでした。',
      )
    }
  }

  function toggleDebugVideo() {
    if (debugActive) {
      stop()
      return
    }

    void startDebugVideo()
  }

  const isPlaying =
    status === 'playing'

  const isRequesting =
    status === 'requesting'

  return (
    <>
      <section
        className="camera-layout"
        aria-label="カメラ動作確認"
      >
        <div className="mirror-card">
          <div className="mirror-toolbar">
            <span className="panel-title">
              VIRTUAL MIRROR
            </span>

            <span
              className={`status-badge ${
                isPlaying
                  ? 'is-live'
                  : ''
              }`}
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
            <div
              className={`camera-content ${
                mirrored
                  ? 'is-mirrored'
                  : ''
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="カメラのライブ映像"
                className={
                  isPlaying
                    ? 'is-visible'
                    : ''
                }
              />

              {isPlaying &&
                (
                  showSkeleton ||
                  showGarment
                ) && (
                  <VirtualMirror
                    videoRef={videoRef}
                    mirrored={mirrored}
                    showSkeleton={
                      showSkeleton
                    }
                    showGarment={
                      showGarment
                    }
                    garment={
                      garment
                    }
                    swipeEnabled={
                      swipeEnabled &&
                      filteredGarments.length >
                        1
                    }
                    gestureResetKey={
                      gestureResetKey
                    }
                    onSwipe={
                      onSwipe
                    }
                  />
                )}
            </div>

            {!isPlaying && (
              <div className="camera-placeholder">
                <div
                  className={`camera-icon ${
                    isRequesting
                      ? 'is-pending'
                      : ''
                  }`}
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
              {isPlaying
                ? 'LIVE PREVIEW'
                : 'READY WHEN YOU ARE'}
            </span>
          </div>

          <div className="mirror-bottom">
            <span>
              {isPlaying
                ? resolution
                : '映像の保存・送信は行いません'}
            </span>

            <span>
              {mirrored
                ? '鏡表示 ON'
                : '鏡表示 OFF'}
            </span>
          </div>
        </div>

        <aside
          className="control-panel"
          aria-labelledby="setup-title"
        >
          <span className="step-number">
            04 / SWIPE TO TRY
          </span>

          <h2 id="setup-title">
            手を動かして、次の一着へ
          </h2>

          <p className="control-copy">
            胸の高さで片手を横に動かすと、服が切り替わります。
          </p>

          {isPlaying ||
          isRequesting ? (
            <button
              className="primary-button stop-button"
              onClick={stop}
            >
              {isRequesting
                ? '接続をキャンセル'
                : 'カメラを停止'}

              <span aria-hidden="true">
                □
              </span>
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={() => void start()}
            >
              {status === 'error'
                ? 'もう一度試す'
                : 'カメラを起動'}

              <span aria-hidden="true">
                ↗
              </span>
            </button>
          )}

          {error && (
            <p
              className="error-message"
              role="alert"
            >
              {error}
            </p>
          )}

          {isRequesting && (
            <p className="pending-message">
              許可画面が出ない場合は、アドレスバーのカメラ権限を確認してください。
            </p>
          )}

          <GarmentSelector
            garments={
              filteredGarments
            }
            index={garmentIndex}
            filter={garmentFilter}
            onFilterChange={
              selectFilter
            }
            onSelect={
              selectGarment
            }
          />

          {filteredGarments.length >
            1 && (
            <p className="swipe-guide">
              画面で 右 → 左：次の服
              <br />
              左 → 右：前の服
            </p>
          )}

          <ol className="steps">
            <li>
              <span>1</span>

              <div>
                <strong>
                  カメラを起動
                </strong>

                <p>
                  起動ボタンから接続を開始します。
                </p>
              </div>
            </li>

            <li>
              <span>2</span>

              <div>
                <strong>
                  アクセスを許可
                </strong>

                <p>
                  ブラウザの確認で「許可」を選択。
                </p>
              </div>
            </li>

            <li>
              <span>3</span>

              <div>
                <strong>
                  胸の高さで手をスワイプ
                </strong>

                <p>
                  正面を向いて肩・腰・手首を映します。切り替わったら手を少し止めて、次の操作へ。
                </p>
              </div>
            </li>
          </ol>

          <label className="mirror-toggle">
            <span>
              鏡のように左右反転
            </span>

            <input
              type="checkbox"
              checked={mirrored}
              onChange={(event) =>
                setMirrored(
                  event.target.checked,
                )
              }
            />

            <span
              className="toggle-track"
              aria-hidden="true"
            />
          </label>

          <label className="mirror-toggle">
            <span>
              Tシャツを表示
            </span>

            <input
              type="checkbox"
              checked={
                showGarment
              }
              onChange={(event) =>
                setShowGarment(
                  event.target.checked,
                )
              }
            />

            <span
              className="toggle-track"
              aria-hidden="true"
            />
          </label>

          <label className="mirror-toggle">
            <span>
              手のスワイプで切り替え
            </span>

            <input
              type="checkbox"
              checked={
                swipeEnabled
              }
              disabled={
                !showGarment ||
                filteredGarments.length <
                  2
              }
              onChange={(event) =>
                setSwipeEnabled(
                  event.target.checked,
                )
              }
            />

            <span
              className="toggle-track"
              aria-hidden="true"
            />
          </label>

          <label className="mirror-toggle">
            <span>
              骨格を表示
            </span>

            <input
              type="checkbox"
              checked={
                showSkeleton
              }
              onChange={(event) =>
                setShowSkeleton(
                  event.target.checked,
                )
              }
            />

            <span
              className="toggle-track"
              aria-hidden="true"
            />
          </label>
        </aside>
      </section>

      <DebugVideoPanel
        active={debugActive}
        busy={isRequesting}
        videoRef={debugVideoRef}
        onToggle={
          toggleDebugVideo
        }
      />
    </>
  )
}