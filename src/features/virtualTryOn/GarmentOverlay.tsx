import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { PoseFrame, PosePoint, PoseSource } from '../pose/poseTypes'
import type { Garment } from '../wardrobe/garments'

const MODEL_URL = `${import.meta.env.BASE_URL}garments/tshirt.glb`
const EPS = 1e-8
const CAMERA_Z = 5
const CAMERA_FOV = 50

// Model-space calibration, not camera-distance tuning.
// Prefer two Empty nodes placed at the garment's anatomical shoulder joints.
const MODEL = {
  leftMarker: 'AR_LeftShoulder',
  rightMarker: 'AR_RightShoulder',
  rotation: [0, 0, 0] as [number, number, number],
  // Approximate fallback ONLY when neither marker is available.
  // These fractions describe the GLB after MODEL.rotation, not the person.
  shoulderSpanOfBounds: 0.60,
  shoulderHeightOfBounds: 0.84,
  shoulderDepthOfBounds: 0.50,
}

const TRACK = {
  hideConfidence: 0.50,
  showConfidence: 0.65,
  hideWidth: 0.08,
  showWidth: 0.10,
  hideFacing: Math.cos(65 * Math.PI / 180),
  showFacing: Math.cos(50 * Math.PI / 180),
  fullFacing: Math.cos(30 * Math.PI / 180),
  maxRenderYaw: 45 * Math.PI / 180,
  reacquireMs: 160,
  reacquireSamples: 3,
  maxGapMs: 250,
  staleMs: 450,
  smoothingRate: 14,
  fadeInRate: 10,
  fadeOutRate: 14,
  invisibleOpacity: 0.01,
  // Reject unsafe perspective fits instead of clipping scale to a wrong value.
  maxDepthFraction: 0.30,
} as const

type TrackingState = 'searching' | 'turning' | 'tracking'
type ModelState = 'loading' | 'ready' | 'error'
interface Observation {
  timestamp: number
  width: number
  height: number
  lx: number
  ly: number
  rx: number
  ry: number
  widthRatio: number
  confidence: number
  facing: number
  yaw: number
}
interface Target { pose: Observation | null; opacity: number }
interface Fit { x: number; y: number; scale: number; yaw: number; roll: number }
interface FadeMaterial {
  material: THREE.Material
  opacity: number
  transparent: boolean
  depthWrite: boolean
  alphaTest: number
}

function smooth01(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

function pointConfidence(point: PosePoint | undefined): number {
  if (!point || ![point.x, point.y, point.z, point.visibility].every(Number.isFinite)) return 0
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return 0
  const presence = point.presence ?? 1
  if (!Number.isFinite(presence) || presence < 0 || presence > 1) return 0
  if (point.visibility < 0 || point.visibility > 1) return 0
  return Math.min(point.visibility, presence)
}

function readObservation(frame: PoseFrame): Observation | null {
  const { width, height, timestamp, landmarks: p } = frame
  if (![width, height, timestamp].every(Number.isFinite) || width <= 0 || height <= 0) return null
  const l = p[11], r = p[12]
  const confidence = Math.min(pointConfidence(l), pointConfidence(r))
  if (!l || !r || confidence < TRACK.hideConfidence) return null
  const sx = (l.x - r.x) * width
  const sy = -(l.y - r.y) * height
  const sz = -(l.z - r.z) * width
  const imageWidth = Math.hypot(sx, sy)
  const vectorWidth = Math.hypot(imageWidth, sz)
  if (!Number.isFinite(vectorWidth) || imageWidth < EPS) return null

  // Signed shoulder orientation is one cue, not a definitive back classifier.
  let facing = sx / vectorWidth
  const lh = p[23], rh = p[24]
  if (lh && rh && Math.min(pointConfidence(lh), pointConfidence(rh)) >= 0.60) {
    const ux = ((l.x + r.x - lh.x - rh.x) / 2) * width
    const uy = -((l.y + r.y - lh.y - rh.y) / 2) * height
    const uz = -((l.z + r.z - lh.z - rh.z) / 2) * width
    // Front normal = shoulder(right -> left) cross torso(hips -> shoulders).
    const nx = sy * uz - sz * uy
    const ny = sz * ux - sx * uz
    const nz = sx * uy - sy * ux
    const length = Math.hypot(nx, ny, nz)
    if (!Number.isFinite(length) || length < EPS) return null
    facing = Math.min(facing, nz / length)
  }
  return {
    timestamp, width, height,
    lx: l.x, ly: l.y, rx: r.x, ry: r.y,
    widthRatio: imageWidth / Math.min(width, height),
    confidence, facing,
    // Relative z affects bounded orientation, never the base pixel scale.
    yaw: THREE.MathUtils.clamp(Math.atan2(-sz, imageWidth), -TRACK.maxRenderYaw, TRACK.maxRenderYaw),
  }
}

function createTracker(report: (target: Target, state: TrackingState) => void) {
  let active = false
  let goodSince: number | null = null
  let samples = 0
  let lastTime = -Infinity
  let width = 0, height = 0
  let timer: number | undefined
  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }
  function hide(state: TrackingState = 'searching') {
    active = false
    goodSince = null
    samples = 0
    report({ pose: null, opacity: 0 }, state)
  }
  function reset() {
    clearTimer()
    lastTime = -Infinity
    width = height = 0
    hide()
  }
  function push(frame: PoseFrame | null) {
    if (!frame || document.hidden) { reset(); return }
    const age = performance.now() - frame.timestamp
    if (!Number.isFinite(age) || age < 0 || age >= TRACK.staleMs) { reset(); return }
    if (frame.timestamp <= lastTime) return
    clearTimer()
    if (frame.timestamp - lastTime > TRACK.maxGapMs || frame.width !== width || frame.height !== height) hide()
    lastTime = frame.timestamp
    width = frame.width
    height = frame.height
    const pose = readObservation(frame)
    if (!pose) { hide(); return }
    const minConfidence = active ? TRACK.hideConfidence : TRACK.showConfidence
    const minWidth = active ? TRACK.hideWidth : TRACK.showWidth
    const minFacing = active ? TRACK.hideFacing : TRACK.showFacing
    if (pose.confidence < minConfidence || pose.widthRatio < minWidth || pose.facing < minFacing) {
      hide(pose.facing < TRACK.showFacing ? 'turning' : 'searching')
      return
    }
    if (!active) {
      goodSince ??= pose.timestamp
      samples += 1
      active = samples >= TRACK.reacquireSamples && pose.timestamp - goodSince >= TRACK.reacquireMs
    }
    if (active) {
      const opacity = smooth01(TRACK.hideFacing, TRACK.fullFacing, pose.facing) *
        smooth01(TRACK.hideConfidence, 0.85, pose.confidence)
      report({ pose, opacity }, opacity < 0.65 ? 'turning' : 'tracking')
    } else {
      report({ pose: null, opacity: 0 }, 'searching')
    }
    timer = window.setTimeout(reset, TRACK.staleMs - age)
  }
  return { push, reset, dispose: clearTimer }
}

// Plane coordinates are camera-relative XY on the world Z=0 plane.
// Normalized model shoulder anchors are right=(-.5,0,0), left=(.5,0,0).
// Solve their PERSPECTIVE projection, including off-center yaw.
function solveFit(lx: number, ly: number, rx: number, ry: number, distance: number, yaw: number): Fit | null {
  const dx = lx - rx, dy = ly - ry
  const span = Math.hypot(dx, dy)
  if (![lx, ly, rx, ry, span, distance, yaw].every(Number.isFinite) || span < EPS || distance <= EPS) return null
  const px = (lx + rx) / 2, py = (ly + ry) / 2
  const nx = dx / span, ny = dy / span
  const uz = -Math.sin(yaw)
  const mx = uz * px / distance, my = uz * py / distance
  const dot = nx * mx + ny * my
  const discriminant = dot * dot + 1 - uz * uz - mx * mx - my * my
  if (!Number.isFinite(discriminant) || discriminant <= EPS) return null
  const k = dot + Math.sqrt(discriminant)
  if (!Number.isFinite(k) || k <= EPS) return null
  const scale = span / k
  return {
    x: px - scale * uz * dx / (4 * distance),
    y: py - scale * uz * dy / (4 * distance),
    scale,
    yaw,
    roll: Math.atan2(k * ny - my, k * nx - mx),
  }
}

function buildModel(scene: THREE.Object3D) {
  const asset = clone(scene)
  const oriented = new THREE.Group()
  oriented.rotation.set(...MODEL.rotation)
  oriented.add(asset)
  oriented.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(oriented, true)
  const size = box.getSize(new THREE.Vector3())
  if (box.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || size.x < EPS || size.y < EPS) {
    throw new Error('GLB has no measurable garment geometry')
  }
  const lNode = asset.getObjectByName(MODEL.leftMarker)
  const rNode = asset.getObjectByName(MODEL.rightMarker)
  if (Boolean(lNode) !== Boolean(rNode)) throw new Error('Provide BOTH AR shoulder markers')
  const left = new THREE.Vector3(), right = new THREE.Vector3()
  if (lNode && rNode) {
    lNode.getWorldPosition(left)
    rNode.getWorldPosition(right)
  } else {
    const center = box.getCenter(new THREE.Vector3())
    const half = size.x * MODEL.shoulderSpanOfBounds / 2
    const y = box.min.y + size.y * MODEL.shoulderHeightOfBounds
    const z = box.min.z + size.z * MODEL.shoulderDepthOfBounds
    left.set(center.x + half, y, z)
    right.set(center.x - half, y, z)
  }
  const shoulderWidth = left.distanceTo(right)
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < EPS) throw new Error('Invalid GLB shoulder markers')
  const center = left.clone().add(right).multiplyScalar(0.5)
  const direction = left.clone().sub(right).normalize()
  const rotation = new THREE.Quaternion().setFromUnitVectors(direction, new THREE.Vector3(1, 0, 0))
  const normalized = new THREE.Group()
  normalized.quaternion.copy(rotation)
  normalized.scale.setScalar(1 / shoulderWidth)
  normalized.position.copy(center).applyQuaternion(rotation).multiplyScalar(-1 / shoulderWidth)
  normalized.add(oriented)
  normalized.updateMatrixWorld(true)

  // Normalize the actual asset pivot INCLUDING its z offset, not just its scale.
  const normalizedBounds = new THREE.Box3().setFromObject(normalized, true)
  const corners: THREE.Vector3[] = []
  for (const x of [normalizedBounds.min.x, normalizedBounds.max.x])
    for (const y of [normalizedBounds.min.y, normalizedBounds.max.y])
      for (const z of [normalizedBounds.min.z, normalizedBounds.max.z]) corners.push(new THREE.Vector3(x, y, z))

  const materials: FadeMaterial[] = []
  const materialMap = new Map<THREE.Material, THREE.Material>()
  const skeletons = new Set<THREE.Skeleton>()
  function ownMaterial(source: THREE.Material) {
    const existing = materialMap.get(source)
    if (existing) return existing
    const material = source.clone()
    materials.push({ material, opacity: source.opacity, transparent: source.transparent, depthWrite: source.depthWrite, alphaTest: source.alphaTest })
    material.transparent = true
    material.opacity = 0
    material.depthWrite = false
    materialMap.set(source, material)
    return material
  }
  asset.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material = Array.isArray(object.material) ? object.material.map(ownMaterial) : ownMaterial(object.material)
      object.castShadow = false
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
  })
  const root = new THREE.Group()
  root.name = 'AR_GarmentRoot'
  root.visible = false
  root.add(normalized)
  return { root, materials, skeletons, corners, alpha: 0, placed: false }
}

function GarmentModel({ targetRef, onReady }: {
  targetRef: RefObject<Target>
  onReady: () => void
}) {
  const { scene } = useGLTF(MODEL_URL)
  const instance = useMemo(() => buildModel(scene), [scene])
  const instanceRef = useRef(instance)
  const scratchRef = useRef({
    origin: new THREE.Vector3(), direction: new THREE.Vector3(),
    left: new THREE.Vector3(), right: new THREE.Vector3(), corner: new THREE.Vector3(),
    position: new THREE.Vector3(), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, 'ZYX'),
    ray: new THREE.Raycaster(), ndc: new THREE.Vector2(),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  })
  useEffect(() => {
    instanceRef.current = instance
    onReady()
    return () => {
      for (const { material } of instance.materials) material.dispose()
      for (const skeleton of instance.skeletons) skeleton.dispose()
      // Shared geometry and textures still belong to useGLTF's cache.
    }
  }, [instance, onReady])

  useFrame(({ camera, size }, delta) => {
    const item = instanceRef.current, s = scratchRef.current
    const object = item.root
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0
    const blend = 1 - Math.exp(-TRACK.smoothingRate * dt)
    const target = targetRef.current
    const pose = target.pose
    let wantedOpacity = 0
    camera.updateMatrixWorld()
    camera.getWorldPosition(s.origin)
    camera.getWorldDirection(s.direction)
    // This fitting mode requires a camera parallel to Z=0. Do not add OrbitControls.
    const cameraOK = camera instanceof THREE.PerspectiveCamera && s.origin.z > 0 &&
      Math.abs(s.direction.x) < 1e-6 && Math.abs(s.direction.y) < 1e-6 && s.direction.z < 0
    const age = pose ? performance.now() - pose.timestamp : Infinity
    if (!document.hidden && pose && age >= 0 && age < TRACK.staleMs && cameraOK && size.width > 0 && size.height > 0) {
      const fit = Math.min(size.width / pose.width, size.height / pose.height)
      const vw = pose.width * fit, vh = pose.height * fit
      const ox = (size.width - vw) / 2, oy = (size.height - vh) / 2
      // CSS pixels -> NDC -> camera ray -> Z=0. Never multiply by devicePixelRatio.
      s.ndc.set(2 * (ox + pose.lx * vw) / size.width - 1, 1 - 2 * (oy + pose.ly * vh) / size.height)
      s.ray.setFromCamera(s.ndc, camera)
      const hitLeft = s.ray.ray.intersectPlane(s.plane, s.left)
      s.ndc.set(2 * (ox + pose.rx * vw) / size.width - 1, 1 - 2 * (oy + pose.ry * vh) / size.height)
      s.ray.setFromCamera(s.ndc, camera)
      const hitRight = s.ray.ray.intersectPlane(s.plane, s.right)
      const result = hitLeft && hitRight ? solveFit(
        s.left.x - s.origin.x, s.left.y - s.origin.y,
        s.right.x - s.origin.x, s.right.y - s.origin.y,
        s.origin.z, pose.yaw,
      ) : null
      if (result) {
        s.position.set(result.x + s.origin.x, result.y + s.origin.y, 0)
        s.rotation.setFromEuler(s.euler.set(0, result.yaw, result.roll, 'ZYX'))
        s.scale.setScalar(result.scale)
        // Check the full model depth, not only the shoulder anchor plane.
        let safe = true
        for (const corner of item.corners) {
          const z = s.corner.copy(corner).applyQuaternion(s.rotation).multiplyScalar(result.scale).z
          if (!Number.isFinite(z) || Math.abs(z) > s.origin.z * TRACK.maxDepthFraction) { safe = false; break }
        }
        if (safe) {
          if (!item.placed || item.alpha <= TRACK.invisibleOpacity) {
            object.position.copy(s.position)
            object.quaternion.copy(s.rotation)
            object.scale.copy(s.scale)
            item.placed = true
          } else {
            object.position.lerp(s.position, blend)
            object.quaternion.slerp(s.rotation, blend)
            object.scale.lerp(s.scale, blend)
          }
          wantedOpacity = target.opacity
        }
      }
    }
    // Invalid poses never update transforms: fade at the LAST stable placement.
    const fadeRate = wantedOpacity > item.alpha ? TRACK.fadeInRate : TRACK.fadeOutRate
    item.alpha += (wantedOpacity - item.alpha) * (1 - Math.exp(-fadeRate * dt))
    if (document.hidden || (wantedOpacity === 0 && item.alpha < TRACK.invisibleOpacity)) item.alpha = 0
    if (wantedOpacity === 1 && item.alpha > 0.999) item.alpha = 1
    object.visible = item.placed && item.alpha > 0
    const fading = item.alpha < 1
    for (const entry of item.materials) {
      const transparent = fading || entry.transparent
      if (entry.material.transparent !== transparent) {
        entry.material.transparent = transparent
        entry.material.needsUpdate = true
      }
      entry.material.opacity = entry.opacity * item.alpha
      entry.material.alphaTest = entry.alphaTest * Math.max(item.alpha, EPS)
      entry.material.depthWrite = !fading && entry.depthWrite
    }
  })
  return <primitive object={instance.root} dispose={null} />
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; onError: () => void }, { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}
function WebGLFallback({ onError }: { onError: () => void }) {
  useEffect(onError, [onError])
  return null
}

export function GarmentOverlay({ source, garment, mirrored }: {
  source: PoseSource
  garment: Garment
  mirrored: boolean
}) {
  const targetRef = useRef<Target>({ pose: null, opacity: 0 })
  const [tracking, setTracking] = useState<TrackingState>('searching')
  const [modelState, setModelState] = useState<ModelState>('loading')
  const [attempt, setAttempt] = useState(0)
  const onReady = useCallback(() => setModelState('ready'), [])
  const onError = useCallback(() => setModelState('error'), [])
  useEffect(() => {
    let reported: TrackingState | undefined
    const tracker = createTracker((target, state) => {
      targetRef.current = target
      if (reported !== state) { reported = state; setTracking(state) }
    })
    tracker.reset()
    const unsubscribe = source.subscribe(tracker.push)
    const onVisibility = () => { if (document.hidden) tracker.reset() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unsubscribe()
      tracker.dispose()
      targetRef.current = { pose: null, opacity: 0 }
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [source])
  function retry() {
    useGLTF.clear(MODEL_URL)
    setModelState('loading')
    setAttempt((value) => value + 1)
  }
  const message = modelState === 'error'
    ? '3Dモデルを表示できません。GLBとWebGLを確認してください。'
    : modelState === 'loading'
      ? '3Dモデルを読み込んでいます…'
      : tracking === 'tracking'
        ? `${garment.name} · 3D試着中`
        : tracking === 'turning'
          ? '正面に戻ると試着を再開します'
          : '両肩を映し、少し静止してください'
  return (
    <>
      <div className="pose-canvas garment-canvas" aria-label="試着する服">
        <ModelErrorBoundary key={attempt} onError={onError}>
          <Canvas camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 100 }}
            gl={{ alpha: true, antialias: true }} fallback={<WebGLFallback onError={onError} />}>
            <ambientLight intensity={1} />
            <directionalLight position={[0, 0, 5]} intensity={1.5} />
            <directionalLight position={[-5, 5, 2]} intensity={0.5} />
            <Suspense fallback={null}><GarmentModel targetRef={targetRef} onReady={onReady} /></Suspense>
          </Canvas>
        </ModelErrorBoundary>
      </div>
      <div className={`garment-feedback ${mirrored ? 'is-mirrored' : ''}`}>
        <p className="pose-message" role="status"
          style={{ maxWidth: '100%', boxSizing: 'border-box', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
          {message}
        </p>
        {modelState === 'error' && <button type="button" className="pose-retry" onClick={retry}>3Dモデルを再読み込み</button>}
      </div>
    </>
  )
}
