import { useEffect, useRef } from 'react'
import { drawPose } from './poseGeometry'
import type { PoseSource } from './poseTypes'

/** Skeleton is a consumer of shared inference, never an owner of the model. */
export function PoseOverlay({ source }: { source: PoseSource }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const unsubscribe = source.subscribe((frame) => {
      if (!frame) {
        context.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }
      drawPose(context, frame.landmarks, frame.width, frame.height)
    })
    return () => {
      unsubscribe()
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [source])
  return (
    <canvas
      ref={canvasRef}
      className="pose-canvas"
      aria-label="肩・肘・手首・腰の骨格表示"
    />
  )
}
