export interface Point {
  x: number
  y: number
}

export type GarmentGender = 'men' | 'women' | 'unisex'
export type GarmentFilter = 'all' | Exclude<GarmentGender, 'unisex'>

export const garmentGenderLabels: Record<GarmentGender, string> = {
  men: '男性向け',
  women: '女性向け',
  unisex: '男女共用',
}

export interface Garment {
  id: string
  name: string
  image: string
  gender: GarmentGender
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

export function filterGarments(
  catalog: readonly Garment[],
  filter: GarmentFilter,
): readonly Garment[] {
  return filter === 'all'
    ? catalog
    : catalog.filter(
        (garment) => garment.gender === filter || garment.gender === 'unisex',
      )
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

// Ordering is shared by wrist swipes, buttons and thumbnails. Keep demoGarment
// first so the preparation tool can still replace it without changing imports.
// Gender categories below are demo assignments, not manufacturer classifications.
export const garments: readonly Garment[] = [
  demoGarment,
  {
    id: 'tshirt-mint',
    name: 'Tシャツ / Mint Green',
    image: `${import.meta.env.BASE_URL}garments/tshirt-mint.png`,
    gender: 'men',
    category: 'tshirt',
    anchors: {
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
  },
  {
    id: 'tshirt-red',
    name: 'Tシャツ / Red',
    image: `${import.meta.env.BASE_URL}garments/tshirt-red.png`,
    gender: 'women',
    category: 'tshirt',
    anchors: {
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
  },
]
