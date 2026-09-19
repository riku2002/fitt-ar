import { act, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeSwipeFrame } from '../../test/swipeFixture'
import { createPoseChannel } from './poseChannel'
import { PoseDiagnostics } from './PoseDiagnostics'

it('reports inference FPS separately from processing time, and clears stalled data', () => {
  const source = createPoseChannel()
  render(<PoseDiagnostics source={source} mirrored />)
  act(() => {
    for (let i = 0; i <= 5; i++)
      source.publish({
        ...makeSwipeFrame(i * 100, 0),
        inferenceMs: 12,
        backend: 'GPU',
      })
  })
  expect(screen.getByText('姿勢推定: 10.0 FPS（目標 30）')).toBeInTheDocument()
  expect(screen.getByText('推定処理: 12.0 ms / GPU')).toBeInTheDocument()
  act(() => source.publish(null))
  expect(screen.getByText('姿勢推定: — FPS（目標 30）')).toBeInTheDocument()
  act(() =>
    source.publish({
      ...makeSwipeFrame(2000, 0),
      inferenceMs: 12,
      backend: 'CPU',
    }),
  )
  expect(screen.getByText('姿勢推定: — FPS（目標 30）')).toBeInTheDocument()
})

it('makes low inference rate actionable and unsubscribes on unmount', () => {
  const source = createPoseChannel()
  const view = render(<PoseDiagnostics source={source} mirrored={false} />)
  act(() => {
    for (let i = 0; i <= 4; i++) source.publish(makeSwipeFrame(i * 200, 0))
  })
  expect(screen.getByText('姿勢推定: 5.0 FPS（目標 30）')).toBeInTheDocument()
  expect(screen.getByText(/手を少しゆっくり/)).toBeInTheDocument()
  view.unmount()
  source.publish(makeSwipeFrame(1000, 0))
})
