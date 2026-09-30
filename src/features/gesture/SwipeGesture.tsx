import { useEffect } from 'react'
import type { PoseSource } from '../pose/poseTypes'
import {
  createSwipeDetector,
  type SwipeDirection,
} from './swipeDetector'
import { createFocusToggleDetector } from './focusToggleDetector'

export function SwipeGesture({
  source,
  mirrored,
  resetKey,
  canSwipe,
  onSwipe,
  onToggleFocus,
}: {
  source: PoseSource
  mirrored: boolean
  resetKey: number
  canSwipe: boolean
  onSwipe: (direction: SwipeDirection) => void
  onToggleFocus: () => void
}) {
  useEffect(() => {
    const swipeDetector = createSwipeDetector(mirrored)
    const focusDetector = createFocusToggleDetector()

    return source.subscribe((frame) => {
      const focus = focusDetector.push(frame)

      if (focus.toggle) {
        onToggleFocus()
      }

      const swipe =
        canSwipe && !focus.blockSwipe
          ? swipeDetector.push(frame)
          : swipeDetector.push(null)

      if (swipe.direction) {
        onSwipe(swipe.direction)
      }
    })
  }, [source, mirrored, resetKey, canSwipe, onSwipe, onToggleFocus])

  return null
}
