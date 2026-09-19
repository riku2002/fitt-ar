import type { PoseFrame, PoseSource } from './poseTypes'

export function createPoseChannel(): PoseSource & {
  publish(frame: PoseFrame | null): void
} {
  let latest: PoseFrame | null = null
  const listeners = new Set<(frame: PoseFrame | null) => void>()
  return {
    publish(frame) {
      latest = frame
      listeners.forEach((listener) => listener(frame))
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(latest)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
