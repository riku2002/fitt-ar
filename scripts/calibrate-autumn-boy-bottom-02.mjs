// One-time width correction for autumn denim 02. Match the two calibrated
// width curves used for denim 01 while preserving its anatomical AR_* nodes.
import fs from 'node:fs'
import crypto from 'node:crypto'
import process from 'node:process'
import * as THREE from 'three'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const path = 'public/garments/autumn_boy_bottom_02.glb'
const expectedSource =
  '53c0d325d841ef43262a78b0a25d5e16d80dc85465c6bd53d2730f706df5995b'
const source = fs.readFileSync(path)
if (
  crypto.createHash('sha256').update(source).digest('hex') !== expectedSource
) {
  throw Error('Expected the unmodified autumn_boy_bottom_02 GLB')
}

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const document = await io.readBinary(source)
const root = document.getRoot()
const anchors = root
  .listNodes()
  .filter((node) => node.getName().startsWith('AR_'))
  .map((node) => [node.getName(), node.getWorldTranslation()])
const imageHashes = root
  .listTextures()
  .map((texture) =>
    crypto.createHash('sha256').update(texture.getImage()).digest('hex'),
  )
const triangleCounts = root
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .map((primitive) => primitive.getIndices()?.getCount() ?? 0)
const hipCenterX =
  anchors
    .filter(([name]) => name.endsWith('Hip'))
    .reduce((sum, [, point]) => sum + point[0], 0) / 2
const vertices = []
for (const node of root
  .listNodes()
  .filter((node) => node.getMesh()?.getName().startsWith('tripo_mesh_'))) {
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix())
  const inverse = matrix.clone().invert()
  for (const primitive of node.getMesh().listPrimitives()) {
    const position = primitive.getAttribute('POSITION')
    const array = position.getArray()
    if (!(array instanceof Int16Array) || !position.getNormalized()) {
      throw Error(`Unsupported POSITION encoding in ${node.getName()}`)
    }
    vertices.push({ position, array, matrix, inverse })
  }
}
const world = new THREE.Vector3()
let minY = Infinity,
  maxY = -Infinity
for (const { array, matrix } of vertices) {
  for (let i = 0; i < array.length; i += 3) {
    world
      .set(array[i] / 32767, array[i + 1] / 32767, array[i + 2] / 32767)
      .applyMatrix4(matrix)
    minY = Math.min(minY, world.y)
    maxY = Math.max(maxY, world.y)
  }
}
if (!(maxY > minY)) throw Error('Invalid model height')

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

let changed = 0
for (const { position, array, matrix, inverse } of vertices) {
  for (let i = 0; i < array.length; i += 3) {
    world
      .set(array[i] / 32767, array[i + 1] / 32767, array[i + 2] / 32767)
      .applyMatrix4(matrix)
    const height = (world.y - minY) / (maxY - minY)
    const waistGain = 0.55 * smoothstep((height - 0.55) / (0.92 - 0.55))
    const lowerGain =
      height >= 0.75
        ? 0.25 * smoothstep((0.93 - height) / (0.93 - 0.75))
        : 0.15 + 0.1 * smoothstep(height / 0.45)
    const widthFactor = (1 + waistGain) * (1 + lowerGain)
    world.x = hipCenterX + (world.x - hipCenterX) * widthFactor
    world.applyMatrix4(inverse)
    const encoded = Math.round(world.x * 32767)
    if (encoded < -32767 || encoded > 32767)
      throw Error('Quantized position overflow')
    array[i] = encoded
    changed++
  }
  position.setArray(array)
}
const output = await io.writeBinary(document)
const restored = await io.readBinary(output)
const restoredRoot = restored.getRoot()
const restoredImages = restoredRoot
  .listTextures()
  .map((texture) =>
    crypto.createHash('sha256').update(texture.getImage()).digest('hex'),
  )
const restoredTriangles = restoredRoot
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .map((primitive) => primitive.getIndices()?.getCount() ?? 0)
if (
  JSON.stringify(restoredImages) !== JSON.stringify(imageHashes) ||
  JSON.stringify(restoredTriangles) !== JSON.stringify(triangleCounts)
) {
  throw Error('Texture or topology changed unexpectedly')
}
for (const [name, point] of anchors) {
  const updated = restoredRoot
    .listNodes()
    .find((node) => node.getName() === name)
  if (
    !updated ||
    updated
      .getWorldTranslation()
      .some((value, i) => Math.abs(value - point[i]) > 1e-7)
  ) {
    throw Error(`Anchor changed unexpectedly: ${name}`)
  }
}
fs.writeFileSync(path, output)
process.stdout.write(
  `${path}: widened waist, hips and legs (${changed} vertices), anchors and textures unchanged\n`,
)
