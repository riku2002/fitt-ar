import { isVisible } from '../pose/poseGeometry'
import type { PoseFrame } from '../pose/poseTypes'

export type SwipeDirection = 'next' | 'previous'
export type SwipeState =
  'searching' | 'hand-missing' | 'raise-hand' | 'ready' | 'cooldown'
export interface SwipeResult {
  state: SwipeState
  direction?: SwipeDirection
}

// Distances use shoulder widths and durations use elapsed time, not frame counts.
export const SWIPE = {
  windowMs: 900,
  minDurationMs: 90,
  maxGapMs: 320,
  minSamples: 3,
  distance: 0.65,
  minSpeed: 0.75,
  verticalRange: 0.6,
  consistency: 0.78,
  cooldownMs: 600,
  settleMs: 240,
  settleRange: 0.14,
} as const

interface Sample {
  time: number
  x: number
  y: number
  rawX: number
  centerX: number
  width: number
}

/** Either wrist may trigger; never join samples from different hands. */
export function createSwipeDetector(mirrored: boolean) {
  const histories: Sample[][] = [[], []]
  let lastTime = -Infinity
  let dimensions = ''
  let cooldownUntil = -Infinity
  let lockedHand: number | null = null
  let releaseAnchor: Sample | undefined
  let absentSince: number | undefined
  const clear = () => histories.forEach((history) => (history.length = 0))
  const resetMotion = () => {
    clear()
    releaseAnchor = undefined
    absentSince = undefined
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
        resetMotion()
        return { state: 'searching' }
      }
      const { landmarks: p, timestamp: time, width, height } = frame
      if (time <= lastTime) {
        resetMotion()
        return { state: 'searching' }
      }
      const size = `${width}:${height}`
      if (time - lastTime > SWIPE.maxGapMs || dimensions !== size) resetMotion()
      lastTime = time
      dimensions = size

      // Hips are required to draw a garment, but not to recognize a hand swipe.
      // Keep a short history through a missed shoulder/wrist observation; do not
      // fabricate coordinates or accept a gesture until tracking returns.
      const [ls, rs] = [p[11], p[12]]
      if (!isVisible(ls) || !isVisible(rs)) return { state: 'searching' }
      const centerX = ((ls.x + rs.x) * width) / 2
      const centerY = ((ls.y + rs.y) * height) / 2
      const dx = (ls.x - rs.x) * width
      const dy = (ls.y - rs.y) * height
      const shoulderWidth = Math.hypot(dx, dy)
      if (dx <= 0 || shoulderWidth < 40) {
        resetMotion()
        return { state: 'searching' }
      }
      const samples = [p[15], p[16]].map((wrist): Sample | undefined => {
        if (!isVisible(wrist)) return undefined
        const px = wrist.x * width - centerX
        const py = wrist.y * height - centerY
        return {
          time,
          x: (px / shoulderWidth) * (mirrored ? -1 : 1),
          y: (-px * dy + py * dx) / (shoulderWidth * shoulderWidth),
          rawX: wrist.x * width * (mirrored ? -1 : 1),
          centerX,
          width: shoulderWidth,
        }
      })

      // A brief pause OR lowering the hand re-arms. A continuous return stroke
      // stays locked, but the user no longer has to reach a detected hip.
      if (lockedHand !== null) {
        const sample = samples[lockedHand]
        let released: boolean
        if (!sample || sample.y > 1.05) {
          releaseAnchor = undefined
          absentSince ??= time
          released = time - absentSince >= (sample ? 160 : 350)
        } else {
          absentSince = undefined
          if (
            !releaseAnchor ||
            Math.hypot(sample.x - releaseAnchor.x, sample.y - releaseAnchor.y) >
              SWIPE.settleRange
          )
            releaseAnchor = sample
          released = time - releaseAnchor.time >= SWIPE.settleMs
        }
        clear()
        if (!released || time < cooldownUntil) return { state: 'cooldown' }
        lockedHand = null
        releaseAnchor = undefined
        absentSince = undefined
      }

      const candidates: { hand: number; direction: SwipeDirection }[] = []
      let raised = false
      samples.forEach((sample, hand) => {
        const history = histories[hand]
        if (history.length && time - history.at(-1)!.time > SWIPE.maxGapMs)
          history.length = 0
        if (!sample) return
        if (sample.y < -0.45 || sample.y > 1.05 || Math.abs(sample.x) > 1.8) {
          history.length = 0
          return
        }
        raised = true
        history.push(sample)
        while (history[0].time < time - SWIPE.windowMs) history.shift()
        for (
          let start = 0;
          start <= history.length - SWIPE.minSamples;
          start++
        ) {
          const path = history.slice(start)
          const first = path[0]
          const elapsed = time - first.time
          const movement = sample.x - first.x
          const distance = Math.abs(movement)
          if (
            elapsed < SWIPE.minDurationMs ||
            distance < SWIPE.distance ||
            (distance * 1000) / elapsed < SWIPE.minSpeed
          )
            continue
          const steps = path.slice(1).map((s, i) => Math.abs(s.x - path[i].x))
          const travel = steps.reduce((sum, step) => sum + step, 0)
          const ys = path.map((s) => s.y)
          if (
            Math.max(...ys) - Math.min(...ys) > SWIPE.verticalRange ||
            Math.abs(sample.y - first.y) > distance * 0.7 ||
            distance / travel < SWIPE.consistency ||
            // Require movement across at least two observations. Unlike a
            // fixed per-frame jump limit, this also works at 8–10 FPS.
            Math.max(...steps) > distance * 0.85 ||
            Math.abs(sample.centerX - first.centerX) / shoulderWidth > 0.35 ||
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
        if (candidates.some((c) => c.direction !== candidates[0].direction))
          return { state: 'ready' }
        lockedHand = candidates[0].hand
        cooldownUntil = time + SWIPE.cooldownMs
        releaseAnchor = samples[lockedHand]
        absentSince = undefined
        return { state: 'cooldown', direction: candidates[0].direction }
      }
      return {
        state: raised
          ? 'ready'
          : samples.some(Boolean)
            ? 'raise-hand'
            : 'hand-missing',
      }
    },
  }
}
