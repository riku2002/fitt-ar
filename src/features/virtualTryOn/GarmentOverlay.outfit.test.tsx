import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GarmentOverlay } from './GarmentOverlay'
import { demoGarment } from '../wardrobe/garments'
import type { Garment } from '../wardrobe/garments'
import { createPoseChannel } from '../pose/poseChannel'
import { makePoseFrame } from '../../test/poseFixture'

const harness = vi.hoisted(() => ({
  load: vi.fn(), clear: vi.fn(), mount: vi.fn(), unmount: vi.fn(),
  frames: new Set<(state: RootState, delta: number) => void>(),
}))
vi.mock('@react-three/fiber', async () => {
  const { createElement, Fragment, useEffect, useLayoutEffect, useRef } = await import('react')
  function useFrameDouble(callback: Parameters<typeof useFrame>[0]) {
    const current = useRef(callback)
    useLayoutEffect(() => { current.current = callback })
    useEffect(() => {
      const tick = (state: RootState, delta: number) => current.current(state, delta)
      harness.frames.add(tick)
      return () => { harness.frames.delete(tick) }
    }, [])
  }
  return {
    Canvas: function CanvasDouble({ children }: { children: ReactNode }) {
      useEffect(() => { harness.mount(); return () => { harness.unmount() } }, [])
      return createElement(Fragment, null, children)
    },
    useFrame: vi.fn(useFrameDouble),
  }
})
vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(harness.load, { clear: harness.clear }) }))
vi.mock('three/addons/utils/SkeletonUtils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('three/addons/utils/SkeletonUtils.js')>()
  return { ...original, clone: vi.fn(original.clone) }
})

const cache = new Map<string, THREE.Group | Error>()
const owned: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
let now = 1000
const size = { width: 640, height: 480 }
let camera: THREE.PerspectiveCamera

function ready(id: string, category: Garment['category'] = 'tshirt', markers = true): Garment {
  const modelUrl = `/outfit-test/${id}.glb`
  const scene = new THREE.Group()
  scene.name = id
  scene.position.set(40, -25, 50)
  const geometry = new THREE.BoxGeometry(1.6, 1.7, 0.2)
  const material = new THREE.MeshStandardMaterial()
  owned.push({ geometry, material })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Cloth'
  scene.add(mesh)
  if (markers) {
    for (const [name, x] of [[category === 'bottoms' ? 'AR_LeftHip' : 'AR_LeftShoulder', 0.5],
      [category === 'bottoms' ? 'AR_RightHip' : 'AR_RightShoulder', -0.5]] as const) {
      const marker = new THREE.Object3D()
      marker.name = name; marker.position.set(x, 0.7, 0)
      scene.add(marker)
    }
  }
  cache.set(modelUrl, scene)
  return { ...demoGarment, id, name: id, category, modelUrl }
}
function asset(id: string): THREE.Object3D {
  const result = [...vi.mocked(clone).mock.results].reverse().find(r => r.type === 'return' && r.value.name === id)
  if (!result || result.type !== 'return') throw new Error(`Missing asset ${id}`)
  return result.value
}
function root(id: string): THREE.Object3D {
  let object: THREE.Object3D | null = asset(id)
  while (object && object.name !== 'AR_GarmentRoot') object = object.parent
  if (!object) throw new Error('Missing root')
  return object
}
function material(id: string): THREE.Material {
  const mesh = asset(id).getObjectByName('Cloth')
  if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material)) throw new Error('Missing material')
  return mesh.material
}
function acquire(source: ReturnType<typeof createPoseChannel>) {
  for (let i = 0; i < 3; i++) {
    now += 80
    act(() => source.publish({ ...makePoseFrame(), timestamp: now }))
    if (harness.frames.size === 0) throw new Error('Missing frame callback')
    act(() => {
      for (const callback of harness.frames) callback({ camera, size } as RootState, 1 / 60)
    })
  }
}
beforeEach(() => {
  now = 1000
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100)
  camera.position.z = 5; camera.updateMatrixWorld(true)
  harness.load.mockReset().mockImplementation((url: string) => {
    const scene = cache.get(url)
    if (!scene || scene instanceof Error) throw scene ?? new Error('Missing model')
    return { scene }
  })
  harness.clear.mockReset()
  harness.mount.mockClear(); harness.unmount.mockClear(); harness.frames.clear()
  vi.mocked(clone).mockClear(); vi.mocked(useFrame).mockClear()
})
afterEach(() => {
  cleanup()
  owned.forEach(item => { item.geometry.dispose(); item.material.dispose() })
  owned.length = 0; cache.clear()
  vi.restoreAllMocks(); vi.useRealTimers()
})

it('renders two garments in ONE Canvas with ONE pose subscription', () => {
  const top = ready('top'), pants = ready('pants', 'bottoms')
  const source = createPoseChannel()
  const subscribe = vi.spyOn(source, 'subscribe')
  render(<GarmentOverlay source={source} garments={[top, pants]} mirrored />)
  expect(asset('top')).not.toBe(asset('pants'))
  expect(root('top')).not.toBe(root('pants'))
  acquire(source)
  expect(root('top').visible).toBe(true)
  expect(root('pants').visible).toBe(true)
  expect(harness.mount).toHaveBeenCalledOnce()
  expect(subscribe).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('試着する服')).toHaveAttribute('data-model-urls', JSON.stringify([top.modelUrl, pants.modelUrl]))
})

it('switches only the bottom instance, preserving the top and Canvas', () => {
  const top = ready('top'), pants = ready('pants', 'bottoms'), skirt = ready('skirt', 'bottoms')
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garments={[top, pants]} mirrored />)
  const oldTop = asset('top')
  const topDispose = vi.spyOn(material('top'), 'dispose')
  const bottomDispose = vi.spyOn(material('pants'), 'dispose')
  view.rerender(<GarmentOverlay source={source} garments={[top, skirt]} mirrored />)
  expect(asset('top')).toBe(oldTop)
  expect(topDispose).not.toHaveBeenCalled()
  expect(bottomDispose).toHaveBeenCalledOnce()
  expect(asset('skirt').name).toBe('skirt')
  expect(harness.mount).toHaveBeenCalledOnce()
  expect(harness.unmount).not.toHaveBeenCalled()
})

it('isolates a bottom load error and retries it without disposing the top', () => {
  const top = ready('top'), broken = ready('broken', 'bottoms')
  const source = createPoseChannel()
  const view = render(<GarmentOverlay source={source} garments={[top]} mirrored />)
  const topDispose = vi.spyOn(material('top'), 'dispose')
  cache.set(broken.modelUrl!, new Error('Intentional failure'))
  view.rerender(<GarmentOverlay source={source} garments={[top, broken]} mirrored />)
  harness.clear.mockImplementation(() => { ready('broken', 'bottoms') })
  fireEvent.click(screen.getByRole('button', { name: 'brokenの3Dモデルを再読み込み' }))
  expect(harness.clear).toHaveBeenCalledExactlyOnceWith(broken.modelUrl)
  expect(topDispose).not.toHaveBeenCalled()
  expect(harness.mount).toHaveBeenCalledOnce()
})

it('defensively makes onepiece exclusive even for inconsistent external input', () => {
  const top = ready('top'), pants = ready('pants', 'bottoms'), dress = ready('dress', 'onepiece')
  render(<GarmentOverlay source={createPoseChannel()} garments={[top, pants, dress]} mirrored />)
  expect(harness.load).toHaveBeenCalledWith(dress.modelUrl)
  expect(harness.load).not.toHaveBeenCalledWith(top.modelUrl)
  expect(harness.load).not.toHaveBeenCalledWith(pants.modelUrl)
})

it('keeps visual scale and offsets separate from the fitted root', () => {
  const plain = ready('plain')
  const source = createPoseChannel()
  const first = render(<GarmentOverlay source={source} garment={plain} mirrored />)
  acquire(source)
  const position = root('plain').position.clone()
  const scale = root('plain').scale.clone()
  first.unmount()
  const calibrated = { ...ready('calibrated'), fit3D: { scaleX: 1.4, scaleY: 1.1, offsetY: 0.10 } }
  render(<GarmentOverlay source={source} garment={calibrated} mirrored />)
  acquire(source)
  expect(root('calibrated').position.distanceTo(position)).toBeLessThan(1e-10)
  expect(root('calibrated').scale.distanceTo(scale)).toBeLessThan(1e-10)
  const visual = root('calibrated').getObjectByName('AR_GarmentCalibration')
  if (!visual) throw new Error('Missing calibration group')
  expect(visual.scale.toArray()).toEqual([1.4, 1.1, 1])
  expect(visual.position.toArray()).toEqual([0, 0.10, 0])
})

it('halving a fallback anchorSpan doubles displayed width without changing tracking scale', () => {
  function measure(span: number, id: string) {
    const garment = { ...ready(id, 'bottoms', false), fit3D: { anchorSpan: span } }
    const source = createPoseChannel()
    const view = render(<GarmentOverlay source={source} garment={garment} mirrored />)
    acquire(source)
    const object = root(id)
    object.updateMatrixWorld(true)
    const width = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3()).x
    const scale = object.scale.x
    view.unmount()
    return { width, scale }
  }
  const a = measure(0.6, 'a'), b = measure(0.3, 'b')
  expect(b.scale).toBeCloseTo(a.scale, 10)
  expect(b.width / a.width).toBeCloseTo(2, 10)
})

it('rejects invalid calibration instead of rendering NaN or collapsed geometry', () => {
  const garment = { ...ready('invalid'), fit3D: { scaleY: 0 } }
  render(<GarmentOverlay source={createPoseChannel()} garment={garment} mirrored />)
  expect(screen.getByRole('button', { name: '3Dモデルを再読み込み' })).toBeInTheDocument()
})
