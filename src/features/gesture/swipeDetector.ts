import { isVisible, type PosePoint } from '../pose/poseGeometry'
import type { PoseFrame } from '../pose/poseTypes'

export type SwipeDirection = 'next' | 'previous'
export type SwipeState = 'searching' | 'raise-hand' | 'ready' | 'cooldown'
export interface SwipeResult {
  state: SwipeState
  direction?: SwipeDirection
}

// Distances are in shoulder-width units; timings use the inference timestamp.
export const SWIPE = {
  windowMs: 650,
  minDurationMs: 160,
  maxGapMs: 250,
  minSamples: 4,
  distance: 0.8,
  verticalRange: 0.35,
  consistency: 0.82,
  maxStep: 0.65,
  cooldownMs: 900,
} as const

interface Sample {
  time: number
  x: number
  y: number
  rawX: number
  centerX: number
  width: number
}

const confident = (point: PosePoint | undefined): point is PosePoint =>
  isVisible(point) && point.visibility >= 0.65 && (point.presence ?? 1) >= 0.65

/** Either wrist may trigger, but histories and identity are never mixed. */
export function createSwipeDetector(mirrored: boolean) {
  const histories: Sample[][] = [[], []]
  let lastTime = -Infinity
  let dimensions = ''
  let cooldownUntil = -Infinity
  let lockedHand: number | null = null
  let loweredSince: number | undefined
  const clear = () => {
    histories.forEach((history) => (history.length = 0))
    loweredSince = undefined
  }
  return {
    push(frame: PoseFrame | null): SwipeResult {
      if (
        !frame ||
        !Number.isFinite(frame.timestamp) ||
        !Number.isFinite(frame.width) ||
        !Number.isFinite(frame.height) ||
        frame.width <= 0 ||
        frame.height <= 0
      ) {
        clear()
        return { state: 'searching' }
      }
      const { landmarks: p, timestamp: time, width, height } = frame
      const size = `${width}:${height}`
      if (time <= lastTime) {
        clear()
        return { state: 'searching' }
      }
      if (time - lastTime > SWIPE.maxGapMs || dimensions !== size) clear()
      lastTime = time
      dimensions = size
      const [ls, rs, lh, rh] = [p[11], p[12], p[23], p[24]]
      if (![ls, rs, lh, rh].every(confident)) {
        clear()
        return { state: 'searching' }
      }
      const centerX = ((ls.x + rs.x) * width) / 2
      const centerY = ((ls.y + rs.y) * height) / 2
      const dx = (ls.x - rs.x) * width
      const dy = (ls.y - rs.y) * height
      const shoulderWidth = Math.hypot(dx, dy)
      const hipX = ((lh.x + rh.x) * width) / 2 - centerX
      const hipY = ((lh.y + rh.y) * height) / 2 - centerY
      const torsoHeight = (-hipX * dy + hipY * dx) / shoulderWidth
      if (dx <= 0 || shoulderWidth < 40 || torsoHeight < 40) {
        clear()
        return { state: 'searching' }
      }
      const wrists = [p[15], p[16]]
      const torsoPosition = (point: PosePoint) =>
        (-(point.x * width - centerX) * dy +
          (point.y * height - centerY) * dx) /
        shoulderWidth /
        torsoHeight

      // Lock both hands after a trigger, including the return stroke. Re-arm
      // after lowering the triggering hand (or it leaves the frame) and 900ms.
      if (lockedHand !== null) {
        const wrist = wrists[lockedHand]
        const seen = confident(wrist)
        if (!seen || torsoPosition(wrist) >= 0.8) {
          loweredSince ??= time
          if (time - loweredSince >= (seen ? 160 : 300)) lockedHand = null
        } else loweredSince = undefined
      }
      if (lockedHand !== null || time < cooldownUntil) {
        histories.forEach((history) => (history.length = 0))
        return { state: 'cooldown' }
      }

      const candidates: { hand: number; direction: SwipeDirection }[] = []
      let raised = false
      wrists.forEach((wrist, hand) => {
        const history = histories[hand]
        if (
          !confident(wrist) ||
          torsoPosition(wrist) < -0.15 ||
          torsoPosition(wrist) > 0.7 ||
          Math.abs(wrist.x * width - centerX) > shoulderWidth * 1.6
        ) {
          history.length = 0
          return
        }
        raised = true
        const sample: Sample = {
          time,
          x:
            ((wrist.x * width - centerX) / shoulderWidth) * (mirrored ? -1 : 1),
          y: (wrist.y * height - centerY) / shoulderWidth,
          rawX: wrist.x * width * (mirrored ? -1 : 1),
          centerX,
          width: shoulderWidth,
        }
        const previous = history.at(-1)
        if (previous && Math.abs(sample.x - previous.x) > SWIPE.maxStep)
          history.length = 0
        history.push(sample)
        while (history[0].time < time - SWIPE.windowMs) history.shift()
        for (
          let start = 0;
          start <= history.length - SWIPE.minSamples;
          start++
        ) {
          const path = history.slice(start)
          const first = path[0]
          const movement = sample.x - first.x
          if (
            time - first.time < SWIPE.minDurationMs ||
            Math.abs(movement) < SWIPE.distance
          )
            continue
          const travel = path
            .slice(1)
            .reduce((sum, s, i) => sum + Math.abs(s.x - path[i].x), 0)
          const ys = path.map((s) => s.y)
          if (
            Math.max(...ys) - Math.min(...ys) > SWIPE.verticalRange ||
            Math.abs(movement) / travel < SWIPE.consistency ||
            Math.abs(sample.centerX - first.centerX) / shoulderWidth > 0.3 ||
            Math.max(sample.width, first.width) /
              Math.min(sample.width, first.width) >
              1.3 ||
            Math.sign(sample.rawX - first.rawX) !== Math.sign(movement) ||
            Math.abs(sample.rawX - first.rawX) / shoulderWidth <
              SWIPE.distance * 0.7
          )
            continue
          candidates.push({
            hand,
            direction: movement < 0 ? 'next' : 'previous',
          })
          break
        }
      })
      if (candidates.length) {
        clear()
        // Two hands moving in opposite directions is ambiguous, not a swipe.
        if (
          candidates.some(
            (candidate) => candidate.direction !== candidates[0].direction,
          )
        )
          return { state: 'ready' }
        lockedHand = candidates[0].hand
        cooldownUntil = time + SWIPE.cooldownMs
        return { state: 'cooldown', direction: candidates[0].direction }
      }
      return { state: raised ? 'ready' : 'raise-hand' }
    },
  }
}
