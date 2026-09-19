import { describe, expect, it } from 'vitest'
import { makeSwipeFrame } from '../../test/swipeFixture'
import type { PoseFrame } from '../pose/poseTypes'
import { createSwipeDetector, type SwipeDirection } from './swipeDetector'

const path = [-0.5, -0.2, 0.1, 0.4]
const frames = (start = 0, hand: 15 | 16 = 15) =>
  path.map((x, i) => makeSwipeFrame(start + i * 80, x, hand))
const directions = (
  detector: ReturnType<typeof createSwipeDetector>,
  input: (PoseFrame | null)[],
) =>
  input.flatMap((frame) => {
    const { direction } = detector.push(frame)
    return direction ? [direction] : []
  })

describe('wrist swipes', () => {
  it.each([
    [false, 15, 'previous'],
    [false, 16, 'previous'],
    [true, 15, 'next'],
    [true, 16, 'next'],
  ] as const)(
    'maps screen direction with mirrored=%s and wrist=%s',
    (mirror, hand, direction) => {
      expect(directions(createSwipeDetector(mirror), frames(0, hand))).toEqual([
        direction,
      ])
      const reverse = [...path]
        .reverse()
        .map((x, i) => makeSwipeFrame(i * 80, x, hand))
      expect(directions(createSwipeDetector(mirror), reverse)).toEqual([
        direction === 'next' ? 'previous' : 'next',
      ])
    },
  )

  it.each([
    ['small jitter', [0, 0.1, -0.1, 0.2, 0]],
    ['one-frame jump', [-0.5, -0.5, 0.5, 0.5]],
    ['backtracking', [-0.5, 0, -0.2, 0.4]],
  ])('rejects %s', (_, xs) => {
    expect(
      directions(
        createSwipeDetector(false),
        xs.map((x, i) => makeSwipeFrame(i * 80, x)),
      ),
    ).toEqual([])
  })

  it('requires a short horizontal movement rather than vertical or slow movement', () => {
    const vertical = path.map((x, i) =>
      makeSwipeFrame(i * 80, x, 15, 0.05 + i * 0.15),
    )
    const slow = path.map((x, i) => makeSwipeFrame(i * 240, x))
    expect(directions(createSwipeDetector(false), vertical)).toEqual([])
    expect(directions(createSwipeDetector(false), slow)).toEqual([])
  })

  it('ignores lowered hands and low-confidence wrists or torsos', () => {
    for (const point of [11, 12, 23, 24, 15]) {
      const input = frames().map((frame) => {
        frame.landmarks[point].visibility = 0.6
        return frame
      })
      expect(directions(createSwipeDetector(false), input)).toEqual([])
    }
    expect(
      directions(
        createSwipeDetector(false),
        path.map((x, i) => makeSwipeFrame(i * 80, x, 15, 1)),
      ),
    ).toEqual([])
  })

  it('does not interpret body motion or camera distance changes as a swipe', () => {
    const movingBody = frames().map((frame, i) => ({
      ...frame,
      landmarks: frame.landmarks.map((p, index) => ({
        ...p,
        x: index === 15 ? 0.5 : p.x - i * 0.08,
      })),
    }))
    const approaching = frames().map((frame, i) => ({
      ...frame,
      landmarks: frame.landmarks.map((p) => ({
        ...p,
        x: 0.5 + (p.x - 0.5) * (0.8 + i * 0.2),
      })),
    }))
    expect(directions(createSwipeDetector(false), movingBody)).toEqual([])
    expect(directions(createSwipeDetector(false), approaching)).toEqual([])
  })

  it('clears partial movement after tracking loss, stale frames or resizing', () => {
    const lostWrist = makeSwipeFrame(180, 0)
    lostWrist.landmarks[15].visibility = 0
    const badTimestamp = { ...makeSwipeFrame(180, 0), timestamp: NaN }
    const interruptions = [null, lostWrist, badTimestamp, makeSwipeFrame(80, 0)]
    for (const interruption of interruptions) {
      expect(
        directions(createSwipeDetector(false), [
          ...frames().slice(0, 3),
          interruption,
          makeSwipeFrame(240, 0.4),
        ]),
      ).toEqual([])
    }
    expect(
      directions(createSwipeDetector(false), [
        ...frames().slice(0, 3),
        makeSwipeFrame(500, 0.4),
      ]),
    ).toEqual([])
    expect(
      directions(
        createSwipeDetector(false),
        frames().map((frame, i) =>
          i === 3 ? { ...frame, width: 640, height: 360 } : frame,
        ),
      ),
    ).toEqual([])
  })

  it('does not combine samples from different wrists or ambiguous opposite swipes', () => {
    const switchedHand = frames().map((frame, i) =>
      makeSwipeFrame(frame.timestamp, path[i], i < 2 ? 15 : 16),
    )
    expect(directions(createSwipeDetector(false), switchedHand)).toEqual([])
    const bothHands = frames().map((frame, i) => {
      frame.landmarks[16] = makeSwipeFrame(
        frame.timestamp,
        -path[i],
        16,
      ).landmarks[16]
      return frame
    })
    expect(directions(createSwipeDetector(false), bothHands)).toEqual([])
  })

  it('fires once when both hands swipe in the same direction', () => {
    const both = frames().map((frame) => {
      frame.landmarks[16] = { ...frame.landmarks[15] }
      return frame
    })
    expect(directions(createSwipeDetector(false), both)).toEqual(['previous'])
  })

  it('blocks return strokes and the other hand until lowered and cooldown has elapsed', () => {
    const detector = createSwipeDetector(false)
    const events: SwipeDirection[] = directions(detector, frames())
    events.push(
      ...directions(
        detector,
        [...path].reverse().map((x, i) => makeSwipeFrame(320 + i * 80, x)),
      ),
    )
    // Even after 900ms, keeping the triggering hand up must not re-arm it.
    for (let time = 640; time < 1520; time += 80)
      detector.push(makeSwipeFrame(time, -0.5))
    expect(
      directions(
        detector,
        frames(1520, 16).map((frame) => {
          frame.landmarks[15] = makeSwipeFrame(
            frame.timestamp,
            -0.5,
          ).landmarks[15]
          return frame
        }),
      ),
    ).toEqual([])
    for (const time of [1840, 1920, 2000])
      detector.push(makeSwipeFrame(time, -0.5, 15, 1))
    events.push(...directions(detector, frames(2080)))
    expect(events).toEqual(['previous', 'previous'])
  })

  it('requires the cooldown even when the hand is lowered immediately', () => {
    const detector = createSwipeDetector(false)
    directions(detector, frames())
    for (const time of [320, 400, 480])
      detector.push(makeSwipeFrame(time, -0.5, 15, 1))
    expect(directions(detector, frames(560))).toEqual([])
    for (const time of [880, 960, 1040])
      detector.push(makeSwipeFrame(time, -0.5))
    expect(directions(detector, frames(1160))).toEqual(['previous'])
  })
})
