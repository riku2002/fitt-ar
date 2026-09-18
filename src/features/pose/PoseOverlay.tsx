import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { startPoseSession } from './poseSession'
import type { PoseState } from './poseSession'

const messages: Record<PoseState, string> = {
  loading: '姿勢推定を準備しています…',
  searching: '肩から腰まで映る位置に立ってください',
  partial: '一部を検出中 · 肩・手首・腰が映るように調整してください',
  tracking: '肩・肘・手首・腰を追跡中',
  error:
    '姿勢推定を開始できませんでした。ページを再読み込みするか、再試行してください。',
}

export function PoseOverlay({
  videoRef,
  mirrored,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
}) {
  const [attempt, setAttempt] = useState(0)
  return (
    <PoseAttempt
      key={attempt}
      videoRef={videoRef}
      mirrored={mirrored}
      retry={() => setAttempt((value) => value + 1)}
    />
  )
}

function PoseAttempt({
  videoRef,
  mirrored,
  retry,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  retry: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<PoseState>('loading')
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return
    return startPoseSession(
      videoRef.current,
      canvasRef.current,
      setState,
      async () => {
        const { createPoseLandmarker } = await import('./poseLandmarker')
        return createPoseLandmarker()
      },
    )
  }, [videoRef])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pose-canvas"
        aria-label="肩・肘・手首・腰の骨格表示"
      />
      {/* Counter-reflect the message, while the canvas stays with the video. */}
      <div className={`pose-hud ${mirrored ? 'is-mirrored' : ''}`}>
        <p role="status" className={`pose-message pose-${state}`}>
          {messages[state]}
        </p>
        {state === 'error' && (
          <button className="pose-retry" onClick={retry}>
            姿勢推定を再試行
          </button>
        )}
      </div>
    </>
  )
}
