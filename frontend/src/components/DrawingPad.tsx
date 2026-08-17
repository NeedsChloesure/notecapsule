import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@theme-ui/components'
import Modal from './Modal'
import { primaryButtonSx, sidebarButtonSx } from './buttonStyles'

type DrawingPadProps = {
  /** Optional image (data URL) to load as the base layer, e.g. when editing an existing note image. */
  initialImageDataUrl?: string
  onSave: (dataUrl: string) => void
  onClose: () => void
}

const DEFAULT_WIDTH = 900
const DEFAULT_HEIGHT = 600
// Safety cap for the longest side when editing a very large image, so we never
// try to allocate a pathological canvas. Well above any real-world note image.
const MAX_SIDE = 8192
// Rough memory budget for the undo history (canvas bytes per frame).
const HISTORY_BUDGET = 128 * 1024 * 1024
const MAX_HISTORY = 30

/**
 * In-browser drawing pad. The canvas always has a white base layer (so the
 * exported PNG flattens to a white sheet), strokes are drawn on top, and the
 * eraser simply paints white. Supports color, brush size, eraser, undo/redo,
 * clear, and inserting an image to draw over.
 *
 * When editing an existing note image (`initialImageDataUrl`), the canvas is
 * sized to that image's own resolution so the flattened result keeps its
 * dimensions and aspect ratio — no white borders from letterboxing.
 */
function DrawingPad({ initialImageDataUrl, onSave, onClose }: DrawingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const undoStackRef = useRef<ImageData[]>([])
  const redoStackRef = useRef<ImageData[]>([])

  // For a fresh drawing we start at the default size; when editing an existing
  // image we wait until its intrinsic size is known before rendering the canvas.
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(
    initialImageDataUrl ? null : { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  )
  const [color, setColor] = useState('#1f1f1f')
  const [brushSize, setBrushSize] = useState(4)
  const [isEraser, setIsEraser] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const getContext = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null
  }, [])

  const getImageData = useCallback((): ImageData | null => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return null
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [getContext])

  const putImageData = useCallback(
    (data: ImageData) => {
      const ctx = getContext()
      if (!ctx) return
      ctx.putImageData(data, 0, 0)
    },
    [getContext],
  )

  /** Snapshot the current canvas onto the undo stack (called at the start of each stroke). */
  const pushHistory = useCallback(() => {
    const data = getImageData()
    if (!data) return
    const canvas = canvasRef.current
    const bytesPerFrame = canvas ? canvas.width * canvas.height * 4 : 1
    const maxHistory = Math.max(
      1,
      Math.min(MAX_HISTORY, Math.floor(HISTORY_BUDGET / bytesPerFrame)),
    )
    undoStackRef.current.push(data)
    if (undoStackRef.current.length > maxHistory) undoStackRef.current.shift()
    setCanUndo(true)
    setCanRedo(false)
  }, [getImageData])

  const undo = useCallback(() => {
    const current = getImageData()
    const previous = undoStackRef.current.pop()
    if (!previous) return
    if (current) redoStackRef.current.push(current)
    putImageData(previous)
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
  }, [getImageData, putImageData])

  const redo = useCallback(() => {
    const current = getImageData()
    const next = redoStackRef.current.pop()
    if (!next) return
    if (current) undoStackRef.current.push(current)
    putImageData(next)
    setCanRedo(redoStackRef.current.length > 0)
    setCanUndo(true)
  }, [getImageData, putImageData])

  // When editing an existing image, read its intrinsic dimensions and size the
  // canvas to match (so resolution/aspect ratio are preserved, no white borders).
  useEffect(() => {
    if (!initialImageDataUrl) return
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(
        1,
        MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
      )
      setCanvasSize({
        width: Math.round(img.naturalWidth * scale),
        height: Math.round(img.naturalHeight * scale),
      })
    }
    img.src = initialImageDataUrl
  }, [initialImageDataUrl])

  // Draw the white base + starting image once the canvas size is known. Runs
  // again if the canvas is resized (which clears it), so the base is redrawn.
  useEffect(() => {
    if (!canvasSize) return
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (initialImageDataUrl) {
      const img = new Image()
      img.onload = () => {
        // Fill the canvas exactly (cover), so there are no white borders.
        const scale = Math.max(
          canvas.width / img.naturalWidth,
          canvas.height / img.naturalHeight,
        )
        const width = img.naturalWidth * scale
        const height = img.naturalHeight * scale
        ctx.drawImage(
          img,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height,
        )
        pushHistory()
      }
      img.src = initialImageDataUrl
    } else {
      pushHistory()
    }
  }, [canvasSize, initialImageDataUrl, getContext, pushHistory])

  function getCanvasPoint(event: React.PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  function handlePointerDown(event: React.PointerEvent) {
    const point = getCanvasPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = point
    pushHistory()
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drawingRef.current) return
    const point = getCanvasPoint(event)
    const last = lastPointRef.current
    const ctx = getContext()
    if (!point || !last || !ctx) return

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = isEraser ? '#ffffff' : color
    ctx.lineWidth = isEraser ? brushSize * 3 : brushSize
    ctx.globalCompositeOperation = 'source-over'
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    lastPointRef.current = point
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function pickImageForCanvas() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const img = new Image()
        img.onload = () => {
          const canvas = canvasRef.current
          const ctx = getContext()
          if (!canvas || !ctx) return
          const scale = Math.min(
            canvas.width / img.naturalWidth,
            canvas.height / img.naturalHeight,
          ) * 0.9
          const width = img.naturalWidth * scale
          const height = img.naturalHeight * scale
          ctx.drawImage(
            img,
            (canvas.width - width) / 2,
            (canvas.height - height) / 2,
            width,
            height,
          )
          pushHistory()
        }
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    pushHistory()
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <Modal title="Draw a sketch" onClose={onClose}>
      <div className="drawing-toolbar">
        <label className="drawing-tool drawing-color" title="Brush color">
          <input
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value)
              setIsEraser(false)
            }}
          />
        </label>
        <label className="drawing-tool" title="Brush size">
          <input
            type="range"
            min={1}
            max={40}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
          <span className="drawing-brush-size">{brushSize}px</span>
        </label>
        <button
          type="button"
          className={`drawing-tool-button${isEraser ? ' active' : ''}`}
          onClick={() => setIsEraser((v) => !v)}
          title="Eraser"
        >
          Eraser
        </button>
        <button
          type="button"
          className="drawing-tool-button"
          onClick={pickImageForCanvas}
          title="Insert an image to draw over"
        >
          Insert image
        </button>
        <button
          type="button"
          className="drawing-tool-button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          Undo
        </button>
        <button
          type="button"
          className="drawing-tool-button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo"
        >
          Redo
        </button>
        <button
          type="button"
          className="drawing-tool-button"
          onClick={clearCanvas}
          title="Clear canvas"
        >
          Clear
        </button>
      </div>
      <div className="capture-modal-body drawing-body">
        {canvasSize && (
          <canvas
            ref={canvasRef}
            className="drawing-canvas"
            width={canvasSize.width}
            height={canvasSize.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        )}
      </div>
      <div className="capture-modal-footer">
        <Button
          type="button"
          className="secondary-action"
          sx={{ ...sidebarButtonSx }}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="primary-action"
          sx={{ ...primaryButtonSx }}
          onClick={save}
        >
          Insert drawing
        </Button>
      </div>
    </Modal>
  )
}

export default DrawingPad
