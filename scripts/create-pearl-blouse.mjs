import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import zlib from 'node:zlib'
import * as THREE from 'three'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

// Original procedural demo mesh inspired by Belluna 272337, not a product scan.
// Metres, +Y up, +Z front, +X wearer's left. Open neck, cuffs and hem.
const variants = [
  ['smoky-blue', [0.43, 0.57, 0.64]],
  ['mocha-beige', [0.64, 0.53, 0.45]],
]
const pieces = []
function surface(name, rows, columns, point, material = 'fabric') {
  const positions = [],
    indices = []
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= columns; j++)
      positions.push(...point(i / rows, j / columns))
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j,
        b = a + columns + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  pieces.push({ name, geometry, material })
}

// Body rings run from a subtly curved hem to a V-shaped neckline.
surface('Draped blouse body', 48, 96, (t, u) => {
  const a = u * Math.PI * 2,
    front = Math.sin(a) > 0 ? 1 - Math.abs(Math.cos(a)) : 0
  let width, depth, y
  if (t < 0.84) {
    const v = t / 0.84
    width = 0.252 - 0.023 * Math.sin(v * Math.PI) + 0.005 * v
    depth = 0.115 + 0.022 * Math.sin(v * Math.PI)
    y = 0.02 + v * 0.555 - 0.14 * v ** 4 * front
  } else {
    const v = (t - 0.84) / 0.16
    width = THREE.MathUtils.lerp(0.257, 0.09, v)
    depth = THREE.MathUtils.lerp(0.115, 0.062, v)
    y = THREE.MathUtils.lerp(0.575 - 0.14 * front, 0.662 - 0.215 * front, v)
  }
  const fold =
    (0.0025 * Math.sin(a * 13 + t * 2) + 0.0015 * Math.sin(a * 23 - t * 4)) *
    Math.sin(t * Math.PI)
  return [
    (width + fold) * Math.cos(a),
    y - 0.012 * (1 - t) ** 8 * Math.sin(a) ** 2,
    (depth + fold) * Math.sin(a),
  ]
})

for (const side of [-1, 1]) {
  // Relaxed A-pose sleeves, ending part way down the forearm.
  const start = new THREE.Vector3(side * 0.204, 0.51, 0)
  const end = new THREE.Vector3(side * 0.455, 0.165, 0)
  const axis = end.clone().sub(start).normalize()
  const across = new THREE.Vector3(-axis.y, axis.x, 0)
  surface(
    `${side > 0 ? 'Left' : 'Right'} eight-length sleeve`,
    36,
    48,
    (t, u) => {
      const a = u * Math.PI * 2
      const radius = 0.1 * (1 - t) + 0.06 * t + 0.007 * Math.sin(t * Math.PI)
      const fold = 0.002 * Math.sin(a * 9 + t * 7) * Math.sin(t * Math.PI)
      return start
        .clone()
        .lerp(end, t)
        .addScaledVector(across, (radius + fold) * Math.cos(a))
        .add(new THREE.Vector3(0, 0, (radius * 0.9 + fold) * Math.sin(a)))
        .toArray()
    },
  )
  surface(
    `${side > 0 ? 'Left' : 'Right'} cuff seam`,
    2,
    48,
    (t, u) => {
      const a = u * Math.PI * 2
      return end
        .clone()
        .addScaledVector(axis, (t - 0.5) * 0.012)
        .addScaledVector(across, 0.061 * Math.cos(a))
        .add(new THREE.Vector3(0, 0, 0.055 * Math.sin(a)))
        .toArray()
    },
    'trim',
  )
}

// Narrow binding follows the V neck, with a front placket and pearl buttons.
surface(
  'V neck binding',
  3,
  96,
  (t, u) => {
    const a = u * Math.PI * 2,
      front = Math.sin(a) > 0 ? 1 - Math.abs(Math.cos(a)) : 0
    return [
      (0.09 + t * 0.006) * Math.cos(a),
      0.662 - 0.215 * front - t * 0.006,
      (0.063 + t * 0.004) * Math.sin(a),
    ]
  },
  'trim',
)
surface(
  'Front button placket',
  40,
  4,
  (t, u) => {
    const y = 0.032 + t * 0.411
    const v = (y - 0.02) / 0.555
    return [(u - 0.5) * 0.025, y, 0.118 + 0.022 * Math.sin(v * Math.PI)]
  },
  'trim',
)
for (let i = 0; i < 5; i++) {
  const y = 0.39 - i * 0.076
  const geometry = new THREE.SphereGeometry(0.008, 16, 12)
  geometry.scale(1, 1, 0.65)
  geometry.translate(
    0,
    y,
    0.126 + 0.022 * Math.sin(((y - 0.02) / 0.555) * Math.PI),
  )
  pieces.push({ name: `Pearl button ${i + 1}`, geometry, material: 'pearl' })
}

// Software-render the actual mesh into a transparent catalog icon. No runtime
// browser/native graphics dependency; the icon always matches generated geometry.
function icon(color) {
  const size = 512,
    pixels = Buffer.alloc(size * size * 4)
  const depths = new Float32Array(size * size).fill(-Infinity)
  const light = new THREE.Vector3(-0.4, 0.65, 1).normalize()
  for (const { geometry, material } of pieces) {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal
    const base =
      material === 'pearl'
        ? [0.96, 0.94, 0.88]
        : color.map((v) => v * (material === 'trim' ? 0.91 : 1))
    const vertices = Array.from({ length: p.count }, (_, i) => {
      const normal = new THREE.Vector3().fromBufferAttribute(n, i)
      if (normal.z < 0) normal.negate()
      return [
        256 + p.getX(i) * 450,
        420 - p.getY(i) * 450,
        p.getZ(i),
        0.58 + 0.42 * Math.max(0, normal.dot(light)),
      ]
    })
    const indices = geometry.index.array
    for (let k = 0; k < indices.length; k += 3) {
      const [a, b, c] = [
        vertices[indices[k]],
        vertices[indices[k + 1]],
        vertices[indices[k + 2]],
      ]
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
      if (Math.abs(det) < 1e-8) continue
      for (
        let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        y <= Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
          x <= Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
          x++
        ) {
          const u =
            ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det
          const v =
            ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det
          const w = 1 - u - v
          if (Math.min(u, v, w) < 0) continue
          const z = u * a[2] + v * b[2] + w * c[2],
            offset = y * size + x
          if (z <= depths[offset]) continue
          depths[offset] = z
          const shade = u * a[3] + v * b[3] + w * c[3]
          for (let channel = 0; channel < 3; channel++)
            pixels[offset * 4 + channel] = Math.round(
              base[channel] * shade * 255,
            )
          pixels[offset * 4 + 3] = 255
        }
    }
  }
  function chunk(type, data) {
    const name = Buffer.from(type),
      payload = Buffer.concat([name, data])
    let crc = 0xffffffff
    for (const byte of payload) {
      crc ^= byte
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    const header = Buffer.alloc(4),
      footer = Buffer.alloc(4)
    header.writeUInt32BE(data.length)
    footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([header, payload, footer])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++)
    pixels.copy(
      scanlines,
      y * (size * 4 + 1) + 1,
      y * size * 4,
      (y + 1) * size * 4,
    )
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
  })
for (const [variant, color] of variants) {
  const document = new Document(),
    buffer = document.createBuffer()
  const scene = document.createScene('Pearl button blouse')
  const materials = {
    fabric: document
      .createMaterial('Matte georgette')
      .setBaseColorFactor([...color, 1])
      .setRoughnessFactor(0.94)
      .setDoubleSided(true),
    trim: document
      .createMaterial('Binding and seams')
      .setBaseColorFactor([...color.map((v) => v * 0.91), 1])
      .setRoughnessFactor(0.9)
      .setDoubleSided(true),
    pearl: document
      .createMaterial('Ivory pearl')
      .setBaseColorFactor([0.96, 0.94, 0.88, 1])
      .setRoughnessFactor(0.24),
  }
  for (const { name, geometry, material } of pieces) {
    const primitive = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        document
          .createAccessor()
          .setType('VEC3')
          .setArray(geometry.attributes.position.array)
          .setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        document
          .createAccessor()
          .setType('VEC3')
          .setArray(geometry.attributes.normal.array)
          .setBuffer(buffer),
      )
      .setIndices(
        document
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Uint16Array(geometry.index.array))
          .setBuffer(buffer),
      )
      .setMaterial(materials[material])
    scene.addChild(
      document
        .createNode(name)
        .setMesh(document.createMesh(name).addPrimitive(primitive)),
    )
  }
  for (const [name, translation] of [
    ['AR_LeftShoulder', [0.19, 0.575, 0]],
    ['AR_RightShoulder', [-0.19, 0.575, 0]],
    ['AR_LeftHip', [0.16, 0.075, 0]],
    ['AR_RightHip', [-0.16, 0.075, 0]],
  ])
    scene.addChild(document.createNode(name).setTranslation(translation))
  scene.setExtras({
    reference: 'https://belluna.jp/goods/272337.html',
    demo: true,
    units: 'metres',
  })
  const filename = `public/garments/pearl_blouse_${variant}`
  await document.transform(
    meshopt({
      encoder: MeshoptEncoder,
      level: 'medium',
      quantizePosition: 16,
      quantizeNormal: 12,
    }),
  )
  await io.write(`${filename}.glb`, document)
  fs.writeFileSync(`${filename}_icon.png`, icon(color))
  console.log(`Created ${filename}.glb and icon`)
}
