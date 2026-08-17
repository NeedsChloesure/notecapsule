import { useEffect } from 'react'
import type { ReactNode } from 'react'

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Simple overlay modal used by the webcam + drawing capture dialogs.
 * Styled with the app's CSS variables so it matches the active theme.
 */
function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="capture-modal-backdrop" onMouseDown={onClose}>
      <div
        className="capture-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="capture-modal-header">
          <span className="capture-modal-title">{title}</span>
          <button
            type="button"
            className="capture-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
