import { describe, expect, it, vi } from 'vitest'
import {
  BODY_POINTS,
  drawPose,
  getDetectionState,
  isVisible,
  normalizedToPixel,
} from './poseGeometry'

describe('pose geometry', () => {
  it('maps normalized landmarks to the actual video dimensions', () => {
    const point = { x: 0.25, y: 0.75, visibility: 1 }
    expect(normalizedToPixel(point, 1280, 720)).toEqual({ x: 320, y: 540 })
    expect(normalizedToPixel(point, 720, 1280)).toEqual({ x: 180, y: 960 })
  })
  it('rejects low confidence, out-of-frame and non-finite landmarks', () => {
    const point = { x: 0.5, y: 0.5, visibility: 1 }
    expect(isVisible(point)).toBe(true)
    for (const override of [
      { visibility: 0.49 },
      { presence: 0.49 },
      { x: NaN },
      { y: 1.1 },
      { x: -0.1 },
    ]) {
      expect(isVisible({ ...point, ...override })).toBe(false)
    }
    expect(isVisible(undefined)).toBe(false)
  })
  it('only reports full tracking when all eight required points are visible', () => {
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0,
    }))
    expect(getDetectionState(points)).toBe('searching')
    points[11].visibility = 1
    expect(getDetectionState(points)).toBe('partial')
    BODY_POINTS.forEach((index) => {
      points[index].visibility = 1
    })
    expect(getDetectionState(points)).toBe('tracking')
    expect(getDetectionState([])).toBe('searching')
  })
  it('clears old results and does not connect an invisible endpoint', () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0,
    }))
    points[11].visibility = 1
    drawPose(context as unknown as CanvasRenderingContext2D, points, 1280, 720)
    expect(context.arc).toHaveBeenCalledOnce()
    expect(context.lineTo).not.toHaveBeenCalled()
    drawPose(context as unknown as CanvasRenderingContext2D, [], 1280, 720)
    expect(context.clearRect).toHaveBeenCalledTimes(2)
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 1280, 720)
  })
})
