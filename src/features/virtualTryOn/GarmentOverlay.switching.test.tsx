import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GarmentOverlay } from './GarmentOverlay'
import { CameraView } from '../camera/CameraView'
import { startPoseSession } from '../pose/poseSession'
import { createPoseChannel } from '../pose/poseChannel'
import { DEFAULT_GARMENT_MODEL_URL, demoGarment, garments } from '../wardrobe/garments'
import type { Garment } from '../wardrobe/garments'
import { makeSwipeFrame } from '../../test/swipeFixture'

const harness = vi.hoisted(() => ({
  load: vi.fn(),
  clear: vi.fn(),
  canvasMount: vi.fn(),
  canvasUnmount: vi.fn(),
}))

// Test the actual selection/loading/lifecycle logic without a WebGL renderer.
vi.mock('@react-three/fiber', async () => {
  const { createElement, Fragment, useEffect } = await import('react')
  return {
    Canvas: function CanvasDouble({ children }: { children: ReactNode }) {
      useEffect(() => {
        harness.canvasMount()
        return () => { harness.canvasUnmount() }
      }, [])
      return createElement(Fragment, null, children)
    },
    useFrame: vi.fn(),
  }
})
vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(harness.load, { clear: harness.clear }),
}))
vi.mock('three/addons/utils/SkeletonUtils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('three/addons/utils/SkeletonUtils.js')>()
  return { ...original, clone: vi.fn(original.clone) }
})
vi.mock('../pose/poseSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pose/poseSession')>()),
  startPoseSession: vi.fn(() => vi.fn()),
}))
vi.mock('../wardrobe/garments', async (importOriginal) => {
  const original = await importOriginal<typeof import('../wardrobe/garments')>()

  return {
    ...original,
    // Keep named exports explicit so GarmentOverlay can import the default GLB
    // constant from this mocked module without Vitest reporting a missing export.
    DEFAULT_GARMENT_MODEL_URL: original.DEFAULT_GARMENT_MODEL_URL,
    demoGarment: original.demoGarment,
    filterGarments: original.filterGarments,
    garmentGenderLabels: original.garmentGenderLabels,

    // Distinct, mocked GLB assets; no claim that these files exist on disk.
    garments: original.garments.map((garment) => ({
      ...garment,
      modelUrl: `/switch-fixture/${garment.id}.glb`,
    })),
  }
})

type Resource =
  | { kind: 'ready'; scene: THREE.Group }
  | { kind: 'pending'; promise: Promise<void> }
  | { kind: 'error'; error: Error }

const resources = new Map<string, Resource>()
const fixtures: THREE.Mesh[] = []
let now = 1000

function ready(url: string) {
  const scene = new THREE.Group()
  scene.name = url
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.7, 0.2),
    new THREE.MeshStandardMaterial(),
  )
  mesh.name = 'SwitchFixtureCloth'
  fixtures.push(mesh)
  const left = new THREE.Object3D()
  const right = new THREE.Object3D()
  left.name = 'AR_LeftShoulder'
  right.name = 'AR_RightShoulder'
  left.position.set(0.5, 0.7, 0)
  right.position.set(-0.5, 0.7, 0)
  scene.add(mesh, left, right)
  resources.set(url, { kind: 'ready', scene })
  return scene
}

function pending(url: string) {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  resources.set(url, { kind: 'pending', promise })
  return () => {
    ready(url)
    resolve()
  }
}

function garment(id: string, modelUrl: string): Garment {
  return { ...demoGarment, id, name: `Fixture ${id}`, modelUrl }
}

function latestAsset(): THREE.Object3D {
  const result = vi.mocked(clone).mock.results.at(-1)
  if (!result || result.type !== 'return') throw new Error('No cloned GLB')
  return result.value
}

function localMaterial(asset: THREE.Object3D): THREE.Material {
  const mesh = asset.getObjectByName('SwitchFixtureCloth')
  if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material)) {
    throw new Error('Missing fixture material')
  }
  return mesh.material
}

beforeEach(() => {
  now = 1000
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  harness.load.mockReset().mockImplementation((url: string) => {
    const resource = resources.get(url)
    if (!resource) throw new Error(`Missing fixture: ${url}`)
    if (resource.kind === 'pending') throw resource.promise
    if (resource.kind === 'error') throw resource.error
    return { scene: resource.scene }
  })
  harness.clear.mockReset()
  harness.canvasMount.mockClear()
  harness.canvasUnmount.mockClear()
  vi.mocked(clone).mockClear()
  vi.mocked(startPoseSession).mockClear()
  ready(DEFAULT_GARMENT_MODEL_URL)
})

afterEach(() => {
  cleanup()
  for (const mesh of fixtures) {
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material.dispose())
  }
  fixtures.length = 0
  resources.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('loads the selected URL, disposes the old instance, and preserves Canvas and the pose subscription', () => {
  const a = garment('a', '/switch-fixture/a.glb')
  const b = garment('b', '/switch-fixture/b.glb')
  const cachedA = ready(a.modelUrl!)
  ready(b.modelUrl!)
  const cachedMaterial = localMaterial(cachedA)
  const sharedDispose = vi.spyOn(cachedMaterial, 'dispose')
  const source = createPoseChannel()
  const subscribe = vi.spyOn(source, 'subscribe')
  const view = render(<GarmentOverlay source={source} garment={a} mirrored />)
  const oldAsset = latestAsset()
  const dispose = vi.spyOn(localMaterial(oldAsset), 'dispose')

  view.rerender(<GarmentOverlay source={source} garment={b} mirrored />)

  expect(harness.load).toHaveBeenLastCalledWith(b.modelUrl)
  expect(latestAsset().name).toBe(b.modelUrl)
  expect(latestAsset()).not.toBe(oldAsset)
  expect(dispose).toHaveBeenCalledOnce()
  expect(sharedDispose).not.toHaveBeenCalled()
  expect(cachedA.parent).toBeNull()
  expect(subscribe).toHaveBeenCalledOnce()
  expect(harness.canvasMount).toHaveBeenCalledOnce()
  expect(harness.canvasUnmount).not.toHaveBeenCalled()
  expect(harness.clear).not.toHaveBeenCalled()
})

it('reloads the selected instance when its URL changes without changing garment id', () => {
  const a = garment('same-id', '/switch-fixture/a.glb')
  const b = garment('same-id', '/switch-fixture/b.glb')
  ready(a.modelUrl!)
  ready(b.modelUrl!)
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garment={a} mirrored />)
  const first = latestAsset()
  view.rerender(<GarmentOverlay source={source} garment={b} mirrored />)
  expect(latestAsset()).not.toBe(first)
  expect(latestAsset().name).toBe(b.modelUrl)
  expect(harness.canvasMount).toHaveBeenCalledOnce()
})

it('does not resurrect a slow previous selection after a newer GLB has loaded', async () => {
  const a = garment('a', '/switch-fixture/a.glb')
  const b = garment('b', '/switch-fixture/b.glb')
  const c = garment('c', '/switch-fixture/c.glb')
  ready(a.modelUrl!)
  const finishB = pending(b.modelUrl!)
  ready(c.modelUrl!)
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garment={a} mirrored />)
  view.rerender(<GarmentOverlay source={source} garment={b} mirrored />)
  expect(screen.getByText('3Dモデルを読み込んでいます…')).toBeInTheDocument()
  view.rerender(<GarmentOverlay source={source} garment={c} mirrored />)
  const latest = latestAsset()
  await act(async () => { finishB() })
  expect(latestAsset()).toBe(latest)
  expect(latest.name).toBe(c.modelUrl)
  expect(screen.queryByText('3Dモデルを読み込んでいます…')).not.toBeInTheDocument()
  expect(screen.getByLabelText('試着する服')).toHaveAttribute('data-model-url', c.modelUrl)
  expect(harness.canvasMount).toHaveBeenCalledOnce()
})

it('can select another GLB after a load error without recreating Canvas', () => {
  const initial = garment('initial', '/switch-fixture/initial.glb')
  ready(initial.modelUrl!)
  const a = garment('broken', '/switch-fixture/broken.glb')
  const b = garment('good', '/switch-fixture/good.glb')
  resources.set(a.modelUrl!, { kind: 'error', error: new Error('Intentional fixture load failure') })
  ready(b.modelUrl!)
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garment={initial} mirrored />)
  view.rerender(<GarmentOverlay source={source} garment={a} mirrored />)
  expect(screen.getByRole('button', { name: '3Dモデルを再読み込み' })).toBeInTheDocument()
  view.rerender(<GarmentOverlay source={source} garment={b} mirrored />)
  expect(latestAsset().name).toBe(b.modelUrl)
  expect(screen.queryByRole('button', { name: '3Dモデルを再読み込み' })).not.toBeInTheDocument()
  expect(harness.canvasMount).toHaveBeenCalledOnce()
})

it('retries only the selected failed URL, not the default or other cached GLBs', () => {
  const selected = garment('broken', '/switch-fixture/broken.glb')
  resources.set(selected.modelUrl!, { kind: 'error', error: new Error('Intentional fixture load failure') })
  harness.clear.mockImplementation((url: string) => { ready(url) })
  const source = createPoseChannel()
  render(<GarmentOverlay source={source} garment={selected} mirrored />)
  fireEvent.click(screen.getByRole('button', { name: '3Dモデルを再読み込み' }))
  expect(harness.clear).toHaveBeenCalledExactlyOnceWith(selected.modelUrl)
  expect(latestAsset().name).toBe(selected.modelUrl)
  expect(screen.queryByRole('button', { name: '3Dモデルを再読み込み' })).not.toBeInTheDocument()
})

it('keeps legacy 2D fixtures usable without a modelUrl property', () => {
  const legacy = { ...demoGarment, modelUrl: undefined }
  render(<GarmentOverlay source={createPoseChannel()} garment={legacy} mirrored />)
  expect(harness.load).toHaveBeenLastCalledWith(DEFAULT_GARMENT_MODEL_URL)
})

it('routes a real wrist swipe through CameraView to another GLB without restarting inference', async () => {
  for (const item of garments) ready(item.modelUrl!)
  const stop = vi.fn()
  const track = { stop, onended: null as (() => void) | null }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  const getUserMedia = vi.fn().mockResolvedValue(stream)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  render(<CameraView />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
  })
  expect(startPoseSession).toHaveBeenCalledOnce()
  const call = vi.mocked(startPoseSession).mock.calls[0]
  if (!call) throw new Error('Pose session did not start')
  const publish = call[1].onFrame
  act(() => {
    for (const x of [-0.5, -0.2, 0.1, 0.4]) {
      now += 80
      publish(makeSwipeFrame(now, x))
    }
  })
  expect(screen.getByText(`2 / ${garments.length}`)).toBeInTheDocument()
  expect(harness.load).toHaveBeenLastCalledWith(garments[1].modelUrl)
  expect(latestAsset().name).toBe(garments[1].modelUrl)
  expect(startPoseSession).toHaveBeenCalledOnce()
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(harness.canvasMount).toHaveBeenCalledOnce()
})
