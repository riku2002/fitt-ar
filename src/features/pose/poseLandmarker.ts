import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export async function createPoseLandmarker() {
  const base = import.meta.env.BASE_URL
  const files = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: `${base}models/pose_landmarker_lite.task`,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  })
}
