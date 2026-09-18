import type { PoseFrame } from '../features/pose/poseTypes'

export function makePoseFrame(): PoseFrame {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }))
  landmarks[11] = { x: 0.625, y: 0.25, visibility: 1 }
  landmarks[12] = { x: 0.375, y: 0.25, visibility: 1 }
  landmarks[23] = { x: 0.625, y: 0.75, visibility: 1 }
  landmarks[24] = { x: 0.375, y: 0.75, visibility: 1 }
  return { width: 1280, height: 720, timestamp: 100, landmarks }
}
