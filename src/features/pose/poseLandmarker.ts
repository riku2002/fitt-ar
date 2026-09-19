import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseDetector } from './poseSession'

export async function createPoseLandmarker(): Promise<PoseDetector> {
  const base = import.meta.env.BASE_URL
  const files = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
  async function load(backend: 'CPU' | 'GPU'): Promise<PoseDetector> {
    const model = await PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: `${base}models/pose_landmarker_lite.task`,
        delegate: backend,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    })
    return {
      backend,
      detectForVideo: (video, timestamp) =>
        model.detectForVideo(video, timestamp),
      close: () => model.close(),
    }
  }
  try {
    return await load('GPU')
  } catch {
    // Devices without a usable WebGL delegate retain a working CPU path.
    return load('CPU')
  }
}
