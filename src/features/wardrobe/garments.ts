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

/**
 * UI / outfit slots are intentionally only two groups.
 * A onepiece is browsed and selected from the tops slot, but remains
 * category='onepiece' so 3D fitting/occlusion can keep its full-body behavior.
 */
export type GarmentSlot = 'tops' | 'bottoms'

export const garmentSlotLabels: Record<GarmentSlot, string> = {
  tops: 'トップス',
  bottoms: 'ボトムス',
}

export function getGarmentSlot(category: GarmentCategory): GarmentSlot {
  return category === 'bottoms' ? 'bottoms' : 'tops'
}

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

  /** Visual adjustments AFTER anchor normalization, BEFORE body tracking.
   * Defaults: scale/scaleX/scaleY/scaleZ=1; offsets=0.
   * These never change the anatomical tracking root or occluder placement.
   */
  scale?: number
  scaleX?: number
  scaleY?: number
  scaleZ?: number
  /** Offsets in normalized primary anchor-width units (not pixels/meters).
   * +X: wearer's left; +Y: up; +Z: garment front. Mirroring remains external.
   */
  offsetX?: number
  offsetY?: number
  offsetZ?: number

  /**
   * Outfit-layer bias, also in normalized primary anchor-width units.
   * This is separate from offsetZ so calibration and top/bottom overlap can be
   * tuned independently. Negative values move the garment farther from the
   * camera along its local back direction.
   *
   * Defaults in GarmentOverlay:
   *   tops/onepiece: 0
   *   bottoms:      -0.035
   */
  layerOffsetZ?: number

  /**
   * Deterministic draw ordering, mainly relevant while garments are fading and
   * therefore transparent. Opaque overlap is still resolved by the depth buffer.
   * Defaults: tops=20, bottoms=10, onepiece=20.
   */
  renderOrder?: number
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

// Catalog order is also the swipe order inside each slot.
// Because onepiece maps to 'tops', the default order below is:
// T-shirt 01 -> T-shirt 02 -> onepiece -> T-shirt 01 ...
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
    fit3D: {
      scaleX: 1.5,
      scaleY: 2.8,
      offsetY: 0.1,
      // Keep waist geometry slightly behind tops at the overlap boundary.
      layerOffsetZ: -0.05,
      renderOrder: 10,
    },
  },
  {
    ...legacy2D,
    id: 'skirt',
    name: 'スカート',
    image: `${base}garments/skirt_icon.png`,
    modelUrl: `${base}garments/skirt.glb`,
    gender: 'unisex',
    category: 'bottoms',
    fit3D: {
      scaleX: 1.5,
      scaleY: 2.8,
      offsetY: 0.1,
      // Keep waist geometry slightly behind tops at the overlap boundary.
      layerOffsetZ: -0.05,
      renderOrder: 10,
    },
  },
  {
    ...legacy2D,
    id: 'dress',
    name: 'ワンピース',
    image: `${base}garments/dress_icon.png`,
    modelUrl: `${base}garments/dress.glb`,
    gender: 'unisex',
    category: 'onepiece',
    fit3D: {
      scaleX: 1.5,
      scaleY: 1.8,
      offsetY: 0.1,
    },
  },
]
