import { useEffect, useState } from 'react'
import type { PoseSource } from '../pose/poseTypes'
import {
  createSwipeDetector,
  type SwipeDirection,
} from './swipeDetector'
import { createFocusToggleDetector } from './focusToggleDetector'

export function SwipeGesture({
  source,
  mirrored,
  resetKey,
  canSwipe,
  onSwipe,
  onToggleFocus,
}: {
  source: PoseSource
  mirrored: boolean
  resetKey: number
  canSwipe: boolean
  onSwipe: (direction: SwipeDirection) => void
  onToggleFocus: () => void
}) {
  const [message, setMessage] = useState(
    '片手を横へスワイプで服変更 · 両手を肩より上でキープするとトップス／ボトムス切替',
  )

  useEffect(() => {
    const swipeDetector = createSwipeDetector(mirrored)
    const focusDetector = createFocusToggleDetector()

    let lastMessage = ''
    let lastDirection: SwipeDirection | undefined
    let justToggledFocus = false

    return source.subscribe((frame) => {
      const focus = focusDetector.push(frame)

      if (focus.toggle) {
        justToggledFocus = true
        onToggleFocus()
      }

      const swipe =
        canSwipe && !focus.blockSwipe
          ? swipeDetector.push(frame)
          : swipeDetector.push(null)

      if (swipe.direction) {
        lastDirection = swipe.direction
        onSwipe(swipe.direction)
      }

      let next: string

      if (focus.state === 'holding') {
        const percent = Math.round(focus.progress * 100)
        next = `両手を上げたままキープ… ${percent}% · トップス／ボトムス切替`
      } else if (focus.state === 'wait-release') {
        next = justToggledFocus
          ? '操作対象を切り替えました · 両手を肩より下げると次の操作ができます'
          : '両手を肩より下げるとジェスチャーを準備できます'
      } else if (!canSwipe) {
        justToggledFocus = false
        next = '両手を肩より上で約0.7秒キープ · トップス／ボトムス切替'
      } else {
        justToggledFocus = false

        next =
          swipe.state === 'searching'
            ? '両肩を画面に映してください'
            : swipe.state === 'hand-missing'
              ? '手首をカメラに見せてください'
              : swipe.state === 'cooldown'
                ? `${lastDirection === 'next' ? '← 次の服へ' : '前の服へ →'} · 手を少し止めると次の操作ができます`
                : swipe.state === 'ready'
                  ? '片手を横へスワイプで服変更 · 両手上げでトップス／ボトムス切替'
                  : '片手を胸の高さに上げてください · 両手上げでスロット切替'
      }

      if (next !== lastMessage) {
        lastMessage = next
        setMessage(next)
      }
    })
  }, [source, mirrored, resetKey, canSwipe, onSwipe, onToggleFocus])

  return (
    <p className="gesture-status" role="status">
      {message}
    </p>
  )
}
