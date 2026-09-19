import type { PoseFrame } from '../pose/poseTypes'
import type { Garment } from '../wardrobe/garments'
import { calculateGarmentTransform } from './garmentTransform'

export function drawGarment(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: PoseFrame,
  garment: Garment,
): boolean {
  context.clearRect(0, 0, frame.width, frame.height)
  const transform = calculateGarmentTransform(
    frame,
    garment,
    image.naturalWidth,
    image.naturalHeight,
  )
  if (!transform) return false
  context.save()
  try {
    const { a, b, c, d, e, f } = transform
    context.setTransform(a, b, c, d, e, f)
    context.drawImage(image, 0, 0)
  } finally {
    context.restore()
  }
  return true
}
