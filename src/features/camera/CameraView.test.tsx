import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraView } from './CameraView'
import { startPoseSession } from '../pose/poseSession'

vi.mock('../pose/poseSession', () => ({
  startPoseSession: vi.fn(() => vi.fn()),
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

beforeEach(() => {
  getUserMedia.mockReset()
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CameraView', () => {
  it('starts only on request, asks for video without audio, and releases on stop', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    render(
      <StrictMode>
        <CameraView />
      </StrictMode>,
    )
    expect(getUserMedia).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
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
      screen.getByLabelText('肩・肘・手首・腰の骨格表示').parentElement,
    ).toBe(video.parentElement)
    fireEvent.click(
      screen.getByRole('checkbox', { name: '鏡のように左右反転' }),
    )
    expect(video.parentElement).not.toHaveClass('is-mirrored')
    fireEvent.click(screen.getByRole('button', { name: 'カメラを停止' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    getUserMedia.mockResolvedValueOnce(fakeStream().stream)
    fireEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
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
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    fireEvent.click(screen.getByRole('button', { name: '接続をキャンセル' }))
    getUserMedia.mockResolvedValueOnce(current.stream)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
    await act(async () => {
      resolve(old.stream)
    })
    expect(old.track.stop).toHaveBeenCalledOnce()
    expect(current.track.stop).not.toHaveBeenCalled()
    expect(
      (screen.getByLabelText('カメラのライブ映像') as HTMLVideoElement)
        .srcObject,
    ).toBe(current.stream)
  })

  it('releases the camera on unmount', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const view = render(<CameraView />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
    view.unmount()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('starts pose only with a playing camera and disposes it on toggle and stop', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    render(<CameraView />)
    expect(startPoseSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
    expect(startPoseSession).toHaveBeenCalledOnce()
    const dispose = vi.mocked(startPoseSession).mock.results[0].value
    fireEvent.click(
      screen.getByRole('checkbox', { name: '姿勢推定・骨格表示' }),
    )
    expect(dispose).toHaveBeenCalledOnce()
    expect(
      screen.queryByLabelText('肩・肘・手首・腰の骨格表示'),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '姿勢推定・骨格表示' }),
    )
    expect(startPoseSession).toHaveBeenCalledTimes(2)
    const secondDispose = vi.mocked(startPoseSession).mock.results[1].value
    fireEvent.click(screen.getByRole('button', { name: 'カメラを停止' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '映像を再生できませんでした',
    )
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('shows recovery instructions when the device disconnects', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    render(<CameraView />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
    act(() => track.onended?.())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'カメラとの接続が切れました',
    )
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('stops when navigating away, including page cache navigation', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    render(<CameraView />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await screen.findByRole('button', { name: 'カメラを停止' })
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(track.stop).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('button', { name: 'カメラを起動' }),
    ).toBeInTheDocument()
  })

  it('explains insecure HTTP without requesting the camera', async () => {
    vi.stubGlobal('isSecureContext', false)
    render(<CameraView />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'HTTPS または http://localhost',
    )
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('explains unsupported browsers', async () => {
    vi.stubGlobal('navigator', {})
    render(<CameraView />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを起動' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Chrome の最新版'),
    )
  })
})
