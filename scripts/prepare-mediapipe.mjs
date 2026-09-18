import { cp, mkdir, readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { createHash } from 'node:crypto'

const model = await readFile(
  new URL('../public/models/pose_landmarker_lite.task', import.meta.url),
)
const digest = createHash('sha256').update(model).digest('hex')
if (
  digest !== '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
) {
  throw new Error(
    'Pose model checksum mismatch. Restore public/models/pose_landmarker_lite.task from Git.',
  )
}

// Serve the WASM matching the locked npm package from our own origin.
const source = new URL(
  '../node_modules/@mediapipe/tasks-vision/wasm/',
  import.meta.url,
)
const destination = new URL('../public/mediapipe/wasm/', import.meta.url)
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true })
