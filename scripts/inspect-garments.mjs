import { Buffer } from 'node:buffer'
import process from 'node:process'
import { URL } from 'node:url'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function readGlb(file) {
  const bytes = fs.readFileSync(file)
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw Error(`Invalid GLB: ${file}`)
  const jsonLength = bytes.readUInt32LE(12)
  return {
    bytes,
    json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()),
    tail: bytes.subarray(20 + jsonLength),
  }
}
export function encodeGlb(json, tail) {
  const source = Buffer.from(JSON.stringify(json))
  const payload = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32)
  source.copy(payload)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + payload.length + tail.length, 8)
  header.writeUInt32LE(payload.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  return Buffer.concat([header, payload, tail])
}
export async function geometryScene(file) {
  const { json, tail } = readGlb(file)
  delete json.images
  delete json.textures
  delete json.materials
  for (const mesh of json.meshes ?? [])
    for (const primitive of mesh.primitives) delete primitive.material
  const bytes = encodeGlb(json, tail)
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  gltf.scene.updateMatrixWorld(true)
  return gltf.scene
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const filename of fs
    .readdirSync('public/garments')
    .filter((f) => f.endsWith('.glb'))) {
    const file = path.join('public/garments', filename)
    const scene = await geometryScene(file)
    const bounds = new THREE.Box3().setFromObject(scene, true)
    const size = bounds.getSize(new THREE.Vector3())
    const points = []
    scene.traverse((o) => {
      if (o.isMesh) {
        const p = o.geometry.attributes.position
        for (let i = 0; i < p.count; i++)
          points.push(
            new THREE.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(o.matrixWorld),
          )
      }
    })
    const slices = [0.97, 0.93, 0.9, 0.84, 0.7, 0.5].map((h) => {
      const slice = points.filter(
        (p) => Math.abs((p.y - bounds.min.y) / size.y - h) < 0.01,
      )
      return [
        h,
        slice.length
          ? +(
              (Math.max(...slice.map((p) => p.x)) -
                Math.min(...slice.map((p) => p.x))) /
              size.x
            ).toFixed(3)
          : null,
      ]
    })
    console.log(
      JSON.stringify({
        filename,
        sha256: crypto
          .createHash('sha256')
          .update(fs.readFileSync(file))
          .digest('hex'),
        size: size.toArray(),
        slices,
        vertices: points.length,
      }),
    )
  }
}
