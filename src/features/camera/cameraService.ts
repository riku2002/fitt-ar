export async function requestCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error(
      'HTTPS または http://localhost で開いてください。通常の HTTP ではカメラを利用できません。',
    )
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'このブラウザではカメラを利用できません。Chrome の最新版で開いてください。',
    )
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  })
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.onended = null
    track.stop()
  })
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'カメラへのアクセスが許可されていません。ブラウザのサイト設定と OS のカメラ権限を確認し、もう一度お試しください。'
      case 'NotFoundError':
        return 'カメラが見つかりません。カメラを接続して、もう一度お試しください。'
      case 'NotReadableError':
      case 'AbortError':
        return 'カメラを起動できませんでした。他のアプリで使用していないか、OS のカメラ設定を確認してください。'
      case 'OverconstrainedError':
        return 'このカメラでは映像を取得できません。別のカメラでお試しください。'
      default:
        return '映像を再生できませんでした。カメラの接続を確認して、もう一度お試しください。'
    }
  }
  return error instanceof Error
    ? error.message
    : 'カメラの起動に失敗しました。もう一度お試しください。'
}
