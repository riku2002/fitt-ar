import { describe, expect, it } from 'vitest'
import { makeSwipeFrame } from '../../test/swipeFixture'
import { createSwipeDetector } from './swipeDetector'

// Sample the same physical trajectory at different rates and camera phases.
// These are synthetic regression cases, not measured human detection rates.
function replay(fps: number, duration: number, phase: number, noisy = false) {
  const detector = createSwipeDetector(true)
  const events: { at: number; direction: string }[] = []
  for (
    let t = -200 + phase * (1000 / fps);
    t <= duration + 250;
    t += 1000 / fps
  ) {
    const progress = Math.max(0, Math.min(1, t / duration))
    const frame = makeSwipeFrame(
      1000 + t,
      -0.55 + progress * 1.1 + (noisy ? Math.sin(t * 0.17) * 0.025 : 0),
      15,
      0.35 + Math.sin(progress * Math.PI) * 0.18,
    )
    if (noisy) {
      frame.landmarks[15].visibility = 0.6
      frame.landmarks[23].visibility = 0.1
      frame.landmarks[24].visibility = 0.1
    }
    const { direction } = detector.push(frame)
    if (direction) events.push({ at: t, direction })
  }
  return events
}

describe.each([8, 10, 15, 30])(
  'sampled swipe trajectories at %i FPS',
  (fps) => {
    it.each([200, 400, 800])(
      'detects a %ims swipe once across sampling phases',
      (duration) => {
        const results = [0, 0.25, 0.5, 0.75].map((phase) =>
          replay(fps, duration, phase),
        )
        expect(results.map((events) => events.map((e) => e.direction))).toEqual(
          Array.from({ length: 4 }, () => ['next']),
        )
        results.forEach((events) =>
          expect(events[0].at).toBeLessThanOrEqual(duration + 200),
        )
      },
    )

    it('tolerates ordinary wrist confidence, small noise and hips outside the frame', () => {
      const results = [0, 0.25, 0.5, 0.75].map((phase) =>
        replay(fps, 500, phase, true),
      )
      expect(results.map((events) => events.map((e) => e.direction))).toEqual(
        Array.from({ length: 4 }, () => ['next']),
      )
    })
  },
)
