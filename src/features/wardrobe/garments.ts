export interface Point {
  x: number
  y: number
}

export interface Garment {
  id: string
  name: string
  image: string
  gender: 'men' | 'women' | 'unisex'
  category: 'tshirt' | 'shirt' | 'jacket'
  /** Anatomical left/right of the wearer; front-view left is image-right. */
  anchors: {
    leftShoulder: Point
    rightShoulder: Point
    leftHip: Point
    rightHip: Point
  }
  scaleX: number
  scaleY: number
  /** Offsets in shoulder-width / torso-height units along the body axes. */
  offsetX: number
  offsetY: number
  rotationOffset: number // radians
}

export const demoGarment: Garment = {
  id: 'demo-tshirt-sage',
  name: 'デモTシャツ / Sage',
  image: `${import.meta.env.BASE_URL}garments/demo-tshirt-sage.png`,
  gender: 'unisex',
  category: 'tshirt',
  anchors: {
    leftShoulder: { x: 0.7, y: 0.2 },
    rightShoulder: { x: 0.3, y: 0.2 },
    leftHip: { x: 0.7, y: 0.8 },
    rightHip: { x: 0.3, y: 0.8 },
  },
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  rotationOffset: 0,
}
