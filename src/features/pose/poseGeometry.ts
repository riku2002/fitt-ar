export interface PosePoint {
  x: number
  y: number
  visibility: number
  presence?: number
}

export const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24] as const
export const BODY_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
] as const

export function isVisible(point: PosePoint | undefined): point is PosePoint {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1 &&
    point.visibility >= 0.5 &&
    (point.presence ?? 1) >= 0.5
  )
}

// Canvas uses the video's intrinsic size. CSS object-fit: contain and the
// shared parent transform handle letterboxing and mirroring for BOTH layers.
export function normalizedToPixel(
  point: PosePoint,
  width: number,
  height: number,
) {
  return { x: point.x * width, y: point.y * height }
}

export type DetectionState = 'searching' | 'partial' | 'tracking'

export function getDetectionState(points: PosePoint[]): DetectionState {
  const count = BODY_POINTS.filter((index) => isVisible(points[index])).length
  return count === BODY_POINTS.length
    ? 'tracking'
    : count > 0
      ? 'partial'
      : 'searching'
}

export function drawPose(
  context: CanvasRenderingContext2D,
  points: PosePoint[],
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height)
  const scale = Math.max(1, width / 640)
  context.lineWidth = 2.5 * scale
  context.strokeStyle = '#c5ff80'
  context.lineCap = 'round'
  for (const [from, to] of BODY_CONNECTIONS) {
    const a = points[from]
    const b = points[to]
    if (!isVisible(a) || !isVisible(b)) continue
    const start = normalizedToPixel(a, width, height)
    const end = normalizedToPixel(b, width, height)
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
  }
  for (const index of BODY_POINTS) {
    const point = points[index]
    if (!isVisible(point)) continue
    const pixel = normalizedToPixel(point, width, height)
    context.beginPath()
    context.arc(pixel.x, pixel.y, 4 * scale, 0, Math.PI * 2)
    context.fillStyle = '#f5ffe8'
    context.fill()
    context.strokeStyle = '#274b35'
    context.stroke()
  }
}
