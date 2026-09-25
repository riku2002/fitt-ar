import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei' // 追加：3Dモデル読み込み用
import * as THREE from 'three'
import type { PoseFrame, PoseSource } from '../pose/poseTypes'
import type { Garment } from '../wardrobe/garments'

type GarmentState = 'loading' | 'waiting' | 'visible' | 'error'

// --- 3Dモデルを制御するコンポーネント ---
function GarmentModel({ latestFrameRef }: { latestFrameRef: React.MutableRefObject<PoseFrame | null> }) {
  const groupRef = useRef<THREE.Group>(null)
  const { viewport } = useThree()
  
  // public/garments/tshirt.glb を読み込む（ファイル名に合わせて変更してください）
  const { scene } = useGLTF('/garments/tshirt.glb')

  useFrame(() => {
    const frame = latestFrameRef.current
    const group = groupRef.current
    if (!frame || !group) return

    const leftShoulder = frame.landmarks[11]
    const rightShoulder = frame.landmarks[12]
    if (!leftShoulder || !rightShoulder) return

    // 【1】横を向いたときの貫通対策：画面上での肩幅を計算
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x)
    // 肩幅が極端に狭くなった場合（横を向いた場合）は服を隠す（0.08は適宜調整してください）
    if (shoulderWidth < 0.08) {
      group.visible = false
      return
    } else {
      group.visible = true
    }

    const midX = (leftShoulder.x + rightShoulder.x) / 2
    const midY = (leftShoulder.y + rightShoulder.y) / 2
    const threeX = (midX - 0.5) * viewport.width
    const threeY = -(midY - 0.5) * viewport.height

    group.position.set(threeX, threeY - 1.5, 0)

    // 【2】TSエラー対策： (any) で型エラーを回避しつつ安全にZ座標を取得
    const lz = (leftShoulder as any).z || 0
    const rz = (rightShoulder as any).z || 0
    const depthDiff = lz - rz

    // 体のひねり（Y軸回転）
    const yawAngle = Math.asin(Math.max(-1, Math.min(1, depthDiff * 2.0)))
    group.rotation.y = yawAngle

    // 肩の傾き（Z軸回転）
    const angle = Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x)
    group.rotation.z = -angle + Math.PI

    const scale = 0.05
    group.scale.set(scale, scale, scale)
  })

  return (
    <group ref={groupRef}>
      {/* primitiveタグで、読み込んだ本物の3Dモデルを表示 */}
      <primitive object={scene} />
    </group>
  )
}

// --- メインのオーバーレイコンポーネント ---
export function GarmentOverlay({
  source,
  garment,
  mirrored,
}: {
  source: PoseSource
  garment: Garment
  mirrored: boolean
}) {
  const [state, setState] = useState<GarmentState>('waiting')
  const latestFrameRef = useRef<PoseFrame | null>(null)

  useEffect(() => {
    const unsubscribe = source.subscribe((frame) => {
      latestFrameRef.current = frame
      if (frame) {
        setState('visible')
      } else {
        setState('waiting')
      }
    })
    return () => unsubscribe()
  }, [source])

  return (
    <>
      <div className="pose-canvas garment-canvas" style={{ pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }} alpha={true}>
          {/* 光を強めに当てて、服のシワや質感を出しやすくします */}
          <ambientLight intensity={1.0} />
          <directionalLight position={[0, 0, 5]} intensity={1.5} />
          <directionalLight position={[-5, 5, 2]} intensity={0.5} />
          
          {/* 3Dモデルのロード中はエラーにならないよう Suspense で囲む */}
          <Suspense fallback={null}>
            <GarmentModel latestFrameRef={latestFrameRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className={`garment-feedback ${mirrored ? 'is-mirrored' : ''}`}>
        <p className="pose-message" role="status">
          {state === 'waiting'
            ? '服を表示するには、正面を向いて両肩と腰を映してください'
            : `${garment.name} · 3D試着中`}
        </p>
      </div>
    </>
  )
}