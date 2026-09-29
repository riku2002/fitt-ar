import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { createPoseChannel } from '../pose/poseChannel'
import type { PoseFrame } from '../pose/poseTypes'
import { demoGarment } from '../wardrobe/garments'
import { makePoseFrame } from '../../test/poseFixture'
import { GarmentOverlay } from './GarmentOverlay'

// These are CPU scene-graph tests, not a WebGL rendering test.
// The minimal Canvas double still produces React DOM warnings for R3F tags.
vi.mock('@react-three/fiber', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    Canvas: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    useFrame: vi.fn(),
  }
})
vi.mock('@react-three/drei', async () => {
  const { Group, Mesh, BoxGeometry, MeshStandardMaterial, Object3D } = await import('three')
  const scene = new Group()
  scene.name = 'FixtureAsset'
  // A deliberately awkward imported pivot must not move the fitted shirt.
  scene.position.set(40, -25, 50)
  const mesh = new Mesh(new BoxGeometry(1.6, 1.7, 0.2), new MeshStandardMaterial())
  mesh.name = 'FixtureCloth'
  scene.add(mesh)
  const left = new Object3D(), right = new Object3D()
  left.name = 'AR_LeftShoulder'
  right.name = 'AR_RightShoulder'
  left.position.set(0.5, 0.7, 0)
  right.position.set(-0.5, 0.7, 0)
  scene.add(left, right)
  return { useGLTF: Object.assign(vi.fn(() => ({ scene })), { clear: vi.fn() }) }
})
vi.mock('three/addons/utils/SkeletonUtils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('three/addons/utils/SkeletonUtils.js')>()
  return { ...original, clone: vi.fn(original.clone) }
})

let now = 1000
let size = { width: 640, height: 480 }
let camera: THREE.PerspectiveCamera
beforeEach(() => {
  now = 1000
  size = { width: 640, height: 480 }
  camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100)
  camera.position.z = 5
  camera.updateMatrixWorld(true)
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.mocked(useFrame).mockClear()
  vi.mocked(clone).mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function draw(delta = 1 / 60) {
  const callback = vi.mocked(useFrame).mock.calls.at(-1)?.[0]
  if (!callback) throw new Error('Missing useFrame callback')
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()
  act(() => callback({ camera, size } as RootState, delta))
}
function asset(): THREE.Object3D {
  const result = vi.mocked(clone).mock.results.at(-1)
  if (!result || result.type !== 'return') throw new Error('Missing cloned asset')
  return result.value
}
function root(): THREE.Object3D {
  let node: THREE.Object3D | null = asset()
  while (node && node.name !== 'AR_GarmentRoot') node = node.parent
  if (!node) throw new Error('Missing AR_GarmentRoot')
  return node
}
function clothMaterial(): THREE.Material {
  const mesh = asset().getObjectByName('FixtureCloth')
  if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material)) throw new Error('Missing fixture material')
  return mesh.material
}
function setup() {
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garment={demoGarment} mirrored />)
  return { source, view }
}
function emit(source: ReturnType<typeof createPoseChannel>, frame: PoseFrame | null) {
  now += 80
  act(() => source.publish(frame ? { ...frame, timestamp: now } : null))
  draw()
}
function acquire(source: ReturnType<typeof createPoseChannel>, frame = makePoseFrame()) {
  emit(source, frame)
  emit(source, frame)
  emit(source, frame)
}
function shoulders(width = 1280, height = 720, ratio = 0.25): PoseFrame {
  const base = makePoseFrame()
  const landmarks = base.landmarks.map(p => ({ ...p }))
  landmarks[11].x = 0.5 + ratio / 2
  landmarks[12].x = 0.5 - ratio / 2
  return { ...base, landmarks, width, height }
}
function cssPoint(frame: PoseFrame, index: number) {
  const fit = Math.min(size.width / frame.width, size.height / frame.height)
  return new THREE.Vector2(
    (size.width - frame.width * fit) / 2 + frame.landmarks[index].x * frame.width * fit,
    (size.height - frame.height * fit) / 2 + frame.landmarks[index].y * frame.height * fit,
  )
}
function projectMarker(name: string) {
  root().updateMatrixWorld(true)
  const marker = asset().getObjectByName(name)
  if (!marker) throw new Error('Missing fixture marker')
  const p = marker.getWorldPosition(new THREE.Vector3()).project(camera)
  return new THREE.Vector2((p.x + 1) * size.width / 2, (1 - p.y) * size.height / 2)
}
function expectFit(frame: PoseFrame) {
  expect(projectMarker('AR_LeftShoulder').distanceTo(cssPoint(frame, 11))).toBeLessThan(1e-7)
  expect(projectMarker('AR_RightShoulder').distanceTo(cssPoint(frame, 12))).toBeLessThan(1e-7)
}

it('fits real fixture shoulder markers, ignoring the imported asset pivot', () => {
  const { source } = setup()
  expect(root().visible).toBe(false)
  emit(source, makePoseFrame())
  emit(source, makePoseFrame())
  expect(root().visible).toBe(false)
  emit(source, makePoseFrame())
  expect(root().visible).toBe(true)
  expectFit(makePoseFrame())
})

it.each([
  { visibility: 0.49 }, { presence: 0.49 }, { visibility: Infinity },
  { z: NaN }, { z: undefined }, { x: 1.1 },
])('freezes transforms and fades invalid shoulders: %j', override => {
  const { source } = setup()
  acquire(source)
  const position = root().position.clone(), scale = root().scale.clone()
  const opacity = clothMaterial().opacity
  const invalid = makePoseFrame()
  Object.assign(invalid.landmarks[11], override)
  emit(source, invalid)
  expect(root().position.equals(position)).toBe(true)
  expect(root().scale.equals(scale)).toBe(true)
  expect(clothMaterial().opacity).toBeGreaterThan(0)
  expect(clothMaterial().opacity).toBeLessThan(opacity)
  draw(0.5)
  expect(root().visible).toBe(false)
})

it('requires recovery confidence after a low-confidence observation', () => {
  const { source } = setup()
  acquire(source)
  const missing = makePoseFrame()
  missing.landmarks[11].visibility = 0.4
  emit(source, missing)
  draw(0.5)
  const borderline = makePoseFrame()
  borderline.landmarks[11].visibility = 0.6
  acquire(source, borderline)
  expect(root().visible).toBe(false)
  acquire(source)
  expect(root().visible).toBe(true)
})

it('fades side-on and back-facing poses without reporting a model error', () => {
  const { source } = setup()
  acquire(source)
  const sideways = makePoseFrame()
  sideways.landmarks[11].z = 1
  emit(source, sideways)
  draw(0.5)
  expect(root().visible).toBe(false)
  acquire(source)
  const back = makePoseFrame()
  for (const [l, r] of [[11, 12], [23, 24]]) {
    const lx = back.landmarks[l].x
    back.landmarks[l].x = back.landmarks[r].x
    back.landmarks[r].x = lx
  }
  emit(source, back)
  draw(0.5)
  expect(root().visible).toBe(false)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('fits both projected anchors with off-center yaw and roll', () => {
  const { source } = setup()
  const tilted = makePoseFrame()
  tilted.landmarks[11].x += 0.12
  tilted.landmarks[12].x += 0.12
  tilted.landmarks[11].y = 0.31
  tilted.landmarks[11].z = -0.1
  tilted.landmarks[12].z = 0.1
  acquire(source, tilted)
  expect(root().visible).toBe(true)
  expectFit(tilted)
})

it('fades stale data and does not mirror geometry twice', () => {
  const { source, view } = setup()
  acquire(source)
  const position = root().position.clone()
  view.rerender(<GarmentOverlay source={source} garment={demoGarment} mirrored={false} />)
  draw()
  expect(root().position.equals(position)).toBe(true)
  now += 451
  act(() => vi.advanceTimersByTime(451))
  draw(0.5)
  expect(root().visible).toBe(false)
})

it('increases projected garment size linearly with front-facing shoulder width', () => {
  const far = setup()
  acquire(far.source, shoulders(1280, 720, 0.25))
  const farScale = root().scale.x
  expectFit(shoulders(1280, 720, 0.25))
  far.view.unmount()
  const near = setup()
  acquire(near.source, shoulders(1280, 720, 0.4))
  expect(root().scale.x / farScale).toBeCloseTo(1.6, 8)
  expectFit(shoulders(1280, 720, 0.4))
})

it('preserves the pixel fit for portrait/landscape videos and canvases', () => {
  for (const canvas of [{ width: 640, height: 480 }, { width: 480, height: 800 }]) {
    size = canvas
    for (const [width, height] of [[1280, 720], [720, 1280]]) {
      const fixture = setup()
      const frame = shoulders(width, height)
      acquire(fixture.source, frame)
      expect(root().visible).toBe(true)
      expectFit(frame)
      fixture.view.unmount()
    }
  }
})

it('lerps scale using alpha rather than snapping on every observation', () => {
  const { source } = setup()
  acquire(source, shoulders())
  const initial = root().scale.x
  emit(source, shoulders(1280, 720, 0.5))
  const first = root().scale.x
  const alpha = 1 - Math.exp(-14 / 60)
  expect(first).toBeCloseTo(initial + initial * alpha, 8)
  emit(source, shoulders(1280, 720, 0.5))
  expect(root().scale.x).toBeGreaterThan(first)
  expect(root().scale.x).toBeLessThan(2 * initial)
})
