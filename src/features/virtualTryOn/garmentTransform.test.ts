import { describe, expect, it } from 'vitest'
import { calculateGarmentTransform } from './garmentTransform'
import type { GarmentTransform } from './garmentTransform'
import { demoGarment } from '../wardrobe/garments'
import { makePoseFrame } from '../../test/poseFixture'

const project = (m: GarmentTransform, x: number, y: number) => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
})
describe('garment placement', () => {
  it('fits shoulders and torso in pixel space, without requiring wrists', () => {
    const transform = calculateGarmentTransform(
      makePoseFrame(),
      demoGarment,
      800,
      800,
    )!
    expect(project(transform, 560, 160)).toEqual({ x: 800, y: 180 })
    expect(project(transform, 240, 160)).toEqual({ x: 480, y: 180 })
    expect(project(transform, 400, 640)).toEqual({ x: 640, y: 540 })
    expect(transform.a).toBeGreaterThan(0) // Anatomical left is image-right.
    expect(transform.d).toBeGreaterThan(0)
  })
  it('follows translation, tilt and distance using non-square video dimensions', () => {
    const original = makePoseFrame()
    const angle = Math.PI / 8,
      scale = 0.7
    const moved = {
      ...original,
      landmarks: original.landmarks.map((p) => {
        const x = p.x * original.width - 640,
          y = p.y * original.height - 360
        return {
          ...p,
          x:
            (700 + scale * (Math.cos(angle) * x - Math.sin(angle) * y)) /
            original.width,
          y:
            (350 + scale * (Math.sin(angle) * x + Math.cos(angle) * y)) /
            original.height,
        }
      }),
    }
    const transform = calculateGarmentTransform(moved, demoGarment, 800, 800)!
    for (const [index, x, y] of [
      [11, 560, 160],
      [12, 240, 160],
      [23, 560, 640],
      [24, 240, 640],
    ]) {
      const actual = project(transform, x, y)
      expect(actual.x).toBeCloseTo(moved.landmarks[index].x * moved.width)
      expect(actual.y).toBeCloseTo(moved.landmarks[index].y * moved.height)
    }
  })
  it('keeps shoulder center fixed while applying size and offset calibration', () => {
    const frame = makePoseFrame()
    const transform = calculateGarmentTransform(
      frame,
      { ...demoGarment, scaleX: 1.2, scaleY: 1.1, offsetX: 0.1, offsetY: 0.1 },
      800,
      800,
    )!
    expect(project(transform, 400, 160)).toEqual({ x: 672, y: 216 })
  })
  it('hides on lost shoulders/hips, invalid values, or degenerate/back-facing poses', () => {
    for (const index of [11, 12, 23, 24]) {
      const frame = makePoseFrame()
      frame.landmarks[index].visibility = 0.2
      expect(calculateGarmentTransform(frame, demoGarment, 800, 800)).toBeNull()
    }
    const frame = makePoseFrame()
    frame.landmarks[11].x = frame.landmarks[12].x
    expect(calculateGarmentTransform(frame, demoGarment, 800, 800)).toBeNull()
    const back = makePoseFrame()
    back.landmarks[11].x = 0.375
    back.landmarks[12].x = 0.625
    expect(calculateGarmentTransform(back, demoGarment, 800, 800)).toBeNull()
    expect(
      calculateGarmentTransform(makePoseFrame(), demoGarment, 0, 800),
    ).toBeNull()
    expect(
      calculateGarmentTransform(
        makePoseFrame(),
        { ...demoGarment, scaleY: NaN },
        800,
        800,
      ),
    ).toBeNull()
  })
})
