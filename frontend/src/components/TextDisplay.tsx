import type { ReactNode } from 'react'
import { Link } from 'react-router'

type TextDisplayProps = {
  title: ReactNode
  description?: ReactNode
  updatedAt?: ReactNode
  content: ReactNode
}

function TextDisplay({ title, description, updatedAt, content }: TextDisplayProps) {
  return (
    <div className="text-display-shell">
      <header className="text-display-header">
        <Link className="text-display-brand" to="/">
          NoteCapsule
        </Link>
        <nav className="text-display-nav" aria-label="Legal navigation">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </header>

      <main className="text-display-main">
        <article className="text-display-card">
          <p className="text-display-eyebrow">NoteCapsule policies</p>
          <h1>{title}</h1>
          {description && <p className="text-display-description">{description}</p>}
          {updatedAt && <p className="text-display-updated">{updatedAt}</p>}
          <div className="text-display-content">{content}</div>
        </article>
      </main>

      <footer className="text-display-footer">
        <span>NoteCapsule</span>
        <span aria-hidden="true">·</span>
        <Link to="/terms">Terms of Service</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  )
}

export default TextDisplay
