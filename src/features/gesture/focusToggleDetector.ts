import { isVisible } from '../pose/poseGeometry'
import type { PoseFrame } from '../pose/poseTypes'

export type FocusToggleState =
  | 'searching'
  | 'arming'
  | 'ready'
  | 'holding'
  | 'wait-release'

export interface FocusToggleResult {
  state: FocusToggleState
  toggle?: true
  /** 0..1 while the user is holding both hands above the shoulders. */
  progress: number
  /** Prevent a horizontal swipe from being recognized during this gesture. */
  blockSwipe: boolean
}

/**
 * Distances are normalized by the detected shoulder width, not by raw pixels.
 * This keeps the gesture threshold reasonably stable across camera distance and
 * portrait / landscape video.
 */
export const FOCUS_TOGGLE = {
  holdMs: 700,
  releaseMs: 250,
  maxGapMs: 320,

  /** Each wrist must be this many shoulder-widths above its own shoulder. */
  raiseMargin: 0.15,

  /** Both wrists must be this far below their shoulders to re-arm. */
  releaseMargin: 0.08,

  minShoulderWidthPx: 40,
} as const

export function createFocusToggleDetector() {
  let armed = false
  let mustRelease = false

  let holdSince: number | undefined
  let loweredSince: number | undefined

  let lastTime = -Infinity
  let dimensions = ''

  function result(
    state: FocusToggleState,
    blockSwipe: boolean,
    progress = 0,
    toggle = false,
  ): FocusToggleResult {
    return {
      state,
      blockSwipe,
      progress: Math.max(0, Math.min(1, progress)),
      ...(toggle ? { toggle: true as const } : {}),
    }
  }

  function clearTiming() {
    holdSince = undefined
    loweredSince = undefined
  }

  return {
    push(frame: PoseFrame | null): FocusToggleResult {
      if (
        !frame ||
        !Number.isFinite(frame.timestamp) ||
        !Number.isFinite(frame.width) ||
        !Number.isFinite(frame.height) ||
        frame.width <= 0 ||
        frame.height <= 0
      ) {
        clearTiming()
        armed = false
        return result(
          mustRelease ? 'wait-release' : 'searching',
          mustRelease,
        )
      }

      const { timestamp: time, width, height, landmarks } = frame

      if (time <= lastTime) {
        return result(
          mustRelease ? 'wait-release' : armed ? 'ready' : 'arming',
          mustRelease,
        )
      }

      const size = `${width}:${height}`

      if (
        dimensions !== '' &&
        (time - lastTime > FOCUS_TOGGLE.maxGapMs || dimensions !== size)
      ) {
        clearTiming()
        armed = false
      }

      lastTime = time
      dimensions = size

      const leftShoulder = landmarks[11]
      const rightShoulder = landmarks[12]
      const leftWrist = landmarks[15]
      const rightWrist = landmarks[16]

      if (
        !isVisible(leftShoulder) ||
        !isVisible(rightShoulder) ||
        !isVisible(leftWrist) ||
        !isVisible(rightWrist)
      ) {
        holdSince = undefined
        loweredSince = undefined

        return result(
          mustRelease ? 'wait-release' : 'searching',
          mustRelease,
        )
      }

      const shoulderDx =
        (leftShoulder.x - rightShoulder.x) * width

      const shoulderDy =
        (leftShoulder.y - rightShoulder.y) * height

      const shoulderWidth = Math.hypot(shoulderDx, shoulderDy)

      if (
        !Number.isFinite(shoulderWidth) ||
        shoulderWidth < FOCUS_TOGGLE.minShoulderWidthPx
      ) {
        clearTiming()
        armed = false
        return result(
          mustRelease ? 'wait-release' : 'searching',
          mustRelease,
        )
      }

      // MediaPipe normalized y grows downward.
      const leftAbove =
        ((leftShoulder.y - leftWrist.y) * height) / shoulderWidth

      const rightAbove =
        ((rightShoulder.y - rightWrist.y) * height) / shoulderWidth

      const leftBelow =
        ((leftWrist.y - leftShoulder.y) * height) / shoulderWidth

      const rightBelow =
        ((rightWrist.y - rightShoulder.y) * height) / shoulderWidth

      const bothHigh =
        leftAbove >= FOCUS_TOGGLE.raiseMargin &&
        rightAbove >= FOCUS_TOGGLE.raiseMargin

      const bothLowered =
        leftBelow >= FOCUS_TOGGLE.releaseMargin &&
        rightBelow >= FOCUS_TOGGLE.releaseMargin

      /**
       * After a successful toggle, do not allow another toggle or swipe until
       * both hands have clearly returned below shoulder level for a short time.
       */
      if (mustRelease) {
        holdSince = undefined

        if (!bothLowered) {
          loweredSince = undefined
          return result('wait-release', true)
        }

        loweredSince ??= time

        if (time - loweredSince < FOCUS_TOGGLE.releaseMs) {
          return result('wait-release', true)
        }

        mustRelease = false
        armed = true
        loweredSince = undefined

        return result('ready', false)
      }

      /**
       * New/reset detectors are intentionally not armed until a normal
       * hands-down posture has been observed. This prevents an accidental
       * toggle when the component remounts while the user's hands are already
       * above their shoulders.
       */
      if (!armed) {
        holdSince = undefined

        if (!bothLowered) {
          loweredSince = undefined
          return result('arming', bothHigh)
        }

        loweredSince ??= time

        if (time - loweredSince < FOCUS_TOGGLE.releaseMs) {
          return result('arming', false)
        }

        armed = true
        loweredSince = undefined
        return result('ready', false)
      }

      if (!bothHigh) {
        holdSince = undefined
        return result('ready', false)
      }

      holdSince ??= time

      const elapsed = time - holdSince
      const progress = elapsed / FOCUS_TOGGLE.holdMs

      if (elapsed < FOCUS_TOGGLE.holdMs) {
        return result('holding', true, progress)
      }

      armed = false
      mustRelease = true
      holdSince = undefined
      loweredSince = undefined

      return result('wait-release', true, 1, true)
    },
  }
}
