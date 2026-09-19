import { useEffect, useRef, useState } from 'react'
import type { PoseFrame, PoseSource } from '../pose/poseTypes'
import type { Garment } from '../wardrobe/garments'
import { drawGarment } from './garmentRenderer'

type GarmentState = 'loading' | 'waiting' | 'visible' | 'error'

export function GarmentOverlay({
  source,
  garment,
  mirrored,
}: {
  source: PoseSource
  garment: Garment
  mirrored: boolean
}) {
  const [attempt, setAttempt] = useState(0)
  return (
    <GarmentAttempt
      key={`${garment.id}:${attempt}`}
      source={source}
      garment={garment}
      mirrored={mirrored}
      retry={() => setAttempt((value) => value + 1)}
    />
  )
}

function GarmentAttempt({
  source,
  garment,
  mirrored,
  retry,
}: {
  source: PoseSource
  garment: Garment
  mirrored: boolean
  retry: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<GarmentState>('loading')
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    let disposed = false
    let ready = false
    let failed = false
    let latest: PoseFrame | null = null
    let lastState: GarmentState = 'loading'
    const image = new Image()
    const update = (next: GarmentState) => {
      if (!disposed && next !== lastState) {
        lastState = next
        setState(next)
      }
    }
    const clear = () => {
      if (canvas && context)
        context.clearRect(0, 0, canvas.width, canvas.height)
    }
    const fail = () => {
      if (!disposed) {
        failed = true
        clear()
        update('error')
      }
    }
    function render(frame: PoseFrame | null) {
      latest = frame
      if (disposed || failed || !canvas || !context) return
      if (!frame) {
        clear()
        if (ready) update('waiting')
        return
      }
      if (!ready) return
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }
      try {
        update(
          drawGarment(context, image, frame, garment) ? 'visible' : 'waiting',
        )
      } catch {
        fail()
      }
    }
    const unsubscribe = source.subscribe(render)
    // Decoding/rendering failures belong to this overlay, not the camera/model.
    image.src = garment.image
    void image
      .decode()
      .then(() => {
        if (disposed) return
        if (!context || !image.naturalWidth || !image.naturalHeight) {
          fail()
          return
        }
        ready = true
        update('waiting')
        render(latest)
      })
      .catch(fail)
    return () => {
      disposed = true
      unsubscribe()
      clear()
      image.src = ''
    }
  }, [source, garment])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pose-canvas garment-canvas"
        aria-label="試着する服"
      />
      <div className={`garment-feedback ${mirrored ? 'is-mirrored' : ''}`}>
        <p
          className={`pose-message ${state === 'error' ? 'pose-error' : ''}`}
          role="status"
        >
          {state === 'loading'
            ? '服を読み込んでいます…'
            : state === 'error'
              ? '服の画像を読み込めませんでした。'
              : state === 'visible'
                ? `${garment.name} · 試着中`
                : '服を表示するには、正面を向いて両肩と腰を映してください'}
        </p>
        {state === 'error' && (
          <button className="pose-retry" onClick={retry}>
            服の画像を再読み込み
          </button>
        )}
      </div>
    </>
  )
}
