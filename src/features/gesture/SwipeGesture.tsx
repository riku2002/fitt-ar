import { useEffect, useState } from 'react'
import type { PoseSource } from '../pose/poseTypes'
import { createSwipeDetector, type SwipeDirection } from './swipeDetector'

export function SwipeGesture({
  source,
  mirrored,
  resetKey,
  onSwipe,
}: {
  source: PoseSource
  mirrored: boolean
  resetKey: number
  onSwipe: (direction: SwipeDirection) => void
}) {
  const [message, setMessage] = useState('両肩と手首を画面に映してください')
  useEffect(() => {
    const detector = createSwipeDetector(mirrored)
    let lastMessage = ''
    let lastDirection: SwipeDirection | undefined
    return source.subscribe((frame) => {
      const { state, direction } = detector.push(frame)
      if (direction) {
        lastDirection = direction
        onSwipe(direction)
      }
      const next =
        state === 'searching'
          ? '両肩を画面に映してください'
          : state === 'hand-missing'
            ? '手首をカメラに見せてください'
            : state === 'cooldown'
              ? `${lastDirection === 'next' ? '← 次の服へ' : '前の服へ →'} · 手を少し止めると次の操作ができます`
              : state === 'ready'
                ? '手を横へスワイプ · ← 次の服 ／ 前の服 →'
                : '片手を胸の高さに上げてください'
      if (next !== lastMessage) {
        lastMessage = next
        setMessage(next)
      }
    })
  }, [source, mirrored, resetKey, onSwipe])
  return (
    <p className="gesture-status" role="status">
      {message}
    </p>
  )
}
