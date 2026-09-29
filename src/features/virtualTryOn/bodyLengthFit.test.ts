import { expect, it } from 'vitest'
import { standingAnkleCenter } from './bodyLengthFit'
import { makePoseFrame } from '../../test/poseFixture'

function standing() {
  const original = makePoseFrame()
  const frame = { ...original, width: 720, height: 1280, landmarks: original.landmarks.map(p => ({ ...p })) }
  for (const [i, x, y] of [[23,.6,.45],[24,.4,.45],[25,.6,.65],[26,.4,.65],[27,.6,.85],[28,.4,.85]]) {
    frame.landmarks[i] = { x, y, z: 0, visibility: 1, presence: 1 }
  }
  return frame
}
it('uses both ankles of a standing person', () => {
  expect(standingAnkleCenter(standing())).toEqual({ x: .5, y: .85 })
})
it.each([23,24,25,26,27,28])('rejects low confidence at landmark %s', i => {
  const frame = standing(); frame.landmarks[i].visibility = .5
  expect(standingAnkleCenter(frame)).toBeNull()
})
it('rejects bent knees instead of interpreting a squat as a shorter body', () => {
  const frame = standing(); frame.landmarks[25].x = .85; frame.landmarks[26].x = .15
  expect(standingAnkleCenter(frame)).toBeNull()
})
it('rejects a leg pointing toward the camera', () => {
  const frame = standing(); frame.landmarks[25].z = -.4
  expect(standingAnkleCenter(frame)).toBeNull()
})
it('rejects missing, offscreen and non-finite coordinates', () => {
  for (const value of [NaN, Infinity, 1.2]) {
    const frame = standing(); frame.landmarks[27].y = value
    expect(standingAnkleCenter(frame)).toBeNull()
  }
  const frame = standing(); frame.landmarks.length = 25
  expect(standingAnkleCenter(frame)).toBeNull()
})
