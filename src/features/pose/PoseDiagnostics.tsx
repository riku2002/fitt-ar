import { useEffect, useState } from 'react'
import type { PoseFrame, PoseSource } from './poseTypes'
import { POSE_TARGET_FPS } from './poseSession'

interface Metrics {
  fps: number | null
  ms: number | null
  backend: string
  left: number
  right: number
}

export function PoseDiagnostics({
  source,
  mirrored,
}: {
  source: PoseSource
  mirrored: boolean
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  useEffect(() => {
    let samples: PoseFrame[] = []
    let reported = -Infinity
    return source.subscribe((frame) => {
      if (!frame) {
        samples = []
        reported = -Infinity
        setMetrics(null)
        return
      }
      if (samples.length && frame.timestamp <= samples.at(-1)!.timestamp) return
      samples.push(frame)
      samples = samples.filter(
        (sample) => frame.timestamp - sample.timestamp <= 1000,
      )
      if (frame.timestamp - reported < 500) return
      reported = frame.timestamp
      const elapsed = frame.timestamp - samples[0].timestamp
      const durations = samples.flatMap((sample) =>
        Number.isFinite(sample.inferenceMs) ? [sample.inferenceMs!] : [],
      )
      const confidence = (index: number) =>
        Math.round(
          Math.min(
            frame.landmarks[index]?.visibility ?? 0,
            frame.landmarks[index]?.presence ?? 1,
          ) * 100,
        )
      setMetrics({
        fps: elapsed > 0 ? ((samples.length - 1) * 1000) / elapsed : null,
        ms: durations.length
          ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length
          : null,
        backend: frame.backend ?? '—',
        left: confidence(15),
        right: confidence(16),
      })
    })
  }, [source])
  return (
    <details className={`pose-diagnostics ${mirrored ? 'is-mirrored' : ''}`}>
      <summary>動作情報</summary>
      <div>
        <p>
          姿勢推定: {metrics?.fps?.toFixed(1) ?? '—'} FPS（目標{' '}
          {POSE_TARGET_FPS}）
        </p>
        <p>
          推定処理: {metrics?.ms?.toFixed(1) ?? '—'} ms /{' '}
          {metrics?.backend ?? '—'}
        </p>
        <p>
          手首の信頼度: 左 {metrics?.left ?? 0}% / 右 {metrics?.right ?? 0}%
        </p>
        <p>カメラ映像のFPSとは別の値です。</p>
        {metrics?.fps != null && metrics.fps < 8 && (
          <p>推定が遅いため、手を少しゆっくり動かしてください。</p>
        )}
      </div>
    </details>
  )
}
