import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraView } from './CameraView'
import { startPoseSession } from '../pose/poseSession'
import { makeSwipeFrame } from '../../test/swipeFixture'
import * as wardrobe from '../wardrobe/garments'


// A stable three-product fixture for camera/gesture behavior; the real
// five-product catalog is covered by garments.test.ts and switching tests.
vi.mock('../wardrobe/garments', async (importOriginal) => {
  const original = await importOriginal<typeof import('../wardrobe/garments')>()
  return {
    ...original,
    garments: [
      { ...original.demoGarment, id: 'tshirt-gray', name: 'Tシャツ / Heather Gray', gender: 'unisex' as const },
      { ...original.demoGarment, id: 'tshirt-mint', name: 'Tシャツ / Mint Green', gender: 'men' as const },
      { ...original.demoGarment, id: 'tshirt-red', name: 'Tシャツ / Red', gender: 'women' as const },
    ],
  }
})

vi.mock('../pose/poseSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pose/poseSession')>()),
  startPoseSession: vi.fn(() => vi.fn()),
}))

/**
 * CameraView integration tests verify:
 * - camera lifecycle
 * - garment filtering/selection
 * - swipe integration
 * - shared PoseSession lifecycle
 *
 * They must not depend on WebGL, ResizeObserver, GLB loading or R3F rendering.
 * GarmentOverlay has its own dedicated tests for those responsibilities.
 *
 * Keep VirtualMirror real so SwipeGesture and the shared PoseSource remain
 * covered by these integration tests.
 */
vi.mock('../virtualTryOn/GarmentOverlay', () => ({
  GarmentOverlay: ({ garment }: { garment: { name: string } }) => (
    <div
      aria-label="試着する服"
      data-testid="garment-overlay-test-double"
    >
      <p role="status">{garment.name} · 試着中</p>
    </div>
  ),
}))

function fakeStream() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream

  return { stream, track }
}

const getUserMedia = vi.fn()

async function getPosePublisher() {
  await waitFor(() => {
    expect(startPoseSession).toHaveBeenCalled()
  })

  const call = vi.mocked(startPoseSession).mock.calls.at(-1)

  if (!call) {
    throw new Error('startPoseSession was not started')
  }

  return call[1].onFrame
}

beforeEach(() => {
  getUserMedia.mockReset()

  vi.stubGlobal('isSecureContext', true)

  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
    },
  })

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)

  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 800
      naturalHeight = 800
      decode = vi.fn().mockResolvedValue(undefined)
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CameraView', () => {
  it('cycles all three garments with buttons and selects thumbnails without starting the camera', () => {
    render(<CameraView />)

    expect(screen.getByRole('radio', { name: '全て' })).toBeChecked()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前の服' }))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次の服' }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    )

    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('filters thumbnails and buttons, keeping a matching selection or choosing the first match', () => {
    render(<CameraView />)

    fireEvent.click(screen.getByRole('radio', { name: '男性' }))

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('男女共用')).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: 'Tシャツ / Redを選ぶ',
      }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前の服' }))

    expect(
      screen.getByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '次の服' }))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    )

    fireEvent.click(screen.getByRole('radio', { name: '全て' }))

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('男性向け')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '女性' }))

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('男女共用')).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次の服' }))

    expect(screen.getByText('女性向け')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '全て' }))

    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Tシャツ / Redを選ぶ',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('cycles only matching garments by swipe in both directions without changing category or restarting inference', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    fireEvent.click(screen.getByRole('radio', { name: '女性' }))

    const publish = await getPosePublisher()

    const swipe = (time: number, xs: number[]) =>
      act(() => {
        publish(null)

        // Hold before each new swipe to re-arm the existing cooldown detector.
        if (time > 0) {
          for (const offset of [-320, -240, -160, -80]) {
            publish(makeSwipeFrame(time + offset, xs[0]))
          }
        }

        xs.forEach((x, i) => {
          publish(makeSwipeFrame(time + i * 80, x))
        })
      })

    swipe(0, [-0.5, -0.2, 0.1, 0.4])

    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Tシャツ / Redを選ぶ',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    expect(
      await screen.findByText('Tシャツ / Red · 試着中'),
    ).toBeInTheDocument()

    swipe(1600, [-0.5, -0.2, 0.1, 0.4])

    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    expect(
      await screen.findByText('Tシャツ / Heather Gray · 試着中'),
    ).toBeInTheDocument()

    swipe(3200, [0.4, 0.1, -0.2, -0.5])

    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    expect(screen.getByRole('radio', { name: '女性' })).toBeChecked()

    expect(
      screen.queryByRole('button', {
        name: 'Tシャツ / Mint Greenを選ぶ',
      }),
    ).not.toBeInTheDocument()

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(startPoseSession).toHaveBeenCalledOnce()
  })

  it('discards partial swipes when changing category', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    const publish = await getPosePublisher()

    act(() =>
      [-0.5, -0.2, 0.1].forEach((x, i) => {
        publish(makeSwipeFrame(i * 80, x))
      }),
    )

    fireEvent.click(screen.getByRole('radio', { name: '女性' }))

    act(() => {
      publish(makeSwipeFrame(240, 0.4))
    })

    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    act(() =>
      [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => {
        publish(makeSwipeFrame(1600 + i * 80, x))
      }),
    )

    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(startPoseSession).toHaveBeenCalledOnce()
  })

  it('removes the previous overlay for an empty category and recovers without restarting inference', async () => {
    const originalFilter = wardrobe.filterGarments

    vi.spyOn(wardrobe, 'filterGarments').mockImplementation(
      (catalog, filter) =>
        filter === 'men' ? [] : originalFilter(catalog, filter),
    )

    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    expect(screen.getByLabelText('試着する服')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '男性' }))

    expect(
      screen.getByText(/このカテゴリの服はまだありません/),
    ).toBeInTheDocument()

    expect(
      screen.queryByLabelText('試着する服'),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('checkbox', {
        name: '手のスワイプで切り替え',
      }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: '全て' }))

    expect(screen.getByLabelText('試着する服')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    expect(startPoseSession).toHaveBeenCalledOnce()
    expect(getUserMedia).toHaveBeenCalledOnce()
  })

  it('switches once from shared wrist frames without restarting inference, and honors gesture OFF', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    const publish = await getPosePublisher()

    act(() =>
      [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => {
        publish(makeSwipeFrame(i * 80, x))
      }),
    )

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText(/← 次の服へ/)).toBeInTheDocument()

    act(() =>
      [0.4, 0.1, -0.2, -0.5].forEach((x, i) => {
        publish(makeSwipeFrame(320 + i * 80, x))
      }),
    )

    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '手のスワイプで切り替え',
      }),
    )

    act(() =>
      [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => {
        publish(makeSwipeFrame(1600 + i * 80, x))
      }),
    )

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(startPoseSession).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('試着する服')).toBeInTheDocument()
  })

  it('clears partial swipes on manual selection and mirror changes', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    const publish = await getPosePublisher()

    act(() =>
      [-0.5, -0.2, 0.1].forEach((x, i) => {
        publish(makeSwipeFrame(i * 80, x))
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '次の服' }))

    act(() => {
      publish(makeSwipeFrame(240, 0.4))
    })

    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    act(() =>
      [-0.5, -0.2, 0.1].forEach((x, i) => {
        publish(makeSwipeFrame(400 + i * 80, x))
      }),
    )

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '鏡のように左右反転',
      }),
    )

    act(() => {
      publish(makeSwipeFrame(640, 0.4))
    })

    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    act(() =>
      [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => {
        publish(makeSwipeFrame(800 + i * 80, x))
      }),
    )

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(startPoseSession).toHaveBeenCalledOnce()
  })

  it('starts only on request, asks for video without audio, and releases on stop', async () => {
    const { stream, track } = fakeStream()

    getUserMedia.mockResolvedValue(stream)

    render(
      <StrictMode>
        <CameraView />
      </StrictMode>,
    )

    expect(getUserMedia).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    const video = screen.getByLabelText(
      'カメラのライブ映像',
    ) as HTMLVideoElement

    expect(video.srcObject).toBe(stream)
    expect(video.muted).toBe(true)
    expect(video.parentElement).toHaveClass('is-mirrored')

    expect(
      screen.getByRole('checkbox', {
        name: '骨格を表示',
      }),
    ).not.toBeChecked()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '骨格を表示',
      }),
    )

    expect(
      screen.getByLabelText('肩・肘・手首・腰の骨格表示').parentElement,
    ).toBe(video.parentElement)

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '鏡のように左右反転',
      }),
    )

    expect(video.parentElement).not.toHaveClass('is-mirrored')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを停止',
      }),
    )

    expect(track.stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
  })

  it.each([
    ['NotAllowedError', 'カメラへのアクセスが許可されていません'],
    ['NotFoundError', 'カメラが見つかりません'],
    ['NotReadableError', 'カメラを起動できませんでした'],
  ])('explains %s and allows retry', async (name, message) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('', name))

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(message)

    getUserMedia.mockResolvedValueOnce(fakeStream().stream)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'もう一度試す',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('releases a stream if permission arrives after cancellation and preserves a newer request', async () => {
    let resolve!: (stream: MediaStream) => void

    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((done) => {
        resolve = done
      }),
    )

    const old = fakeStream()
    const current = fakeStream()

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '接続をキャンセル',
      }),
    )

    getUserMedia.mockResolvedValueOnce(current.stream)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    await act(async () => {
      resolve(old.stream)
    })

    expect(old.track.stop).toHaveBeenCalledOnce()
    expect(current.track.stop).not.toHaveBeenCalled()

    expect(
      (screen.getByLabelText(
        'カメラのライブ映像',
      ) as HTMLVideoElement).srcObject,
    ).toBe(current.stream)
  })

  it('releases the camera on unmount', async () => {
    const { stream, track } = fakeStream()

    getUserMedia.mockResolvedValue(stream)

    const view = render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    view.unmount()

    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('shares a session across overlay toggles and stops only when both are off or camera stops', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)

    render(<CameraView />)

    expect(startPoseSession).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    expect(startPoseSession).toHaveBeenCalledOnce()

    const dispose = vi.mocked(startPoseSession).mock.results[0].value

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '骨格を表示',
      }),
    )

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '骨格を表示',
      }),
    )

    expect(dispose).not.toHaveBeenCalled()

    expect(
      screen.queryByLabelText('肩・肘・手首・腰の骨格表示'),
    ).not.toBeInTheDocument()

    expect(screen.getByLabelText('試着する服')).toBeInTheDocument()
    expect(startPoseSession).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Tシャツを表示',
      }),
    )

    expect(dispose).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Tシャツを表示',
      }),
    )

    expect(startPoseSession).toHaveBeenCalledTimes(2)

    const secondDispose =
      vi.mocked(startPoseSession).mock.results[1].value

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを停止',
      }),
    )

    expect(secondDispose).toHaveBeenCalledOnce()
  })

  it('releases a stream granted after unmount', async () => {
    let resolve!: (stream: MediaStream) => void

    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((done) => {
        resolve = done
      }),
    )

    const { stream, track } = fakeStream()

    const view = render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    view.unmount()

    await act(async () => {
      resolve(stream)
    })

    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('releases the camera when playback fails', async () => {
    const { stream, track } = fakeStream()

    getUserMedia.mockResolvedValue(stream)

    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('', 'NotSupportedError'),
    )

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '映像を再生できませんでした',
    )

    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('shows recovery instructions when the device disconnects', async () => {
    const { stream, track } = fakeStream()

    getUserMedia.mockResolvedValue(stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    act(() => {
      track.onended?.()
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'カメラとの接続が切れました',
    )

    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('stops when navigating away, including page cache navigation', async () => {
    const { stream, track } = fakeStream()

    getUserMedia.mockResolvedValue(stream)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await screen.findByRole('button', {
      name: 'カメラを停止',
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(track.stop).toHaveBeenCalledOnce()

    expect(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    ).toBeInTheDocument()
  })

  it('explains insecure HTTP without requesting the camera', async () => {
    vi.stubGlobal('isSecureContext', false)

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'HTTPS または http://localhost',
    )

    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('explains unsupported browsers', async () => {
    vi.stubGlobal('navigator', {})

    render(<CameraView />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'カメラを起動',
      }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Chrome の最新版',
      ),
    )
  })
})
