import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { modelBounds } from './modelBounds'

afterEach(() => vi.restoreAllMocks())
it('reuses exact static bounds on reselection without exposing the cached box to mutation', () => {
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4)))
  scene.rotation.z = 0.3
  const expected = new THREE.Box3().setFromObject(scene, true)
  const measure = vi.spyOn(THREE.Box3.prototype, 'setFromObject')
  const first = modelBounds(scene, scene, 'profile-1')
  expect(first.equals(expected)).toBe(true)
  first.makeEmpty()
  expect(modelBounds(scene, scene.clone(), 'profile-1').equals(expected)).toBe(
    true,
  )
  expect(measure).toHaveBeenCalledTimes(1)
  modelBounds(scene, scene, 'profile-2')
  expect(measure).toHaveBeenCalledTimes(2)
})
it('does not share bounds between separately loaded assets', () => {
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  const b = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4))
  expect(modelBounds(a, a, 'same').getSize(new THREE.Vector3()).x).toBe(1)
  expect(modelBounds(b, b, 'same').getSize(new THREE.Vector3()).x).toBe(4)
})
it('remeasures morph geometry instead of keeping stale bounds', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  geometry.morphAttributes.position = [geometry.attributes.position.clone()]
  const mesh = new THREE.Mesh(geometry)
  const measure = vi.spyOn(THREE.Box3.prototype, 'setFromObject')
  modelBounds(mesh, mesh, 'profile')
  modelBounds(mesh, mesh, 'profile')
  expect(measure).toHaveBeenCalledTimes(2)
})
