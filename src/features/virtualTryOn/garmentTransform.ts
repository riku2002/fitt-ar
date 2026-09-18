import { isVisible, normalizedToPixel } from '../pose/poseGeometry'
import type { PoseFrame } from '../pose/poseTypes'
import type { Garment, Point } from '../wardrobe/garments'

/** Canvas matrix: image pixels -> unmirrored video pixels. No CSS dimensions. */
export interface GarmentTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export function calculateGarmentTransform(
  frame: PoseFrame,
  garment: Garment,
  imageWidth: number,
  imageHeight: number,
): GarmentTransform | null {
  const { landmarks, width, height } = frame
  const dimensions = [
    width,
    height,
    imageWidth,
    imageHeight,
    garment.scaleX,
    garment.scaleY,
  ]
  if (
    !dimensions.every((value) => Number.isFinite(value) && value > 0) ||
    ![garment.offsetX, garment.offsetY, garment.rotationOffset].every(
      Number.isFinite,
    )
  )
    return null
  const leftShoulder = landmarks[11],
    rightShoulder = landmarks[12]
  const leftHip = landmarks[23],
    rightHip = landmarks[24]
  if (
    !isVisible(leftShoulder) ||
    !isVisible(rightShoulder) ||
    !isVisible(leftHip) ||
    !isVisible(rightHip)
  )
    return null
  if (
    !Object.values(garment.anchors).every(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 1 &&
        p.y >= 0 &&
        p.y <= 1,
    )
  )
    return null
  const bodyLeft = normalizedToPixel(leftShoulder, width, height)
  const bodyRight = normalizedToPixel(rightShoulder, width, height)
  const bodyOrigin = midpoint(bodyLeft, bodyRight)
  const bodyHip = midpoint(
    normalizedToPixel(leftHip, width, height),
    normalizedToPixel(rightHip, width, height),
  )
  const src = (p: Point): Point => ({
    x: p.x * imageWidth,
    y: p.y * imageHeight,
  })
  const imageLeft = src(garment.anchors.leftShoulder),
    imageRight = src(garment.anchors.rightShoulder)
  const imageOrigin = midpoint(imageLeft, imageRight)
  const imageHip = midpoint(
    src(garment.anchors.leftHip),
    src(garment.anchors.rightHip),
  )
  const bodyWidth = Math.hypot(
    bodyLeft.x - bodyRight.x,
    bodyLeft.y - bodyRight.y,
  )
  const sourceWidth = Math.hypot(
    imageLeft.x - imageRight.x,
    imageLeft.y - imageRight.y,
  )
  if (bodyWidth < 8 || sourceWidth < 1) return null
  const bx = (bodyLeft.x - bodyRight.x) / bodyWidth,
    by = (bodyLeft.y - bodyRight.y) / bodyWidth
  const sx = (imageLeft.x - imageRight.x) / sourceWidth,
    sy = (imageLeft.y - imageRight.y) / sourceWidth
  // Project the torso on the downward normal. Reject collapsed/back-facing poses.
  const bodyHeight =
    -(bodyHip.x - bodyOrigin.x) * by + (bodyHip.y - bodyOrigin.y) * bx
  const sourceHeight =
    -(imageHip.x - imageOrigin.x) * sy + (imageHip.y - imageOrigin.y) * sx
  if (bodyHeight < 8 || sourceHeight < 1) return null
  const scaleX = (bodyWidth / sourceWidth) * garment.scaleX
  const scaleY = (bodyHeight / sourceHeight) * garment.scaleY
  const angle = Math.atan2(by, bx) + garment.rotationOffset
  const cos = Math.cos(angle),
    sin = Math.sin(angle)
  const a = cos * scaleX * sx + sin * scaleY * sy
  const b = sin * scaleX * sx - cos * scaleY * sy
  const c = cos * scaleX * sy - sin * scaleY * sx
  const d = sin * scaleX * sy + cos * scaleY * sx
  return {
    a,
    b,
    c,
    d,
    e:
      bodyOrigin.x +
      cos * garment.offsetX * bodyWidth -
      sin * garment.offsetY * bodyHeight -
      a * imageOrigin.x -
      c * imageOrigin.y,
    f:
      bodyOrigin.y +
      sin * garment.offsetX * bodyWidth +
      cos * garment.offsetY * bodyHeight -
      b * imageOrigin.x -
      d * imageOrigin.y,
  }
}
