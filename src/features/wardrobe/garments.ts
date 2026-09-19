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
  id: 'tshirt-gray',
  name: 'Tシャツ / Heather Gray',
  image: `${import.meta.env.BASE_URL}garments/tshirt-gray.png`,
  gender: 'unisex',
  category: 'tshirt',
  anchors: {
    // Normalized against the full 893 × 1024 PNG, including transparent space.
    leftShoulder: { x: 0.78, y: 0.14 },
    rightShoulder: { x: 0.22, y: 0.14 },
    leftHip: { x: 0.72, y: 0.88 },
    rightHip: { x: 0.28, y: 0.88 },
  },
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  rotationOffset: 0,
}
