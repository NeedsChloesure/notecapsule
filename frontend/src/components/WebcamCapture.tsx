import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@theme-ui/components'
import Modal from './Modal'
import { primaryButtonSx, sidebarButtonSx } from './buttonStyles'

type WebcamCaptureProps = {
  onCapture: (dataUrl: string) => void
  onClose: () => void
}

/**
 * Live webcam capture dialog. Requests camera access via getUserMedia, shows
 * a live preview, and lets the user capture a photo (with a retake step) that
 * is handed back to the caller as a JPEG data URL.
 *
 * The <video> element stays mounted for the whole dialog so the stream only
 * ever attaches once. When a photo is captured the live feed is dropped (the
 * camera is released) and Retake re-acquires it, which avoids leaving the
 * camera indicator on while the user reviews the photo.
 */
function WebcamCapture({ onCapture, onClose }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    if (streamRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch {
      setError(
        'Could not access the webcam. Check that a camera is connected and that camera access is allowed, then try again.',
      )
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCaptured(canvas.toDataURL('image/jpeg', 0.92))
    // Drop the live feed while the photo is reviewed; Retake re-acquires it.
    stopCamera()
  }

  function retake() {
    setCaptured(null)
    setError(null)
    void startCamera()
  }

  function usePhoto() {
    if (!captured) return
    onCapture(captured)
  }

  return (
    <Modal title="Take a photo with webcam" onClose={onClose}>
      <div className="capture-modal-body">
        {error ? (
          <p className="capture-error">{error}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              className="webcam-preview"
              muted
              playsInline
              autoPlay
              style={captured ? { display: 'none' } : undefined}
            />
            {captured && (
              <img
                className="webcam-captured"
                src={captured}
                alt="Captured photo"
              />
            )}
          </>
        )}
      </div>
      <div className="capture-modal-footer">
        {captured ? (
          <>
            <Button
              type="button"
              className="secondary-action"
              sx={{ ...sidebarButtonSx }}
              onClick={retake}
            >
              Retake
            </Button>
            <Button
              type="button"
              className="primary-action"
              sx={{ ...primaryButtonSx }}
              onClick={usePhoto}
            >
              Use photo
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="primary-action"
            sx={{ ...primaryButtonSx }}
            onClick={capturePhoto}
            disabled={!!error}
          >
            Capture
          </Button>
        )}
      </div>
    </Modal>
  )
}

export default WebcamCapture
