/** A MediaPipe landmark in the original, unmirrored video coordinates. */
export interface PosePoint {
  /** Normalized by the input video width. */
  x: number
  /** Normalized by the input video height. */
  y: number
  /**
   * Relative depth, not meters and not restricted to [0, 1].
   * Smaller values are closer to the camera; its scale is approximately x's.
   * Missing depth must not be silently replaced with zero.
   */
  z: number
  /** Per-landmark visibility in [0, 1]. */
  visibility: number
  /** Some runtime versions do not expose per-landmark presence. */
  presence?: number
}

/** The 2D skeleton and gesture helpers do not require depth. */
export type PosePoint2D = Pick<
  PosePoint,
  'x' | 'y' | 'visibility' | 'presence'
>

/** One inference, shared without a React render for every landmark update. */
export interface PoseFrame {
  readonly landmarks: readonly PosePoint[]
  /** Intrinsic video dimensions, not CSS dimensions. */
  readonly width: number
  readonly height: number
  /** rAF/performance.now() time origin, in milliseconds. */
  readonly timestamp: number
  readonly inferenceMs?: number
  readonly backend?: 'CPU' | 'GPU'
}

export interface PoseSource {
  subscribe(listener: (frame: PoseFrame | null) => void): () => void
}
