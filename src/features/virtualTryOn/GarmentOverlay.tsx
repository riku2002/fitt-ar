import {
  Component, Suspense, useCallback, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
} from 'react'
import type { ReactNode, RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { DEFAULT_GARMENT_MODEL_URL } from '../wardrobe/garments'
import type {
  Garment, Garment3DFit, GarmentCategory, OcclusionSegment,
} from '../wardrobe/garments'
import type { PoseFrame, PosePoint, PoseSource } from '../pose/poseTypes'

const EPS = 1e-8
const CAMERA_Z = 5
const CAMERA_FOV = 50
const TRACK = {
  hideConfidence: 0.50, showConfidence: 0.65,
  hideWidth: 0.08, showWidth: 0.10,
  hideFacing: Math.cos(65 * Math.PI / 180),
  showFacing: Math.cos(50 * Math.PI / 180),
  fullFacing: Math.cos(30 * Math.PI / 180),
  maxRenderYaw: 45 * Math.PI / 180,
  reacquireMs: 160, reacquireSamples: 3, maxGapMs: 250, staleMs: 450,
  smoothingRate: 14, fadeInRate: 10, fadeOutRate: 14,
  invisibleOpacity: 0.01, maxDepthFraction: 0.30,
} as const
const OCCLUSION = {
  enterConfidence: 0.80, exitConfidence: 0.65,
  enterFront: 0.12, exitFront: 0.06, maxRelativeDepth: 1.25,
  depthGain: 0.65, maxAdvance: 0.70, maxRetreat: 0.25,
  reacquireMs: 60, reacquireSamples: 2, staleMs: 180,
  smoothingRate: 30, revealRate: 18, maxDepthFraction: 0.35,
  shadowOpacity: 0.20,
} as const

type Axis = 'shoulders' | 'hips'
type Side = 'left' | 'right'
type TrackingState = 'searching' | 'turning' | 'tracking'
type ModelState = 'loading' | 'ready' | 'error'
type ChainId = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'
interface Pair {
  left: PosePoint
  right: PosePoint
  sx: number
  sy: number
  sz: number
  span: number
  length: number
  confidence: number
}
interface SegmentData {
  ax: number; ay: number; bx: number; by: number
  aFront: number; bFront: number
  confidence: number
  lengthRatio: number
}
interface Chain {
  pair: Pair
  root: PosePoint
  first: SegmentData | null
  second: SegmentData | null
}
interface Measurement {
  timestamp: number
  width: number
  height: number
  shoulders: Pair | null
  hips: Pair | null
  chains: Record<ChainId, Chain | null>
}
interface Observation extends Measurement {
  axis: Axis
  primary: Pair
  widthRatio: number
  confidence: number
  facing: number
  yaw: number
}
interface Target { pose: Observation | null; opacity: number }
type Targets = Record<Axis, Target>
interface Fit { x: number; y: number; scale: number; yaw: number; roll: number }
interface SegmentConfig {
  radiusRatio: number
  startFraction: number
  endFraction: number
  minLengthRatio: number
  maxLengthRatio: number
}
interface SegmentSpec extends SegmentConfig {
  kind: OcclusionSegment
  chain: ChainId
  axis: Axis
  side: Side
  second: boolean
}
interface Profile {
  axis: Axis
  category: GarmentCategory
  leftMarker: string
  rightMarker: string
  rotation: [number, number, number]
  span: number
  height: number
  depth: number
  fitTorso: boolean
  segments: SegmentSpec[]
}

const SEGMENT_DEFAULTS: Record<OcclusionSegment, SegmentConfig> = {
  upper: { radiusRatio: 0.065, startFraction: 0.55, endFraction: 0.98,
    minLengthRatio: 0.15, maxLengthRatio: 1.25 },
  forearm: { radiusRatio: 0.052, startFraction: 0.04, endFraction: 0.96,
    minLengthRatio: 0.12, maxLengthRatio: 1.40 },
  // Hip-width units, NOT shoulder-width units. Uncalibrated starting values.
  thigh: { radiusRatio: 0.105, startFraction: 0.55, endFraction: 0.98,
    minLengthRatio: 0.20, maxLengthRatio: 2.50 },
  shin: { radiusRatio: 0.070, startFraction: 0.04, endFraction: 0.96,
    minLengthRatio: 0.20, maxLengthRatio: 2.80 },
}

function resolveProfile(
  category: GarmentCategory,
  fitting: Garment3DFit | undefined,
  occlusion: Garment['occlusion3D'],
): Profile {
  const bottom = category === 'bottoms'
  const dress = category === 'onepiece'
  const axis: Axis = bottom ? 'hips' : 'shoulders'
  const segments: SegmentSpec[] = []
  const kinds: OcclusionSegment[] = bottom
    ? ['thigh', 'shin']
    : dress ? ['upper', 'forearm', 'thigh', 'shin'] : ['upper', 'forearm']

  for (const kind of kinds) {
    const override = occlusion?.[kind]
    if (override?.enabled === false) continue
    const config = { ...SEGMENT_DEFAULTS[kind], ...override }
    const leg = kind === 'thigh' || kind === 'shin'
    for (const side of ['left', 'right'] as const) {
      segments.push({
        ...config, kind, side,
        chain: `${side}${leg ? 'Leg' : 'Arm'}` as ChainId,
        axis: leg ? 'hips' : 'shoulders',
        second: kind === 'forearm' || kind === 'shin',
      })
    }
  }
  return {
    category, axis,
    leftMarker: bottom ? 'AR_LeftHip' : 'AR_LeftShoulder',
    rightMarker: bottom ? 'AR_RightHip' : 'AR_RightShoulder',
    rotation: fitting?.rotation ?? [0, 0, 0],
    // Bounds are NOT anatomical dimensions. Prefer actual marker nodes.
    span: fitting?.anchorSpan ?? (bottom ? 0.65 : dress ? 0.50 : 0.60),
    height: fitting?.anchorHeight ?? (bottom ? 0.88 : dress ? 0.93 : 0.84),
    depth: fitting?.anchorDepth ?? 0.50,
    fitTorso: dress && (fitting?.fitTorsoLength ?? true),
    segments,
  }
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
function readPair(frame: PoseFrame, li: number, ri: number): Pair | null {
  const l = frame.landmarks[li], r = frame.landmarks[ri]
  const confidence = Math.min(pointConfidence(l), pointConfidence(r))
  if (!l || !r || confidence < TRACK.hideConfidence) return null
  const sx = (l.x - r.x) * frame.width
  const sy = -(l.y - r.y) * frame.height
  const sz = -(l.z - r.z) * frame.width
  const span = Math.hypot(sx, sy)
  const length = Math.hypot(span, sz)
  if (span < EPS || !Number.isFinite(length)) return null
  return { left: { ...l }, right: { ...r }, sx, sy, sz, span, length, confidence }
}
function readSegment(
  frame: PoseFrame, pair: Pair, root: PosePoint,
  a: PosePoint | undefined, b: PosePoint | undefined,
): SegmentData | null {
  const confidence = Math.min(
    pointConfidence(root), pointConfidence(a), pointConfidence(b), pair.confidence,
  )
  if (!a || !b || confidence < OCCLUSION.exitConfidence) return null
  const lengthRatio = Math.hypot(
    (b.x - a.x) * frame.width, (b.y - a.y) * frame.height,
  ) / pair.span
  const aFront = (root.z - a.z) * frame.width / pair.span
  const bFront = (root.z - b.z) * frame.width / pair.span
  if (![lengthRatio, aFront, bFront].every(Number.isFinite)) return null
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, aFront, bFront, confidence, lengthRatio }
}
function measureFrame(frame: PoseFrame | null): Measurement | null {
  if (!frame || ![frame.width, frame.height, frame.timestamp].every(Number.isFinite) ||
      frame.width <= 0 || frame.height <= 0) return null
  const input = frame
  const shoulders = readPair(input, 11, 12)
  const hips = readPair(frame, 23, 24)
  function chain(pair: Pair | null, side: Side, mid: number, end: number): Chain | null {
    if (!pair) return null
    const root = pair[side]
    const a = input.landmarks[mid], b = input.landmarks[end]
    return {
      pair, root,
      first: readSegment(input, pair, root, root, a),
      second: readSegment(input, pair, root, a, b),
    }
  }
  return {
    timestamp: frame.timestamp, width: frame.width, height: frame.height,
    shoulders, hips,
    chains: {
      leftArm: chain(shoulders, 'left', 13, 15),
      rightArm: chain(shoulders, 'right', 14, 16),
      leftLeg: chain(hips, 'left', 25, 27),
      rightLeg: chain(hips, 'right', 26, 28),
    },
  }
}
function readObservation(frame: Measurement, axis: Axis): Observation | null {
  const primary = frame[axis]
  if (!primary) return null
  let facing = primary.sx / primary.length
  const shoulders = frame.shoulders, hips = frame.hips
  // Optional torso normal. Missing shoulders do NOT prevent hip fitting.
  if (shoulders && hips &&
      (axis === 'shoulders' ? hips.confidence : shoulders.confidence) >= 0.60) {
    const ux = (shoulders.left.x + shoulders.right.x - hips.left.x - hips.right.x) * frame.width / 2
    const uy = -(shoulders.left.y + shoulders.right.y - hips.left.y - hips.right.y) * frame.height / 2
    const uz = -(shoulders.left.z + shoulders.right.z - hips.left.z - hips.right.z) * frame.width / 2
    const nx = primary.sy * uz - primary.sz * uy
    const ny = primary.sz * ux - primary.sx * uz
    const nz = primary.sx * uy - primary.sy * ux
    const length = Math.hypot(nx, ny, nz)
    if (!Number.isFinite(length) || length < EPS) return null
    facing = Math.min(facing, nz / length)
  }
  return {
    ...frame, axis, primary, facing,
    confidence: primary.confidence,
    widthRatio: primary.span / Math.min(frame.width, frame.height),
    yaw: THREE.MathUtils.clamp(
      Math.atan2(-primary.sz, primary.span), -TRACK.maxRenderYaw, TRACK.maxRenderYaw,
    ),
  }
}
function createTracker(axis: Axis, report: (target: Target, state: TrackingState) => void) {
  let active = false
  let goodSince: number | null = null
  let samples = 0, width = 0, height = 0
  let lastTime = -Infinity
  let timer: number | undefined
  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }
  function hide(state: TrackingState = 'searching') {
    active = false; goodSince = null; samples = 0
    report({ pose: null, opacity: 0 }, state)
  }
  function reset() {
    clearTimer(); lastTime = -Infinity; width = height = 0; hide()
  }
  function push(frame: Measurement | null) {
    if (!frame || document.hidden) { reset(); return }
    const age = performance.now() - frame.timestamp
    if (!Number.isFinite(age) || age < 0 || age >= TRACK.staleMs) { reset(); return }
    if (frame.timestamp <= lastTime) return
    clearTimer()
    if (frame.timestamp - lastTime > TRACK.maxGapMs || frame.width !== width || frame.height !== height) hide()
    lastTime = frame.timestamp; width = frame.width; height = frame.height
    const pose = readObservation(frame, axis)
    if (!pose) { hide(); return }
    if (pose.confidence < (active ? TRACK.hideConfidence : TRACK.showConfidence) ||
        pose.widthRatio < (active ? TRACK.hideWidth : TRACK.showWidth) ||
        pose.facing < (active ? TRACK.hideFacing : TRACK.showFacing)) {
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
    } else report({ pose: null, opacity: 0 }, 'searching')
    timer = window.setTimeout(reset, TRACK.staleMs - age)
  }
  return { push, reset, dispose: clearTimer }
}

// UNCHANGED perspective solve: normalized left/right anchors (+/-0.5,0,0).
// Inputs are camera-relative XY intersections on Z=0, in world units.
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
    scale, yaw, roll: Math.atan2(k * ny - my, k * nx - mx),
  }
}

function createProjector() {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  let cw = 1, ch = 1, vw = 1, vh = 1, ox = 0, oy = 0
  function configure(pose: Measurement, size: { width: number; height: number }) {
    const fit = Math.min(size.width / pose.width, size.height / pose.height)
    cw = size.width; ch = size.height
    vw = pose.width * fit; vh = pose.height * fit
    ox = (cw - vw) / 2; oy = (ch - vh) / 2
  }
  function onPlane(x: number, y: number, target: THREE.Plane, camera: THREE.Camera, out: THREE.Vector3) {
    ndc.set(2 * (ox + x * vw) / cw - 1, 1 - 2 * (oy + y * vh) / ch)
    ray.setFromCamera(ndc, camera)
    return ray.ray.intersectPlane(target, out) !== null &&
      [out.x, out.y, out.z].every(Number.isFinite)
  }
  function project(x: number, y: number, z: number, camera: THREE.Camera, out: THREE.Vector3) {
    plane.constant = -z
    return onPlane(x, y, plane, camera, out)
  }
  return { configure, project, onPlane }
}
type Projector = ReturnType<typeof createProjector>

function buildModel(scene: THREE.Object3D, profile: Profile) {
  if (![...profile.rotation, profile.span, profile.height, profile.depth].every(Number.isFinite) ||
      profile.span <= 0 || profile.span > 1 || profile.height < 0 || profile.height > 1 ||
      profile.depth < 0 || profile.depth > 1) throw new Error('Invalid fit3D calibration')
  const asset = clone(scene)
  const oriented = new THREE.Group()
  oriented.rotation.set(...profile.rotation)
  oriented.add(asset)
  oriented.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(oriented, true)
  const size = box.getSize(new THREE.Vector3())
  if (box.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || size.x < EPS || size.y < EPS) {
    throw new Error('GLB has no measurable garment geometry')
  }
  const ln = asset.getObjectByName(profile.leftMarker)
  const rn = asset.getObjectByName(profile.rightMarker)
  if (Boolean(ln) !== Boolean(rn)) throw new Error(`Provide BOTH ${profile.axis} marker nodes`)
  const left = new THREE.Vector3(), right = new THREE.Vector3()
  if (ln && rn) {
    ln.getWorldPosition(left); rn.getWorldPosition(right)
  } else {
    const center = box.getCenter(new THREE.Vector3())
    const half = size.x * profile.span / 2
    const y = box.min.y + size.y * profile.height
    const z = box.min.z + size.z * profile.depth
    left.set(center.x + half, y, z); right.set(center.x - half, y, z)
  }
  const width = left.distanceTo(right)
  if (!Number.isFinite(width) || width < EPS) throw new Error('Invalid GLB anchors')
  const center = left.clone().add(right).multiplyScalar(0.5)
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    left.clone().sub(right).normalize(), new THREE.Vector3(1, 0, 0),
  )
  const normalized = new THREE.Group()
  normalized.quaternion.copy(rotation)
  normalized.scale.setScalar(1 / width)
  normalized.position.copy(center).applyQuaternion(rotation).multiplyScalar(-1 / width)
  normalized.add(oriented)
  normalized.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(normalized, true)
  const corners: THREE.Vector3[] = []
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z))

  // Optional torso reference. Never invent the torso length from the dress hem.
  const hl = asset.getObjectByName('AR_LeftHip')
  const hr = asset.getObjectByName('AR_RightHip')
  let hipCenter: THREE.Vector3 | null = null
  if (profile.fitTorso && hl && hr) {
    hipCenter = hl.getWorldPosition(new THREE.Vector3())
      .add(hr.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5)
    if (![hipCenter.x, hipCenter.y, hipCenter.z].every(Number.isFinite) || hipCenter.y >= -EPS) {
      throw new Error('Dress hip markers must be below the shoulder origin')
    }
  }

  const materialMap = new Map<THREE.Material, THREE.Material>()
  const materials: { material: THREE.Material; opacity: number; transparent: boolean;
    depthWrite: boolean; alphaTest: number }[] = []
  const skeletons = new Set<THREE.Skeleton>()
  const shadowCasters: THREE.Mesh[] = []
  function ownMaterial(source: THREE.Material) {
    const existing = materialMap.get(source)
    if (existing) return existing
    const material = source.clone()
    materials.push({ material, opacity: source.opacity, transparent: source.transparent,
      depthWrite: source.depthWrite, alphaTest: source.alphaTest })
    material.transparent = true; material.opacity = 0; material.depthWrite = false
    materialMap.set(source, material)
    return material
  }
  asset.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.material = Array.isArray(object.material) ? object.material.map(ownMaterial) : ownMaterial(object.material)
      object.castShadow = true; object.receiveShadow = false
      shadowCasters.push(object)
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
  })
  const root = new THREE.Group()
  root.name = 'AR_GarmentRoot'; root.visible = false; root.add(normalized)
  return { root, materials, skeletons, shadowCasters, corners, hipCenter,
    alpha: 0, placed: false, stretch: 1 }
}

function createOccluders(profile: Profile) {
  const depthMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, depthTest: true,
    transparent: false, side: THREE.DoubleSide,
  })
  const shadowMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: OCCLUSION.shadowOpacity })
  shadowMaterial.depthWrite = false; shadowMaterial.depthTest = true
  shadowMaterial.side = THREE.DoubleSide
  shadowMaterial.polygonOffset = true
  shadowMaterial.polygonOffsetFactor = -1; shadowMaterial.polygonOffsetUnits = -1
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12)
  const sphere = new THREE.SphereGeometry(1, 12, 8)
  const root = new THREE.Group()
  root.name = 'AR_Occluders'; root.renderOrder = -1000; root.visible = false
  function meshPair(geometry: THREE.BufferGeometry) {
    const depth = new THREE.Mesh(geometry, depthMaterial)
    const shadow = new THREE.Mesh(geometry, shadowMaterial)
    depth.renderOrder = -1000; shadow.renderOrder = -900
    shadow.receiveShadow = true
    return { depth, shadow }
  }
  const segments = profile.segments.map(spec => {
    if (![spec.radiusRatio, spec.startFraction, spec.endFraction].every(Number.isFinite) ||
        spec.radiusRatio <= 0 || spec.radiusRatio > 0.3 || spec.startFraction < 0 ||
        spec.endFraction > 1 || spec.startFraction >= spec.endFraction) {
      throw new Error(`Invalid occlusion3D setting: ${spec.kind}`)
    }
    const group = new THREE.Group()
    group.name = `AR_${spec.side}_${spec.kind}`
    group.visible = false; group.renderOrder = -1000
    const body = meshPair(cylinder), startCap = meshPair(sphere), endCap = meshPair(sphere)
    group.add(body.depth, body.shadow, startCap.depth, startCap.shadow, endCap.depth, endCap.shadow)
    root.add(group)
    return { spec, group, body, startCap, endCap, start: new THREE.Vector3(), end: new THREE.Vector3(),
      active: false, placed: false, lastTime: -Infinity, goodSince: 0, samples: 0, radius: 0, strength: 0 }
  })
  type Segment = (typeof segments)[number]
  const origin = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3()
  const anchor = new THREE.Vector3(), normal = new THREE.Vector3()
  const from = new THREE.Vector3(), to = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), axis = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const bodyPlane = new THREE.Plane()
  const spans: Record<Axis, number> = { shoulders: 0, hips: 0 }
  function disable(segment: Segment) {
    segment.group.visible = false; segment.active = false; segment.placed = false
    segment.samples = 0; segment.lastTime = -Infinity; segment.strength = 0
  }
  function hide() { root.visible = false; segments.forEach(disable) }
  function copyTransform(source: THREE.Object3D, target: THREE.Object3D) {
    target.position.copy(source.position)
    target.quaternion.copy(source.quaternion)
    target.scale.copy(source.scale)
  }
  function update(pose: Observation, camera: THREE.PerspectiveCamera, projector: Projector,
    garmentRoot: THREE.Group, opacity: number, dt: number) {
    const age = performance.now() - pose.timestamp
    if (!Number.isFinite(age) || age < 0 || age > OCCLUSION.staleMs ||
        !garmentRoot.visible || opacity <= TRACK.invisibleOpacity) { hide(); return }
    camera.getWorldPosition(origin)
    garmentRoot.updateWorldMatrix(true, false)
    normal.set(0, 0, 1).applyQuaternion(garmentRoot.quaternion)
    bodyPlane.setFromNormalAndCoplanarPoint(normal, garmentRoot.position)
    shadowMaterial.opacity = OCCLUSION.shadowOpacity * opacity
    const blend = 1 - Math.exp(-OCCLUSION.smoothingRate * dt)
    let anyVisible = false
    spans.shoulders = spans.hips = 0
    for (const segment of segments) {
      const spec = segment.spec, chain = pose.chains[spec.chain]
      const data = chain ? (spec.second ? chain.second : chain.first) : null
      const minConfidence = segment.active ? OCCLUSION.exitConfidence : OCCLUSION.enterConfidence
      const minFront = segment.active ? OCCLUSION.exitFront : OCCLUSION.enterFront
      if (!chain || !data || data.confidence < minConfidence ||
          Math.max(data.aFront, data.bFront) < minFront ||
          Math.max(Math.abs(data.aFront), Math.abs(data.bFront)) > OCCLUSION.maxRelativeDepth ||
          data.lengthRatio < spec.minLengthRatio || data.lengthRatio > spec.maxLengthRatio) {
        disable(segment); continue
      }
      if (pose.timestamp !== segment.lastTime) {
        if (pose.timestamp < segment.lastTime || pose.timestamp - segment.lastTime > OCCLUSION.staleMs) disable(segment)
        if (segment.samples === 0) segment.goodSince = pose.timestamp
        segment.samples += 1; segment.lastTime = pose.timestamp
        if (!segment.active) segment.active = segment.samples >= OCCLUSION.reacquireSamples &&
          pose.timestamp - segment.goodSince >= OCCLUSION.reacquireMs
      }
      if (!segment.active) continue
      // Arms use shoulder widths; legs use hip widths, even for a dress.
      const pair = chain.pair
      if (spans[spec.axis] === 0) {
        if (!projector.project(pair.left.x, pair.left.y, 0, camera, left) ||
            !projector.project(pair.right.x, pair.right.y, 0, camera, right)) { disable(segment); continue }
        spans[spec.axis] = left.distanceTo(right)
      }
      const span = spans[spec.axis]
      if (!Number.isFinite(span) || span <= EPS) { disable(segment); continue }
      if (spec.axis === profile.axis) {
        anchor.set(spec.side === 'left' ? 0.5 : -0.5, 0, 0).applyMatrix4(garmentRoot.matrixWorld)
      } else {
        // Dress legs originate at the observed pelvis, NOT the shoulder anchors.
        if (!projector.onPlane(chain.root.x, chain.root.y, bodyPlane, camera, anchor)) {
          disable(segment); continue
        }
      }
      const az = anchor.z + span * THREE.MathUtils.clamp(
        data.aFront * OCCLUSION.depthGain, -OCCLUSION.maxRetreat, OCCLUSION.maxAdvance,
      )
      const bz = anchor.z + span * THREE.MathUtils.clamp(
        data.bFront * OCCLUSION.depthGain, -OCCLUSION.maxRetreat, OCCLUSION.maxAdvance,
      )
      if (!projector.project(data.ax, data.ay, az, camera, from) ||
          !projector.project(data.bx, data.by, bz, camera, to)) { disable(segment); continue }
      a.lerpVectors(from, to, spec.startFraction)
      b.lerpVectors(from, to, spec.endFraction)
      const radius = span * spec.radiusRatio * (origin.z - (a.z + b.z) / 2) / origin.z
      if (!Number.isFinite(radius) || radius <= EPS ||
          Math.max(Math.abs(a.z), Math.abs(b.z)) + radius > origin.z * OCCLUSION.maxDepthFraction) {
        disable(segment); continue
      }
      if (!segment.placed) {
        segment.start.copy(a); segment.end.copy(b); segment.radius = radius; segment.placed = true
      } else {
        segment.start.lerp(a, blend); segment.end.lerp(b, blend)
        segment.radius = THREE.MathUtils.lerp(segment.radius, radius, blend)
      }
      segment.strength += (1 - segment.strength) * (1 - Math.exp(-OCCLUSION.revealRate * dt))
      const r = segment.radius * Math.sqrt(segment.strength * opacity)
      axis.subVectors(segment.end, segment.start)
      const length = axis.length()
      if (!Number.isFinite(length) || length <= EPS || r <= EPS) { segment.group.visible = false; continue }
      segment.body.depth.position.copy(segment.start).add(segment.end).multiplyScalar(0.5)
      segment.body.depth.quaternion.setFromUnitVectors(up, axis.normalize())
      segment.body.depth.scale.set(r, length, r)
      segment.startCap.depth.position.copy(segment.start)
      segment.endCap.depth.position.copy(segment.end)
      segment.startCap.depth.scale.setScalar(r); segment.endCap.depth.scale.setScalar(r)
      copyTransform(segment.body.depth, segment.body.shadow)
      copyTransform(segment.startCap.depth, segment.startCap.shadow)
      copyTransform(segment.endCap.depth, segment.endCap.shadow)
      segment.group.visible = true; anyVisible = true
    }
    root.visible = anyVisible
  }
  function dispose() {
    hide(); cylinder.dispose(); sphere.dispose(); depthMaterial.dispose(); shadowMaterial.dispose()
  }
  return { root, update, hide, dispose }
}

function createInstance(scene: THREE.Object3D, profile: Profile) {
  return {
    ...buildModel(scene, profile), occluders: createOccluders(profile), projector: createProjector(),
    scratch: {
      origin: new THREE.Vector3(), direction: new THREE.Vector3(),
      left: new THREE.Vector3(), right: new THREE.Vector3(), corner: new THREE.Vector3(),
      position: new THREE.Vector3(), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(),
      euler: new THREE.Euler(0, 0, 0, 'ZYX'), inverse: new THREE.Quaternion(), hip: new THREE.Vector3(),
    },
  }
}
type Instance = ReturnType<typeof createInstance>

// Imperative Three.js updates live outside React render and mutate only
// the instance obtained via ref.current. No React state is updated here.
function advanceInstance(item: Instance, profile: Profile, target: Target,
  camera: THREE.Camera, size: { width: number; height: number }, delta: number) {
  const s = item.scratch, object = item.root, pose = target.pose
  const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0
  const blend = 1 - Math.exp(-TRACK.smoothingRate * dt)
  let wantedOpacity = 0, accepted = false
  camera.updateMatrixWorld()
  camera.getWorldPosition(s.origin); camera.getWorldDirection(s.direction)
  const cameraOK = camera instanceof THREE.PerspectiveCamera && s.origin.z > 0 &&
    Math.abs(s.direction.x) < 1e-6 && Math.abs(s.direction.y) < 1e-6 && s.direction.z < 0
  const age = pose ? performance.now() - pose.timestamp : Infinity
  if (!document.hidden && pose && pose.axis === profile.axis && age >= 0 && age < TRACK.staleMs &&
      cameraOK && size.width > 0 && size.height > 0) {
    item.projector.configure(pose, size)
    const pair = pose.primary
    const hitLeft = item.projector.project(pair.left.x, pair.left.y, 0, camera, s.left)
    const hitRight = item.projector.project(pair.right.x, pair.right.y, 0, camera, s.right)
    const result = hitLeft && hitRight ? solveFit(
      s.left.x - s.origin.x, s.left.y - s.origin.y,
      s.right.x - s.origin.x, s.right.y - s.origin.y, s.origin.z, pose.yaw,
    ) : null
    if (result) {
      s.position.set(result.x + s.origin.x, result.y + s.origin.y, 0)
      s.rotation.setFromEuler(s.euler.set(0, result.yaw, result.roll, 'ZYX'))
      // Dress: bounded longitudinal fit only when real GLB hip markers exist.
      // The anchor line has local Y=0, so its exact horizontal fit is unchanged.
      if (profile.fitTorso && item.hipCenter && pose.hips && pose.hips.confidence >= 0.65) {
        const hc = item.hipCenter
        const z = s.hip.copy(hc).multiplyScalar(result.scale).applyQuaternion(s.rotation).z
        const hips = pose.hips
        if (item.projector.project(
          (hips.left.x + hips.right.x) / 2, (hips.left.y + hips.right.y) / 2, z, camera, s.hip,
        )) {
          s.inverse.copy(s.rotation).invert()
          s.hip.sub(s.position).applyQuaternion(s.inverse).divideScalar(result.scale)
          const ratio = s.hip.y / hc.y
          if (Number.isFinite(ratio) && ratio > 0) item.stretch = THREE.MathUtils.clamp(ratio, 0.80, 1.25)
        }
      }
      s.scale.set(result.scale, result.scale * item.stretch, result.scale)
      let safe = true
      for (const corner of item.corners) {
        const z = s.corner.copy(corner).multiply(s.scale).applyQuaternion(s.rotation).z
        if (!Number.isFinite(z) || Math.abs(z) > s.origin.z * TRACK.maxDepthFraction) { safe = false; break }
      }
      if (safe) {
        if (!item.placed || item.alpha <= TRACK.invisibleOpacity) {
          object.position.copy(s.position); object.quaternion.copy(s.rotation); object.scale.copy(s.scale)
          item.placed = true
        } else {
          object.position.lerp(s.position, blend)
          object.quaternion.slerp(s.rotation, blend)
          object.scale.lerp(s.scale, blend)
        }
        wantedOpacity = target.opacity; accepted = true
      }
    }
  }
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
  for (const mesh of item.shadowCasters) mesh.castShadow = object.visible && item.alpha > TRACK.invisibleOpacity
  if (accepted && pose && camera instanceof THREE.PerspectiveCamera && wantedOpacity > 0) {
    item.occluders.update(pose, camera, item.projector, object, item.alpha, dt)
  } else item.occluders.hide()
}

function GarmentModel({ modelUrl, profile, targetsRef, onReady }: {
  modelUrl: string
  profile: Profile
  targetsRef: RefObject<Targets>
  onReady: () => void
}) {
  const { scene } = useGLTF(modelUrl)
  const instance = useMemo(() => createInstance(scene, profile), [scene, profile])
  const instanceRef = useRef(instance)
  useEffect(() => {
    instanceRef.current = instance
    onReady()
    return () => {
      for (const { material } of instance.materials) material.dispose()
      for (const skeleton of instance.skeletons) skeleton.dispose()
      instance.occluders.dispose()
      // Geometry/textures in the original GLTF remain owned by useGLTF's cache.
    }
  }, [instance, onReady])
  useFrame(({ camera, size }, delta) => {
    advanceInstance(instanceRef.current, profile, targetsRef.current[profile.axis], camera, size, delta)
  })
  return <>
    <primitive object={instance.occluders.root} dispose={null} />
    <primitive object={instance.root} dispose={null} />
  </>
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; onError: () => void }, { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <WebGLFallback onError={this.props.onError} /> : this.props.children
  }
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
  const targetsRef = useRef<Targets>({
    shoulders: { pose: null, opacity: 0 }, hips: { pose: null, opacity: 0 },
  })
  const [tracking, setTracking] = useState<Record<Axis, TrackingState>>({ shoulders: 'searching', hips: 'searching' })
  const [attempt, setAttempt] = useState(0)
  const profile = useMemo(() => resolveProfile(garment.category, garment.fit3D, garment.occlusion3D),
    [garment.category, garment.fit3D, garment.occlusion3D])
  const modelUrl = garment.modelUrl ?? DEFAULT_GARMENT_MODEL_URL
  // Configuration/category are part of the identity, even when a URL is reused.
  const requestKey = JSON.stringify([garment.id, modelUrl, profile, attempt])
  const [assetStatus, setAssetStatus] = useState<{ key: string; state: ModelState }>({ key: '', state: 'loading' })
  const activeRequestRef = useRef<string | null>(requestKey)
  useLayoutEffect(() => {
    activeRequestRef.current = requestKey
    return () => { if (activeRequestRef.current === requestKey) activeRequestRef.current = null }
  }, [requestKey])
  const onReady = useCallback(() => {
    if (activeRequestRef.current === requestKey) setAssetStatus({ key: requestKey, state: 'ready' })
  }, [requestKey])
  const onError = useCallback(() => {
    if (activeRequestRef.current === requestKey) setAssetStatus({ key: requestKey, state: 'error' })
  }, [requestKey])
  const modelState = assetStatus.key === requestKey ? assetStatus.state : 'loading'

  useEffect(() => {
    function makeTracker(axis: Axis) {
      let reported: TrackingState | undefined
      return createTracker(axis, (target, state) => {
        targetsRef.current[axis] = target
        if (reported !== state) {
          reported = state
          setTracking(previous => ({ ...previous, [axis]: state }))
        }
      })
    }
    // One subscription and one inference stream. Two independent acceptance
    // states prevent a shoulder observation being reused as a hip observation.
    const shoulders = makeTracker('shoulders'), hips = makeTracker('hips')
    shoulders.reset(); hips.reset()
    const unsubscribe = source.subscribe(frame => {
      const measured = measureFrame(frame)
      shoulders.push(measured); hips.push(measured)
    })
    const onVisibility = () => { if (document.hidden) { shoulders.reset(); hips.reset() } }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unsubscribe(); shoulders.dispose(); hips.dispose()
      targetsRef.current = { shoulders: { pose: null, opacity: 0 }, hips: { pose: null, opacity: 0 } }
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [source])
  function retry() { useGLTF.clear(modelUrl); setAttempt(value => value + 1) }
  const state = tracking[profile.axis]
  const message = modelState === 'error'
    ? `${garment.name}の3Dモデルを表示できません。GLBの配置とWebGLを確認してください。`
    : modelState === 'loading'
      ? '3Dモデルを読み込んでいます…'
      : state === 'tracking'
        ? `${garment.name} · 3D試着中`
        : state === 'turning'
          ? '正面に戻ると試着を再開します'
          : profile.axis === 'hips'
            ? '両腰を映し、少し静止してください'
            : '両肩を映し、少し静止してください'
  return <>
    <div className="pose-canvas garment-canvas" aria-label="試着する服"
      data-model-url={modelUrl} data-fit-axis={profile.axis}>
      <ModelErrorBoundary key={attempt} onError={onError}>
        <Canvas shadows
          camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 100 }}
          gl={{ alpha: true, antialias: true }} fallback={<WebGLFallback onError={onError} />}>
          <ambientLight intensity={1} />
          <directionalLight position={[0, 0, 5]} intensity={1.5} />
          <directionalLight position={[-5, 5, 2]} intensity={0.5} castShadow
            shadow-mapSize-width={1024} shadow-mapSize-height={1024}
            shadow-camera-near={0.1} shadow-camera-far={20}
            shadow-camera-left={-6} shadow-camera-right={6}
            shadow-camera-top={6} shadow-camera-bottom={-6}
            shadow-bias={-0.0003} shadow-normalBias={0.02} />
          <ModelErrorBoundary key={requestKey} onError={onError}>
            <Suspense fallback={null}>
              <GarmentModel modelUrl={modelUrl} profile={profile} targetsRef={targetsRef} onReady={onReady} />
            </Suspense>
          </ModelErrorBoundary>
        </Canvas>
      </ModelErrorBoundary>
    </div>
    <div className={`garment-feedback ${mirrored ? 'is-mirrored' : ''}`}>
      <p className="pose-message" role="status"
        style={{ maxWidth: '100%', boxSizing: 'border-box', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
        {message}
      </p>
      {modelState === 'error' && <button type="button" className="pose-retry" onClick={retry}>
        {'3Dモデルを再読み込み'}
      </button>}
    </div>
  </>
}
