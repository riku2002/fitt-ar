import type { PoseFrame, PosePoint } from '../features/pose/poseTypes'

export function makePoseFrame(): PoseFrame {
  const landmarks: PosePoint[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }))
  landmarks[11] = { x: 0.625, y: 0.25, z: 0, visibility: 1 }
  landmarks[12] = { x: 0.375, y: 0.25, z: 0, visibility: 1 }
  landmarks[23] = { x: 0.625, y: 0.75, z: 0, visibility: 1 }
  landmarks[24] = { x: 0.375, y: 0.75, z: 0, visibility: 1 }
  return { width: 1280, height: 720, timestamp: 100, landmarks }
}
