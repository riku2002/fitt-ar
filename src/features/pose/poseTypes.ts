import type { PosePoint } from './poseGeometry'

/** One inference in unmirrored video coordinates, shared without React renders. */
export interface PoseFrame {
  readonly landmarks: readonly PosePoint[]
  readonly width: number
  readonly height: number
  readonly timestamp: number
}

export interface PoseSource {
  subscribe(listener: (frame: PoseFrame | null) => void): () => void
}
