import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createPoseChannel } from '../pose/poseChannel'
import type { PoseFrame, PosePoint } from '../pose/poseTypes'
import { demoGarment } from '../wardrobe/garments'
import type { Garment, GarmentCategory } from '../wardrobe/garments'
import { GarmentOverlay } from './GarmentOverlay'

const harness = vi.hoisted(() => ({ load: vi.fn(), clear: vi.fn() }))
vi.mock('@react-three/fiber', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    Canvas: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    useFrame: vi.fn(),
  }
})
vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(harness.load, { clear: harness.clear }) }))
vi.mock('three/addons/utils/SkeletonUtils.js', async importOriginal => {
  const original = await importOriginal<typeof import('three/addons/utils/SkeletonUtils.js')>()
  return { ...original, clone: vi.fn(original.clone) }
})

let now = 1000
let size = { width: 640, height: 480 }
let camera: THREE.PerspectiveCamera
let masks: THREE.Group | null = null
const geometries: THREE.BufferGeometry[] = []
const materials: THREE.Material[] = []
const inheritedAdd = THREE.Object3D.prototype.add

function fixture(category: GarmentCategory, markers = true) {
  const scene = new THREE.Group()
  scene.position.set(40, -25, 50)
  const bottom = category === 'bottoms', dress = category === 'onepiece'
  const geometry = new THREE.BoxGeometry(1.6, dress ? 3.4 : 1.7, 0.2)
  const material = new THREE.MeshStandardMaterial()
  geometries.push(geometry); materials.push(material)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'CategoryCloth'
  scene.add(mesh)
  if (markers) {
    for (const [name, x, y] of [
      ['AR_LeftShoulder', 0.5, 0.7], ['AR_RightShoulder', -0.5, 0.7],
      ['AR_LeftHip', 0.5, bottom ? 0.7 : -0.8], ['AR_RightHip', -0.5, bottom ? 0.7 : -0.8],
    ] as const) {
      const marker = new THREE.Object3D()
      marker.name = name; marker.position.set(x, y, 0); scene.add(marker)
    }
  }
  return scene
}
function frame(): PoseFrame {
  const landmarks: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
  for (const [index, x, y] of [
    [11, 0.65, 0.20], [12, 0.35, 0.20],
    [13, 0.73, 0.32], [14, 0.27, 0.32],
    [15, 0.68, 0.45], [16, 0.32, 0.45],
    [23, 0.61, 0.53], [24, 0.39, 0.53],
    [25, 0.61, 0.72], [26, 0.39, 0.72],
    [27, 0.61, 0.93], [28, 0.39, 0.93],
  ]) landmarks[index] = { x, y, z: 0, visibility: 1 }
  return { width: 720, height: 1280, timestamp: now, landmarks }
}
function asset() {
  const result = vi.mocked(clone).mock.results.at(-1)
  if (!result || result.type !== 'return') throw new Error('No cloned fixture')
  return result.value as THREE.Object3D
}
function root() {
  let object: THREE.Object3D | null = asset()
  while (object && object.name !== 'AR_GarmentRoot') object = object.parent
  if (!object) throw new Error('Missing garment root')
  return object
}
function maskRoot(): THREE.Group {
  if (!masks) throw new Error('Missing occluder group')
  return masks
}
function draw(dt = 1 / 60) {
  const callback = vi.mocked(useFrame).mock.calls.at(-1)?.[0]
  if (!callback) throw new Error('No frame callback')
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()
  act(() => callback({ camera, size } as RootState, dt))
}
function emit(source: ReturnType<typeof createPoseChannel>, pose: PoseFrame | null) {
  now += 80
  act(() => source.publish(pose ? { ...pose, timestamp: now } : null))
  draw()
}
function acquire(source: ReturnType<typeof createPoseChannel>, pose = frame()) {
  for (let i = 0; i < 6; i++) emit(source, pose)
}
function setup(category: GarmentCategory, markers = true, extra: Partial<Garment> = {}) {
  const scene = fixture(category, markers)
  harness.load.mockReturnValue({ scene })
  const source = createPoseChannel()
  const garment: Garment = {
    ...demoGarment,
    id: category,
    category,
    ...extra,
    // These category tests validate the body-fit projection itself. The
    // production bottoms layer intentionally adds a small negative Z offset
    // so tops render in front at the waist. Neutralize only that visual
    // layering here; GarmentOverlay.outfit.test.tsx covers the real Z-order.
    fit3D: {
      ...demoGarment.fit3D,
      layerOffsetZ: 0,
      ...extra.fit3D,
    },
  }
  const view = render(<GarmentOverlay source={source} garment={garment} mirrored />)
  return { source, view, garment }
}
function expectMarkerFits(pose: PoseFrame, name: string, index: number) {
  root().updateMatrixWorld(true)
  const marker = asset().getObjectByName(name)
  if (!marker) throw new Error('Missing marker')
  const projected = marker.getWorldPosition(new THREE.Vector3()).project(camera)
  const fit = Math.min(size.width / pose.width, size.height / pose.height)
  const expected = new THREE.Vector2(
    (size.width - pose.width * fit) / 2 + pose.landmarks[index].x * pose.width * fit,
    (size.height - pose.height * fit) / 2 + pose.landmarks[index].y * pose.height * fit,
  )
  expect(new THREE.Vector2((projected.x + 1) * size.width / 2,
    (1 - projected.y) * size.height / 2).distanceTo(expected)).toBeLessThan(1e-7)
}

function rememberOccluderRoot(group: THREE.Group) {
  masks = group
}

beforeEach(() => {
  now = 1000; size = { width: 640, height: 480 }; masks = null
  camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100)
  camera.position.z = 5; camera.updateMatrixWorld(true)
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.mocked(useFrame).mockClear(); vi.mocked(clone).mockClear()
  harness.load.mockReset(); harness.clear.mockReset()
  // Observe CPU scene construction, not private React DOM internals.
  vi.spyOn(THREE.Group.prototype, 'add').mockImplementation(function (
    this: THREE.Group, ...objects: THREE.Object3D[]
  ) {
    if (this.name === 'AR_Occluders') rememberOccluderRoot(this)
    inheritedAdd.apply(this, objects)
    return this
  })
})
afterEach(() => {
  cleanup()
  geometries.splice(0).forEach(geometry => geometry.dispose())
  materials.splice(0).forEach(material => material.dispose())
  vi.restoreAllMocks(); vi.useRealTimers()
})

it.each(['tshirt', 'bottoms', 'onepiece'] as const)(
  'fits the category-specific anchors through landscape and portrait contain: %s', category => {
    for (const canvas of [{ width: 640, height: 480 }, { width: 480, height: 800 }]) {
      size = canvas
      for (const dimensions of [[720, 1280], [1280, 720]]) {
        const state = setup(category)
        const pose = { ...frame(), width: dimensions[0], height: dimensions[1] }
        acquire(state.source, pose)
        expect(root().visible).toBe(true)
        const hip = category === 'bottoms'
        expectMarkerFits(pose, hip ? 'AR_LeftHip' : 'AR_LeftShoulder', hip ? 23 : 11)
        expectMarkerFits(pose, hip ? 'AR_RightHip' : 'AR_RightShoulder', hip ? 24 : 12)
        state.view.unmount()
      }
    }
  },
)
it('fits bottoms with missing shoulders instead of reusing a shoulder pose', () => {
  const { source } = setup('bottoms')
  const pose = frame()
  pose.landmarks[11].visibility = 0; pose.landmarks[12].visibility = 0
  acquire(source, pose)
  expect(root().visible).toBe(true)
  expectMarkerFits(pose, 'AR_LeftHip', 23)
  expectMarkerFits(pose, 'AR_RightHip', 24)
})
it('freezes and fades bottoms when hips disappear even though shoulders remain valid', () => {
  const { source } = setup('bottoms')
  acquire(source)
  const position = root().position.clone()
  const missing = frame(); missing.landmarks[23].visibility = 0
  emit(source, missing)
  expect(root().position.equals(position)).toBe(true)
  draw(0.5)
  expect(root().visible).toBe(false)
})
it('retains uniform dress scale when GLB hip markers are absent', () => {
  const { source } = setup('onepiece', false)
  acquire(source)
  expect(root().visible).toBe(true)
  expect(root().scale.x).toBeCloseTo(root().scale.y, 10)
})
it('uses real dress hip markers for bounded length adjustment without moving shoulder anchors', () => {
  const { source } = setup('onepiece')
  const pose = frame()
  acquire(source, pose)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1.25, 8)
  expectMarkerFits(pose, 'AR_LeftShoulder', 11)
  expectMarkerFits(pose, 'AR_RightShoulder', 12)
})
it('allows a dress to explicitly retain uniform authored proportions', () => {
  const { source } = setup('onepiece', true, { fit3D: { fitTorsoLength: false } })
  acquire(source)
  expect(root().scale.y).toBeCloseTo(root().scale.x, 8)
})
it('uses hip fallback calibration without requiring marker nodes', () => {
  const { source } = setup('bottoms', false)
  acquire(source)
  expect(root().visible).toBe(true)
  expect(Number.isFinite(root().scale.x)).toBe(true)
})
it('lerps a changed pelvis width instead of snapping', () => {
  const { source } = setup('bottoms')
  acquire(source)
  const initial = root().scale.x
  const closer = frame()
  closer.landmarks[23].x = 0.72; closer.landmarks[24].x = 0.28
  emit(source, closer)
  expect(root().scale.x).toBeCloseTo(initial * (2 - Math.exp(-14 / 60)), 8)
})
it.each([
  ['tshirt', ['upper', 'forearm']],
  ['bottoms', ['thigh', 'shin']],
  ['onepiece', ['upper', 'forearm', 'thigh', 'shin']],
] as const)('constructs only the correct occluder types for %s', (category, kinds) => {
  setup(category)
  expect(maskRoot().children.map(object => object.name).sort()).toEqual(
    kinds.flatMap(kind => [`AR_left_${kind}`, `AR_right_${kind}`]).sort(),
  )
  let depth = 0, shadow = 0
  maskRoot().traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    if (object.material instanceof THREE.ShadowMaterial) {
      shadow += 1
      expect(object.receiveShadow).toBe(true)
    } else {
      depth += 1
      expect(object.material.colorWrite).toBe(false)
      expect(object.material.depthWrite).toBe(true)
    }
  })
  expect(depth).toBe(kinds.length * 6)
  expect(shadow).toBe(depth)
})
it('updates leg masks and disables only the unreliable segment', () => {
  const { source } = setup('bottoms')
  const pose = frame()
  pose.landmarks[25].z = -0.055; pose.landmarks[27].z = -0.077
  acquire(source, pose)
  const thigh = maskRoot().getObjectByName('AR_left_thigh')!
  const shin = maskRoot().getObjectByName('AR_left_shin')!
  expect(thigh.visible).toBe(true); expect(shin.visible).toBe(true)
  const badAnkle = { ...pose, landmarks: pose.landmarks.map(p => ({ ...p })) }
  badAnkle.landmarks[27].visibility = 0
  emit(source, badAnkle)
  expect(thigh.visible).toBe(true); expect(shin.visible).toBe(false)
  expect(root().visible).toBe(true)
})
it('permits per-garment covered-segment masks to be disabled', () => {
  setup('bottoms', true, { occlusion3D: { thigh: { enabled: false } } })
  expect(maskRoot().children.map(object => object.name).sort()).toEqual(['AR_left_shin', 'AR_right_shin'])
})
it('clears old masks on category switch without replacing the pose subscription', () => {
  const initial = setup('bottoms')
  const subscribe = vi.spyOn(initial.source, 'subscribe')
  const old = maskRoot()
  acquire(initial.source)
  const newGarment: Garment = { ...initial.garment, category: 'tshirt' }
  harness.load.mockReturnValue({ scene: fixture('tshirt') })
  initial.view.rerender(<GarmentOverlay source={initial.source} garment={newGarment} mirrored />)
  expect(subscribe).not.toHaveBeenCalled()
  expect(old.visible).toBe(false)
  expect(maskRoot()).not.toBe(old)
  expect(maskRoot().children.some(object => object.name.includes('thigh'))).toBe(false)
  expect(screen.getByLabelText('試着する服')).toHaveAttribute('data-fit-axis', 'shoulders')
})

function proportionalLegs(ankleY: number) {
  const pose = frame()
  for (const [hip, knee, ankle] of [[23,25,27],[24,26,28]]) {
    pose.landmarks[knee].y = (pose.landmarks[hip].y + ankleY) / 2
    pose.landmarks[ankle].y = ankleY
  }
  return pose
}
it('adapts hem length to body proportions without moving the hip anchors', () => {
  const { source } = setup('bottoms', true, { fit3D: { legLengthRatio: 1 } })
  const short = proportionalLegs(.68)
  acquire(source, short); draw(.5)
  const shortLength = root().scale.y / root().scale.x
  expect(shortLength).toBeLessThan(1)
  expectMarkerFits(short, 'AR_LeftHip', 23)
  expectMarkerFits(short, 'AR_RightHip', 24)
  const long = proportionalLegs(.78)
  acquire(source, long); draw(.5)
  expect(root().scale.y / root().scale.x).toBeGreaterThan(shortLength)
  expectMarkerFits(long, 'AR_LeftHip', 23)
  expectMarkerFits(long, 'AR_RightHip', 24)
})
it('bounds extreme length, holds a brief occlusion and returns to neutral after prolonged loss', () => {
  const { source } = setup('bottoms', true, { fit3D: { legLengthRatio: 1 } })
  acquire(source); draw(.5)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1.35, 2)
  const missing = frame(); missing.landmarks[27].visibility = 0
  emit(source, missing); draw(.1)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1.35, 2)
  for (let i = 0; i < 16; i++) emit(source, missing)
  draw(.5)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1, 2)
})
it('does not recalibrate from bent legs or a single fresh frame', () => {
  const { source } = setup('bottoms', true, { fit3D: { legLengthRatio: 1 } })
  const bent = frame(); bent.landmarks[25].x = .9
  acquire(source, bent); draw(.5)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1, 8)
  emit(source, frame()); draw(.2)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1, 8)
})
it('starts a newly acquired person with neutral length when their ankles are not visible', () => {
  const { source } = setup('bottoms', true, { fit3D: { legLengthRatio: 1 } })
  acquire(source); draw(.5)
  emit(source, null); draw(.5)
  const missing = frame(); missing.landmarks[27].visibility = 0
  acquire(source, missing)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1, 8)
})
it('keeps the same body proportion when camera distance and viewport size change', () => {
  const { source } = setup('bottoms', true, { fit3D: { legLengthRatio: 1 } })
  const pose = proportionalLegs(.70)
  acquire(source, pose); draw(.5)
  const ratio = root().scale.y / root().scale.x
  const farther = { ...pose, landmarks: pose.landmarks.map(p => ({ ...p,
    x: .5 + (p.x - .5) * .8, y: .5 + (p.y - .5) * .8, z: p.z * .8,
  })) }
  size = { width: 480, height: 800 }
  // Let the existing position/scale smoothing converge before exact anchor checks.
  acquire(source, farther); draw(2)
  expect(root().scale.y / root().scale.x).toBeCloseTo(ratio, 2)
  expectMarkerFits(farther, 'AR_LeftHip', 23)
})


it('fits calibrated markerless dresses to different torso lengths at the same shoulder width', () => {
  const { source } = setup('onepiece', false, {
    fit3D: { anchorSpan: 0.6, anchorHeight: 0.93, torsoAnchorHeight: 0.42 },
  })
  const short = frame()
  short.landmarks[23].y = short.landmarks[24].y = 0.45
  acquire(source, short); draw(2)
  const width = root().scale.x
  const shortLength = root().scale.y
  const origin = root().position.clone()
  const long = frame()
  long.landmarks[23].y = long.landmarks[24].y = 0.56
  acquire(source, long); draw(2)
  expect(root().scale.x).toBeCloseTo(width, 8)
  expect(root().scale.y / shortLength).toBeCloseTo(0.36 / 0.25, 8)
  expect(root().position.distanceTo(origin)).toBeLessThan(1e-8)
})

it('returns calibrated torso fit to neutral after prolonged hip loss', () => {
  const { source } = setup('onepiece', false, {
    fit3D: { torsoAnchorHeight: 0.42 },
  })
  acquire(source); draw(2)
  expect(root().scale.y / root().scale.x).not.toBeCloseTo(1, 3)
  const hidden = frame()
  hidden.landmarks[23].visibility = hidden.landmarks[24].visibility = 0
  const held = root().scale.y / root().scale.x
  emit(source, hidden); draw(2)
  expect(root().scale.y / root().scale.x).toBeCloseTo(held, 8)
  for (let i = 0; i < 15; i++) emit(source, hidden)
  draw(2)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1, 8)
})

it('prefers authored hip markers over a fallback torso calibration', () => {
  const { source } = setup('onepiece', true, { fit3D: { torsoAnchorHeight: 0.1 } })
  acquire(source)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1.25, 8)
})

it('supports opt-in torso fitting for tops while keeping shoulder markers aligned', () => {
  const { source } = setup('tshirt', true, { fit3D: { fitTorsoLength: true } })
  const pose = frame()
  acquire(source, pose)
  expect(root().scale.y / root().scale.x).toBeCloseTo(1.25, 8)
  expectMarkerFits(pose, 'AR_LeftShoulder', 11)
  expectMarkerFits(pose, 'AR_RightShoulder', 12)
})
