import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { createPoseChannel } from '../pose/poseChannel'
import { startPoseSession } from '../pose/poseSession'
import type { PoseState } from '../pose/poseSession'
import { PoseOverlay } from '../pose/PoseOverlay'
import { GarmentOverlay } from './GarmentOverlay'
import type { Garment } from '../wardrobe/garments'
import { SwipeGesture } from '../gesture/SwipeGesture'
import type { SwipeDirection } from '../gesture/swipeDetector'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  showSkeleton: boolean
  showGarment: boolean
  garment: Garment
  swipeEnabled: boolean
  gestureResetKey: number
  onSwipe: (direction: SwipeDirection) => void
}

export function VirtualMirror(props: Props) {
  const [attempt, setAttempt] = useState(0)
  return (
    <MirrorSession
      key={attempt}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
    />
  )
}

function MirrorSession({
  videoRef,
  mirrored,
  showSkeleton,
  showGarment,
  garment,
  swipeEnabled,
  gestureResetKey,
  onSwipe,
  retry,
}: Props & { retry: () => void }) {
  const [source] = useState(createPoseChannel)
  const [state, setState] = useState<PoseState>('loading')
  useEffect(() => {
    if (!videoRef.current) return
    return startPoseSession(
      videoRef.current,
      { onFrame: source.publish, onState: setState },
      async () => {
        const { createPoseLandmarker } = await import('../pose/poseLandmarker')
        return createPoseLandmarker()
      },
    )
  }, [videoRef, source])
  return (
    <>
      {showGarment && (
        <GarmentOverlay source={source} garment={garment} mirrored={mirrored} />
      )}
      {showSkeleton && <PoseOverlay source={source} />}
      <div className={`pose-hud ${mirrored ? 'is-mirrored' : ''}`}>
        <p role="status" className={`pose-message pose-${state}`}>
          {state === 'loading'
            ? '姿勢推定を準備しています…'
            : state === 'error'
              ? '姿勢推定を開始できませんでした。再試行してください。'
              : state === 'searching'
                ? '肩から腰まで映る位置に立ってください'
                : state === 'partial'
                  ? '身体の一部を検出中'
                  : '身体を追跡中'}
        </p>
        {showGarment && swipeEnabled && (
          <SwipeGesture
            source={source}
            mirrored={mirrored}
            resetKey={gestureResetKey}
            onSwipe={onSwipe}
          />
        )}
        {state === 'error' && (
          <button className="pose-retry" onClick={retry}>
            姿勢推定を再試行
          </button>
        )}
      </div>
    </>
  )
}
