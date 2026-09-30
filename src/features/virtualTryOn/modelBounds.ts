import * as THREE from 'three'

// useGLTF owns immutable loaded assets. Keep exact bounds across selection
// changes without rescanning every vertex of the same static garment.
const cache = new WeakMap<THREE.Object3D, Map<string, THREE.Box3>>()
export function modelBounds(
  source: THREE.Object3D,
  object: THREE.Object3D,
  key: string,
) {
  let dynamic = false
  source.traverse((node) => {
    if (
      node instanceof THREE.SkinnedMesh ||
      (node instanceof THREE.Mesh && node.morphTargetInfluences?.length)
    )
      dynamic = true
  })
  if (dynamic) return new THREE.Box3().setFromObject(object, true)
  let entries = cache.get(source)
  if (!entries) {
    entries = new Map()
    cache.set(source, entries)
  }
  const previous = entries.get(key)
  if (previous) return previous.clone()
  const bounds = new THREE.Box3().setFromObject(object, true)
  // Bound memory when calibration is edited repeatedly during development.
  if (entries.size >= 8) entries.delete(entries.keys().next().value!)
  entries.set(key, bounds.clone())
  return bounds
}
