import type { PosePoint, DetectionState } from './poseGeometry'
import { getDetectionState } from './poseGeometry'
import type { PoseFrame } from './poseTypes'

export interface PoseDetector {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): { landmarks: PosePoint[][] }
  close(): void
}

export type PoseState = 'loading' | DetectionState | 'error'

// A session owns exactly one model and animation loop; async initialization may
// finish after the camera has stopped, in which case the model is closed unused.
export function startPoseSession(
  video: HTMLVideoElement,
  {
    onFrame,
    onState,
  }: {
    onFrame: (frame: PoseFrame | null) => void
    onState: (state: PoseState) => void
  },
  load: () => Promise<PoseDetector>,
) {
  let stopped = false
  let detector: PoseDetector | undefined
  let frame = 0
  let lastTime = -1
  let lastInference = -Infinity
  let state: PoseState = 'loading'
  let hasFrame = false
  function report(next: PoseState) {
    if (!stopped && next !== state) {
      state = next
      onState(next)
    }
  }
  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    const owned = detector
    detector = undefined
    owned?.close()
    onFrame(null)
  }
  function fail() {
    report('error')
    stop()
  }
  function tick(timestamp: number) {
    if (stopped || !detector) return
    try {
      // Keep the camera at its native rate, while inference runs at most 15 FPS.
      if (
        !document.hidden &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        video.currentTime !== lastTime &&
        timestamp - lastInference >= 1000 / 15
      ) {
        lastTime = video.currentTime
        lastInference = timestamp
        const points =
          detector.detectForVideo(video, timestamp).landmarks[0] ?? []
        onFrame({
          landmarks: points,
          width: video.videoWidth,
          height: video.videoHeight,
          timestamp,
        })
        hasFrame = true
        report(getDetectionState(points))
      } else if (
        hasFrame &&
        (document.hidden || timestamp - lastInference > 500)
      ) {
        onFrame(null)
        hasFrame = false
        report('searching')
      }
      frame = requestAnimationFrame(tick)
    } catch {
      fail()
    }
  }
  // Defer initialization so StrictMode's discarded setup does not load a model.
  void Promise.resolve().then(async () => {
    if (stopped) return
    try {
      const ready = await load()
      if (stopped) {
        ready.close()
        return
      }
      detector = ready
      report('searching')
      frame = requestAnimationFrame(tick)
    } catch {
      if (!stopped) fail()
    }
  })
  return stop
}
