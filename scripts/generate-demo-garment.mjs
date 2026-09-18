// Original geometric test artwork; no photos, external assets or runtime deps.
// Run: node scripts/generate-demo-garment.mjs
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { URL } from 'node:url'

const size = 800
const outline = [
  [332, 120],
  [240, 160],
  [164, 176],
  [48, 328],
  [134, 390],
  [208, 278],
  [208, 720],
  [592, 720],
  [592, 278],
  [666, 390],
  [752, 328],
  [636, 176],
  [560, 160],
  [468, 120],
  [468, 148],
  [450, 180],
  [420, 200],
  [380, 200],
  [350, 180],
  [332, 148],
]
const pocket = [
  [452, 260],
  [534, 260],
  [534, 348],
  [493, 366],
  [452, 348],
]
function inside(x, y, polygon) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i],
      [bx, by] = polygon[j]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      hit = !hit
  }
  return hit
}
function edgeDistance(x, y, polygon) {
  let distance = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i],
      [bx, by] = polygon[(i + 1) % polygon.length]
    const dx = bx - ax,
      dy = by - ay
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
    )
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return distance
}
const pixels = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let coverage = 0
    for (const dy of [0.25, 0.75])
      for (const dx of [0.25, 0.75])
        if (inside(x + dx, y + dy, outline)) coverage++
    if (!coverage) continue
    const edge = edgeDistance(x + 0.5, y + 0.5, outline)
    const shade = Math.round(10 * (1 - Math.abs(x - 400) / 400) - y / 130)
    let color = [137 + shade, 165 + shade, 141 + shade]
    if (edge < 2 || (y > 704 && y < 707)) color = [101, 130, 106]
    if (y < 215 && x > 326 && x < 474 && edge < 9) color = [91, 121, 98]
    if (inside(x, y, pocket))
      color = edgeDistance(x, y, pocket) < 2 ? [101, 130, 106] : [132, 159, 136]
    const offset = y * (size * 4 + 1) + 1 + x * 4
    pixels[offset] = color[0]
    pixels[offset + 1] = color[1]
    pixels[offset + 2] = color[2]
    pixels[offset + 3] = Math.round((coverage / 4) * 255)
  }
}
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data])
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  tail.writeUInt32BE(crc32(bytes))
  return Buffer.concat([head, bytes, tail])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header[8] = 8
header[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
])
const directory = new URL('../public/garments/', import.meta.url)
await mkdir(directory, { recursive: true })
await writeFile(new URL('demo-tshirt-sage.png', directory), png)
