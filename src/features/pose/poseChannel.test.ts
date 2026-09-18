import { expect, it, vi } from 'vitest'
import { createPoseChannel } from './poseChannel'
import { makePoseFrame } from '../../test/poseFixture'

it('replays the latest frame to a toggled overlay, unsubscribes and clears stale poses', () => {
  const channel = createPoseChannel()
  const frame = makePoseFrame()
  channel.publish(frame)
  const render = vi.fn()
  const unsubscribe = channel.subscribe(render)
  expect(render).toHaveBeenCalledExactlyOnceWith(frame)
  unsubscribe()
  channel.publish(null)
  expect(render).toHaveBeenCalledOnce()
  const reopened = vi.fn()
  channel.subscribe(reopened)
  expect(reopened).toHaveBeenCalledExactlyOnceWith(null)
})
