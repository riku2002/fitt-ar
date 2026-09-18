import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPoseSession } from './poseSession'
import type { PoseDetector } from './poseSession'

let callback: FrameRequestCallback | undefined
const context = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
}
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

beforeEach(() => {
  callback = undefined
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((next: FrameRequestCallback) => {
      callback = next
      return 1
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture() {
  const video = {
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    currentTime: 0,
  } as HTMLVideoElement
  const canvas = document.createElement('canvas')
  const detector = {
    detectForVideo: vi.fn(() => ({ landmarks: [] })),
    close: vi.fn(),
  }
  const report = vi.fn()
  return { video, canvas, detector, report }
}

describe('pose session lifecycle', () => {
  it('releases a model that finishes loading after stop without starting inference', async () => {
    const { video, canvas, detector, report } = fixture()
    let resolve!: (value: PoseDetector) => void
    const load = vi.fn(
      () =>
        new Promise<PoseDetector>((done) => {
          resolve = done
        }),
    )
    const stop = startPoseSession(video, canvas, report, load)
    await flush()
    stop()
    resolve(detector)
    await flush()
    expect(detector.close).toHaveBeenCalledOnce()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })
  it('does not load a discarded StrictMode session', async () => {
    const { video, canvas, detector, report } = fixture()
    const load = vi.fn(async () => detector)
    startPoseSession(video, canvas, report, load)()
    await flush()
    expect(load).not.toHaveBeenCalled()
  })
  it('throttles inference, skips duplicate frames, and cancels on stop', async () => {
    const { video, canvas, detector, report } = fixture()
    const stop = startPoseSession(video, canvas, report, async () => detector)
    await flush()
    callback?.(100)
    expect(detector.detectForVideo).toHaveBeenCalledExactlyOnceWith(video, 100)
    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(720)
    callback?.(200) // Same decoded video frame.
    expect(detector.detectForVideo).toHaveBeenCalledOnce()
    video.currentTime = 0.1
    callback?.(150) // New frame, but still inside the rate limit.
    expect(detector.detectForVideo).toHaveBeenCalledOnce()
    callback?.(210)
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2)
    stop()
    callback?.(300)
    stop()
    expect(detector.close).toHaveBeenCalledOnce()
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
  it('reports loading failure without starting a loop', async () => {
    const { video, canvas, report } = fixture()
    startPoseSession(video, canvas, report, async () => {
      throw new Error('missing model')
    })
    await flush()
    expect(report).toHaveBeenCalledWith('error')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('closes and clears if inference fails', async () => {
    const { video, canvas, detector, report } = fixture()
    detector.detectForVideo.mockImplementation(() => {
      throw new Error('runtime error')
    })
    startPoseSession(video, canvas, report, async () => detector)
    await flush()
    callback?.(100)
    expect(report).toHaveBeenLastCalledWith('error')
    expect(detector.close).toHaveBeenCalledOnce()
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720)
  })
})
