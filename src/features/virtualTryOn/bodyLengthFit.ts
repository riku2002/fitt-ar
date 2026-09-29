import type { PoseFrame, PosePoint } from '../pose/poseTypes'

/** Calibrate only from two visible, straight legs, never from a squat. */
export function standingAnkleCenter(frame: PoseFrame): { x: number; y: number } | null {
  const { width, height, landmarks } = frame
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  function reliable(p: PosePoint | undefined): p is PosePoint {
    return !!p && [p.x, p.y, p.z, p.visibility, p.presence ?? 1].every(Number.isFinite) &&
      p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 &&
      p.visibility >= 0.75 && p.visibility <= 1 && (p.presence ?? 1) >= 0.75 && (p.presence ?? 1) <= 1
  }
  const points = [23, 24, 25, 26, 27, 28].map(i => landmarks[i])
  if (!points.every(reliable)) return null
  const [lh, rh, lk, rk, la, ra] = points
  const hipWidth = Math.hypot((lh.x - rh.x) * width, (lh.y - rh.y) * height)
  if (hipWidth < 1) return null
  function length(hip: PosePoint, knee: PosePoint, ankle: PosePoint): number | null {
    const tx = (knee.x - hip.x) * width, ty = (knee.y - hip.y) * height
    const sx = (ankle.x - knee.x) * width, sy = (ankle.y - knee.y) * height
    const thigh = Math.hypot(tx, ty), shin = Math.hypot(sx, sy)
    if (ty <= 0 || sy <= 0 || thigh < hipWidth * 0.4 || shin < hipWidth * 0.4 ||
        (tx * sx + ty * sy) / (thigh * shin) < 0.94 ||
        Math.abs(ankle.z - hip.z) * width > hipWidth ||
        Math.abs(knee.z - hip.z) * width > hipWidth) return null
    return Math.hypot(tx + sx, ty + sy)
  }
  const left = length(lh, lk, la), right = length(rh, rk, ra)
  if (left === null || right === null || Math.min(left, right) / Math.max(left, right) < 0.8 ||
      Math.abs(la.x - ra.x) * width > hipWidth * 1.8) return null
  return { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 }
}
