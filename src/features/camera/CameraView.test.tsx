import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Garment } from '../wardrobe/garments'
import { CameraView } from './CameraView'
import { startPoseSession } from '../pose/poseSession'
import { makeSwipeFrame } from '../../test/swipeFixture'

vi.mock('../wardrobe/garments', async (importOriginal) => {
  const original = await importOriginal<typeof import('../wardrobe/garments')>()
  return { ...original, garments: [
    { ...original.demoGarment, id: 'top-a', name: 'Top A', category: 'tshirt', gender: 'unisex' },
    { ...original.demoGarment, id: 'top-b', name: 'Top B', category: 'shirt', gender: 'men' },
    { ...original.demoGarment, id: 'pants', name: 'Pants', category: 'bottoms', gender: 'unisex' },
    { ...original.demoGarment, id: 'skirt', name: 'Skirt', category: 'bottoms', gender: 'women' },
    { ...original.demoGarment, id: 'dress', name: 'Dress', category: 'onepiece', gender: 'women' },
  ] }
})
vi.mock('../pose/poseSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pose/poseSession')>()),
  startPoseSession: vi.fn(() => vi.fn()),
}))
vi.mock('../virtualTryOn/GarmentOverlay', () => ({
  GarmentOverlay: ({ garments }: { garments: readonly Garment[] }) => (
    <div aria-label="試着する服" data-testid="outfit-renderer">
      {garments.map(item => <span key={item.id} data-testid="worn-garment">{item.name}</span>)}
    </div>
  ),
}))

function fakeStream() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null }
  const stream = {
    getTracks: () => [track], getVideoTracks: () => [track],
  } as unknown as MediaStream
  return { stream, track }
}
const getUserMedia = vi.fn()
async function getPosePublisher() {
  await waitFor(() => expect(startPoseSession).toHaveBeenCalled())
  const call = vi.mocked(startPoseSession).mock.calls.at(-1)
  if (!call) throw new Error('Missing pose session')
  return call[1].onFrame
}
function tab(name: string) { fireEvent.click(screen.getByRole('tab', { name })) }
function choose(name: string) { fireEvent.click(screen.getByRole('button', { name: `${name}を選ぶ` })) }
function worn() { return screen.queryAllByTestId('worn-garment').map(node => node.textContent) }
async function start() {
  getUserMedia.mockResolvedValue(fakeStream().stream)
  render(<CameraView />)
  fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
  await screen.findByRole('button', { name: 'カメラを停止' })
  return getPosePublisher()
}

beforeEach(() => {
  getUserMedia.mockReset()
  vi.mocked(startPoseSession).mockClear()
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CameraView', () => {
  it('browses only focused candidates without opening the camera', () => {
    render(<CameraView />)
    expect(screen.getByRole('tab', { name: 'トップス' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pantsを選ぶ' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '次の服' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('keeps tops and bottoms independent and does not equip by merely focusing a tab', async () => {
    await start()
    expect(worn()).toEqual(['Top A'])
    tab('ボトムス')
    expect(worn()).toEqual(['Top A'])
    choose('Pants')
    expect(worn()).toEqual(['Top A', 'Pants'])
    choose('Skirt')
    expect(worn()).toEqual(['Top A', 'Skirt'])
    tab('トップス')
    choose('Top B')
    expect(worn()).toEqual(['Top B', 'Skirt'])
    expect(startPoseSession).toHaveBeenCalledOnce()
    expect(getUserMedia).toHaveBeenCalledOnce()
  })

  it('makes onepiece exclusive and leaves it on until another garment is selected', async () => {
    await start()
    tab('ボトムス'); choose('Pants')
    tab('ワンピース')
    expect(worn()).toEqual(['Top A', 'Pants'])
    choose('Dress')
    expect(worn()).toEqual(['Dress'])
    tab('トップス')
    expect(worn()).toEqual(['Dress'])
    choose('Top A')
    expect(worn()).toEqual(['Top A'])
    expect(startPoseSession).toHaveBeenCalledOnce()
  })

  it('filters browsing candidates without undressing an already worn item', async () => {
    await start()
    choose('Top B')
    fireEvent.click(screen.getByRole('radio', { name: '女性' }))
    expect(worn()).toEqual(['Top B'])
    expect(screen.queryByRole('button', { name: 'Top Bを選ぶ' })).not.toBeInTheDocument()
    choose('Top A')
    expect(worn()).toEqual(['Top A'])
    tab('ワンピース')
    fireEvent.click(screen.getByRole('radio', { name: '男性' }))
    expect(screen.getByText(/このカテゴリの服はまだありません/)).toBeInTheDocument()
    expect(worn()).toEqual(['Top A'])
  })

  it('routes real swipes to the currently focused slot only', async () => {
    const publish = await start()
    act(() => [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => publish(makeSwipeFrame(i * 80, x))))
    expect(worn()).toEqual(['Top B'])
    tab('ボトムス')
    act(() => [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => publish(makeSwipeFrame(1000 + i * 80, x))))
    expect(worn()).toEqual(['Top B', 'Pants'])
    fireEvent.click(screen.getByRole('checkbox', { name: '手のスワイプで切り替え' }))
    act(() => [-0.5, -0.2, 0.1, 0.4].forEach((x, i) => publish(makeSwipeFrame(3000 + i * 80, x))))
    expect(worn()).toEqual(['Top B', 'Pants'])
    expect(startPoseSession).toHaveBeenCalledOnce()
  })

  it('discards partial gestures on focus changes', async () => {
    const publish = await start()
    act(() => [-0.5, -0.2, 0.1].forEach((x, i) => publish(makeSwipeFrame(i * 80, x))))
    tab('ボトムス')
    act(() => publish(makeSwipeFrame(240, 0.4)))
    expect(worn()).toEqual(['Top A'])
  })

  it('removes individual slots without restarting the session and can equip again', async () => {
    await start()
    tab('ボトムス'); choose('Pants')
    fireEvent.click(screen.getByRole('button', { name: 'Top Aを外す' }))
    expect(worn()).toEqual(['Pants'])
    fireEvent.click(screen.getByRole('button', { name: 'Pantsを外す' }))
    expect(worn()).toEqual([])
    choose('Pants')
    expect(worn()).toEqual(['Pants'])
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

    await waitFor(() => expect(startPoseSession).toHaveBeenCalledOnce())

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
        name: '服を表示',
      }),
    )

    expect(dispose).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '服を表示',
      }),
    )

    await waitFor(() => expect(startPoseSession).toHaveBeenCalledTimes(2))

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
