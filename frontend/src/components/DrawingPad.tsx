import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@theme-ui/components'
import {
  DrawSurface,
  PEN_BY_ID,
  Toolbar,
  toPng as drawesomeToPng,
  useDrawing,
} from 'drawesome'
import type { Board, PenId, ToolId, ToolState } from 'drawesome'
import 'drawesome/styles.css'
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
// Board cap. Drawesome rasterizes strokes at 2x, and mobile Safari refuses
// canvases larger than ~16.7M pixels, so 2048x2048 keeps every export inside
// the limits (4096x4096 device pixels at 2x).
const MAX_SIDE = 2048
// Cap for the exported composite when editing a large image (the old pad's
// limit): the board fits the dialog, but the export keeps the image's own
// resolution up to this size.
const MAX_EXPORT_SIDE = 8192
// Body padding, subtracted when measuring the space available for the stage.
const BODY_PADDING = 16
// Vertical space the toolbar row below the drawing takes (MorphBar is 84px
// tall + the gap), reserved so the board fit leaves room for it.
const TOOLBAR_RESERVE = 104

const PEN_IDS: PenId[] = ['pen', 'pencil', 'marker', 'highlighter', 'fountain']

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

/** Largest board with the given aspect ratio that fits the available space. */
function fitBoard(
  width: number,
  height: number,
  available: { w: number; h: number },
): Board {
  const scale = Math.min(
    1,
    MAX_SIDE / Math.max(width, height),
    available.w / width,
    available.h / height,
  )
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * In-browser drawing pad built on Drawesome (https://github.com/benjitaylor/drawesome).
 *
 * Unlike Drawesome's all-in-one `Draw`, the pieces are laid out by hand here:
 * the `DrawSurface` (ink layer) sits exactly over the base image, while the
 * `Toolbar` is a normal row *below* the drawing. A floating bar inside the
 * surface would be clipped by narrow boards (portrait images), and the bar
 * must never cover the image being drawn on.
 *
 * Drawesome keeps the drawing as vector strokes and erases with SVG masks, so
 * erasing takes away *area* rather than painting white — which is what makes
 * drawing over an existing image possible: the eraser rubs strokes off the
 * ink layer without ever touching the image underneath.
 *
 * Fresh drawings start on opaque white paper; the Background toggle switches
 * to a transparent canvas (checkerboard shows through, the exported PNG keeps
 * its alpha channel). "Insert image" resizes the board to the image's own
 * dimensions and uses it as the base layer. When editing an existing note
 * image (`initialImageDataUrl`), the board is sized to that image's
 * resolution so the flattened result keeps its dimensions and aspect ratio.
 */
function DrawingPad({ initialImageDataUrl, onSave, onClose }: DrawingPadProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // Space the dialog offers the drawing, measured once on mount.
  const [available, setAvailable] = useState<{ w: number; h: number } | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [baseImage, setBaseImage] = useState<string | undefined>(initialImageDataUrl)
  const [transparent, setTransparent] = useState(false)

  // Drawesome's "auto" theme forces dark color-scheme styling regardless of
  // the OS setting, so pick the theme explicitly.
  const [theme] = useState<'light' | 'dark'>(
    () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  const startingInk = theme === 'dark' ? '#f2f1ef' : '#111111'

  // The drawing state + tool selection, mirroring what Drawesome's own `Draw`
  // component wires up internally (shared ink + per-tool size memory).
  const drawing = useDrawing([])
  const [tool, setTool] = useState<ToolState>({
    active: 'pen',
    color: startingInk,
    size: PEN_BY_ID.pen.defaultSize,
    opacity: PEN_BY_ID.pen.defaultOpacity,
    eraserSize: 28,
  })
  const [ink, setInk] = useState(startingInk)
  const tunedRef = useRef<Record<string, { size: number; opacity: number }>>({})
  const pens = useMemo(() => PEN_IDS.map((id) => PEN_BY_ID[id]), [])

  const select = useCallback(
    (id: ToolId) => {
      if (id === 'eraser') return setTool((t) => ({ ...t, active: 'eraser' }))
      const preset = PEN_BY_ID[id]
      const last = tunedRef.current[id]
      setTool((t) => ({
        ...t,
        active: id,
        size: last?.size ?? preset.defaultSize,
        opacity: last?.opacity ?? preset.defaultOpacity,
        color: ink,
      }))
    },
    [ink],
  )

  const patch = useCallback((p: Partial<ToolState>) => {
    setTool((t) => {
      if (p.color && t.active !== 'eraser') setInk(p.color)
      if ((p.size !== undefined || p.opacity !== undefined) && t.active !== 'eraser') {
        tunedRef.current[t.active] = {
          size: p.size ?? t.size,
          opacity: p.opacity ?? t.opacity,
        }
      }
      return { ...t, ...p }
    })
  }, [])

  const nudgeSize = useCallback((delta: number) => {
    setTool((t) => {
      if (t.active === 'eraser') {
        return { ...t, eraserSize: Math.max(1, Math.min(120, t.eraserSize + delta)) }
      }
      const size = Math.max(1, Math.min(80, t.size + delta))
      tunedRef.current[t.active] = { size, opacity: t.opacity }
      return { ...t, size }
    })
  }, [])

  // Single-key shortcuts, same as `Draw` provides (scoped to the dialog).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onKey = (event: KeyboardEvent) => {
      if (!root.contains(document.activeElement) && document.activeElement !== document.body) {
        return
      }
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (meta && key === 'z') {
        event.preventDefault()
        return event.shiftKey ? drawing.redo() : drawing.undo()
      }
      if (meta && key === 'y') {
        event.preventDefault()
        return drawing.redo()
      }
      if (meta) return
      if (key === 'e') return select('eraser')
      if (key === '[') return nudgeSize(-1)
      if (key === ']') return nudgeSize(1)
      const pen = pens.find((p) => p.key === key)
      if (pen) select(pen.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing, select, nudgeSize, pens])

  const surfaceTool = useMemo(
    () =>
      tool.active === 'eraser'
        ? { kind: 'eraser' as const, size: tool.eraserSize }
        : {
            kind: 'pen' as const,
            pen: tool.active,
            color: tool.color,
            size: tool.size,
            opacity: tool.opacity,
          },
    [tool],
  )

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || available) return
    setAvailable({
      w: Math.max(200, body.clientWidth - BODY_PADDING * 2),
      h: Math.max(150, body.clientHeight - BODY_PADDING * 2 - TOOLBAR_RESERVE),
    })
  }, [available])

  // Fresh drawing: adopt the default size, shrunk to fit if needed.
  useEffect(() => {
    if (initialImageDataUrl || !available || board) return
    setBoard(fitBoard(DEFAULT_WIDTH, DEFAULT_HEIGHT, available))
  }, [initialImageDataUrl, available, board])

  // Editing an existing image: size the board to its intrinsic dimensions so
  // resolution/aspect ratio are preserved. Waits for the measurement so the
  // board also fits the dialog.
  useEffect(() => {
    if (!initialImageDataUrl || !available) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setBoard(fitBoard(img.naturalWidth, img.naturalHeight, available))
    }
    img.src = initialImageDataUrl
    return () => {
      cancelled = true
    }
  }, [initialImageDataUrl, available])

  // Strokes live in board coordinates; when the board changes (insert image),
  // they must not carry over.
  useEffect(() => {
    if (!board) return
    drawing.reset([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.w, board?.h])

  const insertImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !available) return
      if (drawing.strokes.length > 0 && !window.confirm('Replace the current drawing with this image?')) {
        return
      }
      const dataUrl = await blobToDataUrl(file)
      const img = await loadImage(dataUrl)
      setBaseImage(dataUrl)
      setBoard(fitBoard(img.naturalWidth, img.naturalHeight, available))
    }
    input.click()
  }, [available, drawing])

  /**
   * Rasterize the strokes (Drawesome's own toPng — vector, so any scale is
   * crisp) and, when needed, composite them over the base image. The export
   * matches the base image's own resolution when there is one, so editing
   * never throws away quality; fresh drawings export at 2x for crispness.
   */
  const exportPng = useCallback(async (): Promise<string> => {
    if (!board) throw new Error('Drawing board is not ready')

    // Target export dimensions and the stroke rasterization scale that
    // reaches them from board coordinates.
    let target = { w: board.w * 2, h: board.h * 2 }
    if (baseImage) {
      const base = await loadImage(baseImage)
      const scale = Math.min(
        1,
        MAX_EXPORT_SIDE / Math.max(base.naturalWidth, base.naturalHeight),
      )
      target = {
        w: Math.round(base.naturalWidth * scale),
        h: Math.round(base.naturalHeight * scale),
      }
    }
    const inkScale = target.w / board.w

    const blob = await drawesomeToPng(
      drawing.strokes,
      board.w,
      board.h,
      // null paints no background: a transparent PNG.
      baseImage || transparent ? null : '#ffffff',
      inkScale,
    )

    // Fresh drawing on the paper background comes straight out of Drawesome.
    if (!baseImage && !transparent) return blobToDataUrl(blob)

    const ink = await loadImage(URL.createObjectURL(blob))
    const canvas = document.createElement('canvas')
    canvas.width = target.w
    canvas.height = target.h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    if (baseImage) {
      const base = await loadImage(baseImage)
      // The board has the image's aspect ratio, so this is a 1:1 draw at
      // native resolution; cover-fit anyway so a rounding difference can
      // never leave a gap.
      const scale = Math.max(target.w / base.naturalWidth, target.h / base.naturalHeight)
      ctx.drawImage(
        base,
        (target.w - base.naturalWidth * scale) / 2,
        (target.h - base.naturalHeight * scale) / 2,
        base.naturalWidth * scale,
        base.naturalHeight * scale,
      )
    }

    // The strokes PNG was rasterized at exactly the target size.
    ctx.drawImage(ink, 0, 0, target.w, target.h)
    URL.revokeObjectURL(ink.src)
    return canvas.toDataURL('image/png')
  }, [board, baseImage, transparent, drawing])

  const handleSave = useCallback(async () => {
    try {
      onSave(await exportPng())
    } catch (err) {
      console.error('Failed to export drawing', err)
    }
  }, [exportPng, onSave])

  const hasStrokes = drawing.strokes.length > 0

  return (
    <Modal
      title={initialImageDataUrl ? 'Edit image' : 'Draw a sketch'}
      onClose={onClose}
      className="drawing-modal"
    >
      <div className="capture-modal-body drawing-body" ref={bodyRef}>
        <div ref={rootRef} className="drawing-root">
          {board && (
            <>
              <div
                className="sd drawing-stage"
                style={{ width: board.w, height: board.h }}
                data-theme={theme}
                data-transparent={(!baseImage && transparent) || undefined}
              >
                {baseImage && (
                  <img
                    className="drawing-base-image"
                    src={baseImage}
                    alt=""
                    draggable={false}
                  />
                )}
                <DrawSurface
                  drawing={drawing}
                  board={board}
                  background={baseImage || transparent ? 'transparent' : '#ffffff'}
                  tool={surfaceTool}
                  className="drawing-surface"
                />
              </div>
              {/* The toolbar lives below the drawing, out of the way of both
                  the image and narrow boards that would clip a floating bar.
                  `sd` + data-theme carry Drawesome's design tokens. */}
              <div className="sd drawing-bar" data-theme={theme}>
                <Toolbar
                  tool={tool}
                  inkFor={() => ink}
                  pens={pens}
                  onSelect={select}
                  onChange={patch}
                  canUndo={drawing.canUndo}
                  canRedo={drawing.canRedo}
                  onUndo={drawing.undo}
                  onRedo={drawing.redo}
                  onClear={drawing.clear}
                  hasStrokes={hasStrokes}
                  controls={{ minimize: false }}
                  gauge
                  theme={theme}
                />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="drawing-footer">
        {!initialImageDataUrl && (
          <button
            type="button"
            className="drawing-tool-button"
            onClick={insertImage}
            title="Insert an image to draw over"
          >
            Insert image
          </button>
        )}
        {!initialImageDataUrl && !baseImage && (
          <button
            type="button"
            className="drawing-tool-button"
            onClick={() => setTransparent((v) => !v)}
            title={
              transparent
                ? 'Switch back to a white sheet (the PNG will have no transparency)'
                : 'Draw on a transparent canvas (the PNG keeps its alpha channel)'
            }
          >
            {transparent ? 'White background' : 'Transparent background'}
          </button>
        )}
        <div className="capture-modal-footer drawing-footer-actions">
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
            onClick={handleSave}
            disabled={!hasStrokes && !initialImageDataUrl}
          >
            Insert drawing
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default DrawingPad
