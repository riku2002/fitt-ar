import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { createPoseChannel } from '../pose/poseChannel'
import { startPoseSession } from '../pose/poseSession'
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
  garments: readonly Garment[]

  /** Master switch for hand-based controls. */
  gestureEnabled: boolean

  /** Horizontal swipe is only useful when the focused slot can cycle. */
  canSwipe: boolean

  gestureResetKey: number
  onSwipe: (direction: SwipeDirection) => void
  onToggleFocus: () => void
}

export function VirtualMirror(props: Props) {
  return <MirrorSession {...props} />
}

function MirrorSession({
  videoRef,
  mirrored,
  showSkeleton,
  showGarment,
  garments,
  gestureEnabled,
  canSwipe,
  gestureResetKey,
  onSwipe,
  onToggleFocus,
}: Props) {
  const [source] = useState(createPoseChannel)

  useEffect(() => {
    if (!videoRef.current) {
      return
    }

    return startPoseSession(
      videoRef.current,
      {
        onFrame: source.publish,
        onState: () => {},
      },
      async () => {
        const { createPoseLandmarker } = await import('../pose/poseLandmarker')
        return createPoseLandmarker()
      },
    )
  }, [videoRef, source]) // Selections/focus changes never restart inference.

  return (
    <>
      {showGarment && (
        <GarmentOverlay
          source={source}
          garments={garments}
          mirrored={mirrored}
        />
      )}

      {showSkeleton && <PoseOverlay source={source} />}

      {showGarment && gestureEnabled && (
        <SwipeGesture
          source={source}
          mirrored={mirrored}
          resetKey={gestureResetKey}
          canSwipe={canSwipe}
          onSwipe={onSwipe}
          onToggleFocus={onToggleFocus}
        />
      )}
    </>
  )
}
