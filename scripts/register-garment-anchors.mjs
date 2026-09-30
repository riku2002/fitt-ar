import console from 'node:console'
import fs from 'node:fs'
import * as THREE from 'three'
import { readGlb, encodeGlb, geometryScene } from './inspect-garments.mjs'

// Fractions are manually calibrated anatomical references, not automatic seam detection.
const config = JSON.parse(
  fs.readFileSync('config/garment-anchors.json', 'utf8'),
)
for (const [filename, fit] of Object.entries(config)) {
  if (
    !['hips', 'shoulders'].includes(fit.axis) ||
    ![fit.span, fit.height, fit.depth].every(
      (v) => Number.isFinite(v) && v > 0 && v <= 1,
    )
  )
    throw Error(`Invalid calibration: ${filename}`)
  if (
    fit.axis === 'shoulders' &&
    !(
      fit.hipHeight >= 0 &&
      fit.hipHeight < fit.height &&
      fit.hipSpan > 0 &&
      fit.hipSpan <= 1
    )
  )
    throw Error(`Invalid hip reference: ${filename}`)
  const file = `public/garments/${filename}`
  const scene = await geometryScene(file)
  const box = new THREE.Box3().setFromObject(scene, true)
  const size = box.getSize(new THREE.Vector3())
  const { json, tail } = readGlb(file)
  const active = json.scenes[json.scene ?? 0]
  function pair(axis, span, height) {
    for (const [side, sign] of [
      ['Left', 1],
      ['Right', -1],
    ]) {
      const name = `AR_${side}${axis}`
      const translation = [
        box.min.x + size.x * (fit.centerX ?? 0.5) + (sign * size.x * span) / 2,
        box.min.y + size.y * height,
        box.min.z + size.z * fit.depth,
      ]
      const existing = json.nodes.findIndex((n) => n.name === name)
      if (existing >= 0) {
        if (!active.nodes.includes(existing))
          throw Error(`Nested existing marker: ${name}`)
        json.nodes[existing] = { name, translation }
      } else {
        active.nodes.push(json.nodes.length)
        json.nodes.push({ name, translation })
      }
    }
  }
  if (fit.axis === 'shoulders') {
    pair('Shoulder', fit.span, fit.height)
    pair('Hip', fit.hipSpan, fit.hipHeight)
  } else pair('Hip', fit.span, fit.height)
  fs.writeFileSync(file, encodeGlb(json, tail))
  console.log(`${filename}: ${fit.axis === 'hips' ? 2 : 4} anchors`)
}
