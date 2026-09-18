import type { PosePoint, DetectionState } from './poseGeometry'
import { drawPose, getDetectionState } from './poseGeometry'

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
  canvas: HTMLCanvasElement,
  onState: (state: PoseState) => void,
  load: () => Promise<PoseDetector>,
) {
  let stopped = false
  let detector: PoseDetector | undefined
  let frame = 0
  let lastTime = -1
  let lastInference = -Infinity
  let state: PoseState = 'loading'
  const context = canvas.getContext('2d')
  function report(next: PoseState) {
    if (!stopped && next !== state) {
      state = next
      onState(next)
    }
  }
  function clear() {
    context?.clearRect(0, 0, canvas.width, canvas.height)
  }
  function stop() {
    stopped = true
    cancelAnimationFrame(frame)
    const owned = detector
    detector = undefined
    owned?.close()
    clear()
  }
  function fail() {
    report('error')
    stop()
  }
  function tick(timestamp: number) {
    if (stopped || !detector || !context) return
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
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        lastTime = video.currentTime
        lastInference = timestamp
        const points =
          detector.detectForVideo(video, timestamp).landmarks[0] ?? []
        drawPose(context, points, canvas.width, canvas.height)
        report(getDetectionState(points))
      }
      frame = requestAnimationFrame(tick)
    } catch {
      fail()
    }
  }
  // Defer initialization so StrictMode's discarded setup does not load a model.
  void Promise.resolve().then(async () => {
    if (stopped) return
    if (!context) {
      fail()
      return
    }
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
