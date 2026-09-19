import { beforeEach, expect, it, vi } from 'vitest'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { createPoseLandmarker } from './poseLandmarker'

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  PoseLandmarker: { createFromOptions: vi.fn() },
}))
const model = {
  detectForVideo: vi.fn(() => ({ landmarks: [] })),
  close: vi.fn(),
}
beforeEach(() => {
  vi.mocked(PoseLandmarker.createFromOptions).mockReset()
})

it('uses GPU, preserves the video timestamp and releases the underlying model', async () => {
  vi.mocked(PoseLandmarker.createFromOptions).mockResolvedValue(
    model as unknown as PoseLandmarker,
  )
  const detector = await createPoseLandmarker()
  expect(FilesetResolver.forVisionTasks).toHaveBeenCalledWith('/mediapipe/wasm')
  expect(PoseLandmarker.createFromOptions).toHaveBeenCalledOnce()
  expect(PoseLandmarker.createFromOptions).toHaveBeenLastCalledWith(
    {},
    expect.objectContaining({
      baseOptions: {
        modelAssetPath: '/models/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
    }),
  )
  const video = document.createElement('video')
  detector.detectForVideo(video, 123)
  expect(model.detectForVideo).toHaveBeenCalledWith(video, 123)
  expect(detector.backend).toBe('GPU')
  detector.close()
  expect(model.close).toHaveBeenCalledOnce()
})

it('falls back to CPU if GPU initialization fails', async () => {
  vi.mocked(PoseLandmarker.createFromOptions)
    .mockRejectedValueOnce(new Error('WebGL unavailable'))
    .mockResolvedValueOnce(model as unknown as PoseLandmarker)
  const detector = await createPoseLandmarker()
  expect(detector.backend).toBe('CPU')
  expect(PoseLandmarker.createFromOptions).toHaveBeenCalledTimes(2)
  expect(PoseLandmarker.createFromOptions).toHaveBeenLastCalledWith(
    {},
    expect.objectContaining({
      baseOptions: {
        modelAssetPath: '/models/pose_landmarker_lite.task',
        delegate: 'CPU',
      },
    }),
  )
  detector.close()
})

it('propagates an initialization error if neither backend can start', async () => {
  vi.mocked(PoseLandmarker.createFromOptions).mockRejectedValue(
    new Error('missing model'),
  )
  await expect(createPoseLandmarker()).rejects.toThrow('missing model')
  expect(PoseLandmarker.createFromOptions).toHaveBeenCalledTimes(2)
})
