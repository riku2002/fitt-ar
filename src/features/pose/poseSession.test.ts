import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPoseSession } from './poseSession'
import type { PoseDetector } from './poseSession'
import { createPoseChannel } from './poseChannel'

let callback: FrameRequestCallback | undefined
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
  const detector = {
    detectForVideo: vi.fn(() => ({ landmarks: [] })),
    close: vi.fn(),
  }
  const callbacks = { onFrame: vi.fn(), onState: vi.fn() }
  return { video, detector, callbacks }
}

describe('shared pose session lifecycle', () => {
  it('closes a model loaded after stop without starting inference', async () => {
    const { video, detector, callbacks } = fixture()
    let resolve!: (value: PoseDetector) => void
    const stop = startPoseSession(
      video,
      callbacks,
      () =>
        new Promise<PoseDetector>((done) => {
          resolve = done
        }),
    )
    await flush()
    stop()
    resolve(detector)
    await flush()
    expect(detector.close).toHaveBeenCalledOnce()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(callbacks.onState).not.toHaveBeenCalled()
    expect(callbacks.onFrame).toHaveBeenCalledExactlyOnceWith(null)
  })
  it('does not load a discarded StrictMode session', async () => {
    const { video, detector, callbacks } = fixture()
    const load = vi.fn(async () => detector)
    startPoseSession(video, callbacks, load)()
    await flush()
    expect(load).not.toHaveBeenCalled()
  })
  it('shares one inference with multiple consumers and stops publishing after disposal', async () => {
    const { video, detector, callbacks } = fixture()
    const channel = createPoseChannel()
    const skeleton = vi.fn(),
      garment = vi.fn()
    channel.subscribe(skeleton)
    channel.subscribe(garment)
    const stop = startPoseSession(
      video,
      { ...callbacks, onFrame: channel.publish },
      async () => detector,
    )
    await flush()
    callback?.(100)
    expect(detector.detectForVideo).toHaveBeenCalledExactlyOnceWith(video, 100)
    expect(skeleton.mock.lastCall?.[0]).toBe(garment.mock.lastCall?.[0])
    expect(skeleton).toHaveBeenLastCalledWith({
      landmarks: [],
      width: 1280,
      height: 720,
      timestamp: 100,
    })
    callback?.(120) // Same decoded frame.
    video.currentTime = 0.1
    callback?.(150) // Below 15 FPS interval.
    expect(detector.detectForVideo).toHaveBeenCalledOnce()
    callback?.(210)
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2)
    stop()
    callback?.(300)
    stop()
    expect(detector.close).toHaveBeenCalledOnce()
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2)
    expect(garment).toHaveBeenLastCalledWith(null)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
  it('clears a stalled video and resumes with fresh frames', async () => {
    const { video, detector, callbacks } = fixture()
    const stop = startPoseSession(video, callbacks, async () => detector)
    await flush()
    callback?.(100)
    callback?.(601)
    expect(callbacks.onFrame).toHaveBeenLastCalledWith(null)
    video.currentTime = 1
    callback?.(700)
    expect(callbacks.onFrame.mock.lastCall?.[0]?.timestamp).toBe(700)
    stop()
  })
  it('reports loading failure without starting a loop', async () => {
    const { video, callbacks } = fixture()
    startPoseSession(video, callbacks, async () => {
      throw new Error('missing model')
    })
    await flush()
    expect(callbacks.onState).toHaveBeenCalledWith('error')
    expect(callbacks.onFrame).toHaveBeenLastCalledWith(null)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('closes and clears all consumers if inference fails', async () => {
    const { video, detector, callbacks } = fixture()
    detector.detectForVideo.mockImplementation(() => {
      throw new Error('runtime error')
    })
    startPoseSession(video, callbacks, async () => detector)
    await flush()
    callback?.(100)
    expect(callbacks.onState).toHaveBeenLastCalledWith('error')
    expect(detector.close).toHaveBeenCalledOnce()
    expect(callbacks.onFrame).toHaveBeenLastCalledWith(null)
  })
})
