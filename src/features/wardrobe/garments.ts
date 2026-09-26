/** Legacy PNG coordinates; independent of GLB anchors. */
export interface Point {
  x: number
  y: number
}

export type GarmentGender = 'men' | 'women' | 'unisex'
export type GarmentFilter = 'all' | Exclude<GarmentGender, 'unisex'>
export type GarmentCategory =
  | 'tshirt'
  | 'shirt'
  | 'jacket'
  | 'bottoms'
  | 'onepiece'
export type OcclusionSegment = 'upper' | 'forearm' | 'thigh' | 'shin'

export interface Garment3DFit {
  /** Applied before measuring markers/bounds; Euler XYZ, radians. */
  rotation?: [number, number, number]
  /** Approximate GLB fallback only. Prefer actual AR_* marker nodes. */
  anchorSpan?: number
  anchorHeight?: number
  anchorDepth?: number
  /** Onepiece only; requires both GLB hip markers. Otherwise uniform fit. */
  fitTorsoLength?: boolean
}

export interface OcclusionOverride {
  enabled?: boolean
  radiusRatio?: number
  startFraction?: number
  endFraction?: number
}

export const garmentGenderLabels: Record<GarmentGender, string> = {
  men: '男性向け',
  women: '女性向け',
  unisex: '男女共用',
}

// The latest repository lists tshirt1.glb, not the old tshirt.glb.
export const DEFAULT_GARMENT_MODEL_URL =
  `${import.meta.env.BASE_URL}garments/tshirt1.glb`

export interface Garment {
  id: string
  name: string
  image: string
  modelUrl?: string
  gender: GarmentGender
  category: GarmentCategory
  fit3D?: Garment3DFit
  occlusion3D?: Partial<Record<OcclusionSegment, OcclusionOverride>>
  /** Legacy 2D renderer configuration. NOT used to fit the GLB. */
  anchors: {
    leftShoulder: Point
    rightShoulder: Point
    leftHip: Point
    rightHip: Point
  }
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
  rotationOffset: number
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

const base = import.meta.env.BASE_URL

// Retained for compatibility with the legacy PNG geometry tests/tools.
// These are not calibrated 2D anchors for the newly added icons.
const legacy2D = {
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
}

export const demoGarment: Garment = {
  ...legacy2D,
  id: 'tshirt-1',
  name: 'Tシャツ / 01',
  image: `${base}garments/tshirt1_icon.png`,
  modelUrl: DEFAULT_GARMENT_MODEL_URL,
  gender: 'unisex',
  category: 'tshirt',
}

// Gender labels are demo metadata, not inferred from the model geometry.
// Catalog order is shared by swipes, buttons and thumbnails.
export const garments: readonly Garment[] = [
  demoGarment,
  {
    ...legacy2D,
    id: 'tshirt-2',
    name: 'Tシャツ / 02',
    image: `${base}garments/tshirt2_icon.png`,
    modelUrl: `${base}garments/tshirt2.glb`,
    gender: 'unisex',
    category: 'tshirt',
  },
  {
    ...legacy2D,
    id: 'pants',
    name: 'ズボン',
    image: `${base}garments/pants_icon.png`,
    modelUrl: `${base}garments/pants.glb`,
    gender: 'unisex',
    category: 'bottoms',
  },
  {
    ...legacy2D,
    id: 'skirt',
    name: 'スカート',
    image: `${base}garments/skirt_icon.png`,
    modelUrl: `${base}garments/skirt.glb`,
    gender: 'unisex',
    category: 'bottoms',
  },
  {
    ...legacy2D,
    id: 'dress',
    name: 'ワンピース',
    image: `${base}garments/dress_icon.png`,
    modelUrl: `${base}garments/dress.glb`,
    gender: 'unisex',
    category: 'onepiece',
    fit3D: { fitTorsoLength: true },
  },
]
