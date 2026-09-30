// @vitest-environment node
import fs from 'node:fs'
import * as THREE from 'three'
import { expect, it } from 'vitest'
import { geometryScene, readGlb } from './inspect-garments.mjs'

it.each(
  fs.readdirSync('public/garments').filter((file) => file.endsWith('.glb')),
)('decodes compressed geometry with the Three loader: %s', async (filename) => {
  const path = `public/garments/${filename}`
  expect(readGlb(path).json.extensionsRequired).toContain(
    'EXT_meshopt_compression',
  )
  const scene = await geometryScene(path)
  const bounds = new THREE.Box3().setFromObject(scene, true)
  expect(bounds.isEmpty()).toBe(false)
  expect(
    [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite),
  ).toBe(true)
  expect(scene.getObjectByName('AR_LeftHip')).toBeDefined()
  scene.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose()
      node.material.dispose()
    }
  })
})
