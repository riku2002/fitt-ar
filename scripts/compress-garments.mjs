import fs from 'node:fs'
import console from 'node:console'
import crypto from 'node:crypto'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const report = []
function contents(document) {
  const root = document.getRoot()
  return JSON.stringify({
    triangles: root
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .map(
        (primitive) =>
          (primitive.getIndices()?.getCount() ??
            primitive.getAttribute('POSITION').getCount()) / 3,
      ),
    textures: root
      .listTextures()
      .map((texture) =>
        crypto.createHash('sha256').update(texture.getImage()).digest('hex'),
      )
      .sort(),
  })
}
for (const file of fs
  .readdirSync('public/garments')
  .filter((name) => name.endsWith('.glb'))
  .sort()) {
  const path = `public/garments/${file}`
  const before = fs.statSync(path).size
  const doc = await io.read(path)
  // Never repeatedly quantize an already optimized asset.
  if (
    doc
      .getRoot()
      .listExtensionsUsed()
      .some((ext) => ext.extensionName === 'EXT_meshopt_compression')
  ) {
    console.log(`${file}: already compressed`)
    continue
  }
  const originalContents = contents(doc)
  const anchors = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getName().startsWith('AR_'))
    .map((n) => [n.getName(), n.getWorldTranslation()])
  await doc.transform(
    meshopt({
      encoder: MeshoptEncoder,
      level: 'medium',
      quantizePosition: 16,
      quantizeNormal: 12,
      quantizeTexcoord: 16,
    }),
  )
  const output = await io.writeBinary(doc)
  const restored = await io.readBinary(output)
  if (contents(restored) !== originalContents)
    throw Error(`Topology or textures changed: ${file}`)
  for (const [name, position] of anchors) {
    const node = restored
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === name)
    if (
      !node ||
      node
        .getWorldTranslation()
        .some((v, i) => Math.abs(v - position[i]) > 1e-7)
    )
      throw Error(`Anchor changed: ${file} ${name}`)
  }
  if (output.length >= before) throw Error(`Compression did not reduce ${file}`)
  fs.writeFileSync(path, output)
  report.push({ file, before, after: output.length })
  console.log(`${file}: ${before} -> ${output.length}`)
}
if (report.length)
  fs.writeFileSync(
    'docs/garment-compression.json',
    JSON.stringify(report, null, 2) + '\n',
  )
