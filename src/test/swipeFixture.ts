import { makePoseFrame } from './poseFixture'

// A front-facing torso: 320px shoulders, shoulders at y=180, hips at y=540.
export function makeSwipeFrame(
  timestamp: number,
  x: number,
  hand: 15 | 16 = 15,
  y = 0.35,
) {
  const frame = makePoseFrame()
  const landmarks = [...frame.landmarks]
  landmarks[hand] = {
    x: (640 + x * 320) / 1280,
    y: (180 + y * 320) / 720,
    z: 0,
    visibility: 1,
  }
  return { ...frame, timestamp, landmarks }
}
