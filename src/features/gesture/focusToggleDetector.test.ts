import { describe, expect, it } from 'vitest'
import { makePoseFrame } from '../../test/poseFixture'
import { createFocusToggleDetector } from './focusToggleDetector'

function frame(time: number, wrists: 'low' | 'high' | 'mixed' = 'low') {
  const source = makePoseFrame()
  const landmarks = source.landmarks.map((point) => ({ ...point }))

  // The fixture shoulders are near y=0.25. Use an unambiguous distance on
  // either side of the shoulder line.
  landmarks[15] = {
    ...landmarks[15],
    y: wrists === 'high' || wrists === 'mixed' ? 0.08 : 0.48,
    visibility: 1,
    presence: 1,
  }

  landmarks[16] = {
    ...landmarks[16],
    y: wrists === 'high' ? 0.08 : 0.48,
    visibility: 1,
    presence: 1,
  }

  return {
    ...source,
    timestamp: time,
    landmarks,
  }
}

function arm(detector: ReturnType<typeof createFocusToggleDetector>, start = 0) {
  for (const offset of [0, 100, 200, 300]) {
    detector.push(frame(start + offset, 'low'))
  }
}

describe('createFocusToggleDetector', () => {
  it('toggles once after both wrists stay above their shoulders', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    const events: boolean[] = []

    for (const time of [400, 600, 800, 1000, 1120]) {
      events.push(Boolean(detector.push(frame(time, 'high')).toggle))
    }

    expect(events).toEqual([false, false, false, false, true])
  })

  it('does not repeatedly toggle while both hands remain raised', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    let toggles = 0

    for (const time of [400, 600, 800, 1000, 1120, 1300, 1500, 1800, 2200]) {
      if (detector.push(frame(time, 'high')).toggle) {
        toggles += 1
      }
    }

    expect(toggles).toBe(1)
  })

  it('requires both hands to be lowered before another toggle can occur', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    for (const time of [400, 600, 800, 1000, 1120]) {
      detector.push(frame(time, 'high'))
    }

    for (const time of [1200, 1320, 1460]) {
      detector.push(frame(time, 'low'))
    }

    let toggled = false

    for (const time of [1560, 1760, 1960, 2160, 2280]) {
      toggled ||= Boolean(detector.push(frame(time, 'high')).toggle)
    }

    expect(toggled).toBe(true)
  })

  it('does not toggle when only one hand is above the shoulders', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    for (const time of [400, 700, 1000, 1300, 1600]) {
      expect(detector.push(frame(time, 'mixed')).toggle).toBeUndefined()
    }
  })

  it('blocks horizontal swipe recognition while the two-hand gesture is held', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    const holding = detector.push(frame(400, 'high'))

    expect(holding.state).toBe('holding')
    expect(holding.blockSwipe).toBe(true)
  })

  it('requires valid wrist tracking', () => {
    const detector = createFocusToggleDetector()
    arm(detector)

    const missing = frame(500, 'high')
    missing.landmarks[16].visibility = 0.1

    const result = detector.push(missing)
    expect(result.state).toBe('searching')
    expect(result.toggle).toBeUndefined()
  })
})
