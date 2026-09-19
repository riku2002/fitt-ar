import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPoseChannel } from '../pose/poseChannel'
import { demoGarment, garments } from '../wardrobe/garments'
import { makePoseFrame } from '../../test/poseFixture'
import { GarmentOverlay } from './GarmentOverlay'

const decode = vi.fn()
const context = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
}
beforeEach(() => {
  decode.mockReset().mockResolvedValue(undefined)
  context.drawImage.mockReset()
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 800
      naturalHeight = 800
      decode = decode
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('draws only with valid shoulders and hips and clears when tracking is lost', async () => {
  const source = createPoseChannel()
  render(<GarmentOverlay source={source} garment={demoGarment} mirrored />)
  await screen.findByText(/正面を向いて/)
  act(() => source.publish(makePoseFrame()))
  expect(context.drawImage).toHaveBeenCalledOnce()
  expect(screen.getByText(/試着中/)).toBeInTheDocument()
  const canvas = screen.getByLabelText('試着する服') as HTMLCanvasElement
  expect([canvas.width, canvas.height]).toEqual([1280, 720])
  const missingHip = makePoseFrame()
  missingHip.landmarks[23].visibility = 0.1
  act(() => source.publish(missingHip))
  expect(context.drawImage).toHaveBeenCalledOnce()
  expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 1280, 720)
  expect(screen.getByText(/正面を向いて/)).toBeInTheDocument()
})

it('does not resurrect an old pose when image decoding finishes after tracking clears', async () => {
  let resolve!: () => void
  decode.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done
    }),
  )
  const source = createPoseChannel()
  render(
    <GarmentOverlay source={source} garment={demoGarment} mirrored={false} />,
  )
  act(() => {
    source.publish(makePoseFrame())
    source.publish(null)
  })
  await act(async () => resolve())
  expect(context.drawImage).not.toHaveBeenCalled()
  expect(screen.getByText(/正面を向いて/)).toBeInTheDocument()
})

it('shows image failure and retries without interfering with other pose consumers', async () => {
  decode.mockRejectedValueOnce(new Error('404'))
  const source = createPoseChannel()
  const otherConsumer = vi.fn()
  source.subscribe(otherConsumer)
  render(<GarmentOverlay source={source} garment={demoGarment} mirrored />)
  await screen.findByText('服の画像を読み込めませんでした。')
  const frame = makePoseFrame()
  act(() => source.publish(frame))
  expect(otherConsumer).toHaveBeenLastCalledWith(frame)
  expect(context.drawImage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '服の画像を再読み込み' }))
  await screen.findByText(/試着中/)
  expect(context.drawImage).toHaveBeenCalledOnce()
})

it('isolates drawing errors and restores the canvas state', async () => {
  const source = createPoseChannel()
  render(<GarmentOverlay source={source} garment={demoGarment} mirrored />)
  await screen.findByText(/正面を向いて/)
  context.drawImage.mockImplementationOnce(() => {
    throw new Error('bad image')
  })
  act(() => source.publish(makePoseFrame()))
  expect(context.restore).toHaveBeenCalled()
  expect(
    screen.getByText('服の画像を読み込めませんでした。'),
  ).toBeInTheDocument()
})

it('unsubscribes and ignores late image loads after unmount', async () => {
  let resolve!: () => void
  decode.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done
    }),
  )
  const source = createPoseChannel()
  const view = render(
    <GarmentOverlay source={source} garment={demoGarment} mirrored />,
  )
  act(() => source.publish(makePoseFrame()))
  view.unmount()
  await act(async () => resolve())
  source.publish(makePoseFrame())
  await waitFor(() => expect(context.drawImage).not.toHaveBeenCalled())
})

it('keeps the latest garment when an older image finishes loading after a switch', async () => {
  let finishOld!: () => void
  decode.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishOld = resolve
    }),
  )
  const source = createPoseChannel()
  const view = render(
    <GarmentOverlay source={source} garment={garments[0]} mirrored />,
  )
  act(() => source.publish(makePoseFrame()))
  view.rerender(
    <GarmentOverlay source={source} garment={garments[1]} mirrored />,
  )
  await screen.findByText(/試着中/)
  expect(context.drawImage).toHaveBeenCalledOnce()
  expect(context.drawImage.mock.calls[0][0].src).toBe(garments[1].image)
  await act(async () => finishOld())
  expect(context.drawImage).toHaveBeenCalledOnce()
})
