import { useState } from 'react'
import Modal from './Modal'

/**
 * Hidden debug menu for pulling a scheduled note back out of its Durable
 * Object. Talks to the worker's Bearer-authenticated debug endpoints:
 *
 *   GET /api/dump?DO=<id>       -> { html, metadata, alarm }
 *   GET /api/harddelete?DO=<id> -> { result: true }
 *
 * `metadata` is the StoredData JSON string the DO persists ("note" options,
 * server, apikey, fromDate, userTimezone, compressed) and `alarm` is the
 * scheduled delivery time. The DO id is chosen by the worker when a note is
 * scheduled and never returned to the client, so it must be pasted in here.
 */

export type DumpedNote = {
  html: string
  metadata: string
  alarm: number | null
}

export type DumpMetadata = {
  note?: {
    title?: string
    notebookIds?: string[]
    tagIds?: string[]
    archived?: boolean
    readonly?: boolean
    pinned?: boolean
    favorite?: boolean
  }
  server?: string
  apikey?: string
  fromDate?: number
  userTimezone?: string
  compressed?: boolean
}

type DebugMenuProps = {
  onClose: () => void
  /** Applies the dumped note to the editor + sidebar state. */
  onLoad: (note: DumpedNote) => void
}

type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; dump: DumpedNote; metadata: DumpMetadata | null }
  | { phase: 'error'; message: string }

function describeError(err: unknown): string {
  if (err instanceof TypeError) {
    return 'Could not reach the scheduling service. Is the worker running?'
  }
  if (err instanceof Error) return err.message
  return String(err)
}

/** Fetches the debug dump with the given bearer secret. */
async function fetchDump(doId: string, secret: string): Promise<DumpedNote> {
  const response = await fetch(`/api/dump?DO=${encodeURIComponent(doId.trim())}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (response.status === 401) throw new Error('Unauthorized — the debug secret is wrong.')
  if (response.status === 503) throw new Error('Debug endpoints are disabled on this deployment (no DEBUG_AUTH_SECRET).')
  if (response.status === 429) throw new Error('Ratelimited by the worker — try again in about a minute.')
  if (!response.ok) throw new Error(`The worker rejected the request (${response.status}).`)
  const body = (await response.json()) as DumpedNote
  if (typeof body?.html !== 'string') throw new Error('The dump had no note content.')
  return body
}

/** Deletes the DO. Returns false when the worker refuses (e.g. ratelimit). */
async function deleteDo(doId: string, secret: string): Promise<boolean> {
  const response = await fetch(`/api/harddelete?DO=${encodeURIComponent(doId.trim())}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (response.status === 429) throw new Error('Ratelimited by the worker — try again in about a minute.')
  if (!response.ok) throw new Error(`The worker rejected the deletion (${response.status}).`)
  const body = (await response.json()) as { result?: boolean }
  return body.result === true
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return 'unknown'
  const date = new Date(timestamp)
  return `${date.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
}

function DebugMenu({ onClose, onLoad }: DebugMenuProps) {
  const [doId, setDoId] = useState('')
  const [secret, setSecret] = useState(sessionStorage.getItem('debugSecret') ?? '')
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')

  const loaded = loadState.phase === 'loaded' ? loadState : null
  const metadata = loaded?.metadata ?? null
  const note = metadata?.note
  const alarm = loaded?.dump.alarm ?? metadata?.fromDate

  async function handleFetch(): Promise<void> {
    if (!doId.trim() || !secret.trim()) return
    setLoadState({ phase: 'loading' })
    setConfirmingDelete(false)
    setDeleteMessage('')
    try {
      const dump = await fetchDump(doId, secret)
      let parsed: DumpMetadata | null = null
      try {
        parsed = JSON.parse(dump.metadata) as DumpMetadata
      } catch {
        // Keep raw view; metadata shape is not guaranteed across versions.
      }
      setLoadState({ phase: 'loaded', dump, metadata: parsed })
    } catch (err) {
      setLoadState({ phase: 'error', message: describeError(err) })
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    setDeleteMessage('')
    try {
      const deleted = await deleteDo(doId, secret)
      setDeleteMessage(deleted ? 'Durable Object deleted.' : 'The worker did not confirm deletion.')
    } catch (err) {
      setDeleteMessage(describeError(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal title="Debug: pull note from Durable Object" onClose={onClose} className="debug-modal">
      <div className="debug-body">
        <label className="debug-field">
          <span>Durable Object ID</span>
          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="32-character DO id"
            value={doId}
            onChange={(event) => setDoId(event.target.value)}
          />
        </label>
        <label className="debug-field">
          <span>Debug secret</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="DEBUG_AUTH_SECRET"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value)
              sessionStorage.setItem('debugSecret', event.target.value)
            }}
          />
        </label>

        <button type="button" className="debug-fetch" disabled={loadState.phase === 'loading' || !doId.trim() || !secret.trim()} onClick={() => void handleFetch()}>
          {loadState.phase === 'loading' ? 'Fetching…' : 'Pull from worker'}
        </button>

        {loadState.phase === 'error' && <p className="debug-error" role="alert">{loadState.message}</p>}

        {loaded && (
          <>
            <div className="debug-summary">
              <div><span className="debug-key">Title</span>{note?.title || <em>untitled</em>}</div>
              <div><span className="debug-key">Deliver at</span>{formatTimestamp(alarm)}</div>
              <div><span className="debug-key">Created</span>{formatTimestamp(metadata?.fromDate)}</div>
              <div><span className="debug-key">Server</span>{metadata?.server || 'default'}</div>
              <div><span className="debug-key">Attributes</span>{[
                note?.archived && 'archived',
                note?.readonly && 'readonly',
                note?.pinned && 'pinned',
                note?.favorite && 'favorite',
              ].filter(Boolean).join(', ') || 'none'}</div>
              <div><span className="debug-key">Tags</span>{note?.tagIds?.length ? note.tagIds.join(', ') : 'none'}</div>
              <div><span className="debug-key">Notebooks</span>{note?.notebookIds?.length ? note.notebookIds.join(', ') : 'none'}</div>
              <div><span className="debug-key">Content</span>{loaded.dump.html.length.toLocaleString()} chars</div>
            </div>

            <details className="debug-raw">
              <summary>Raw dump</summary>
              <pre>{JSON.stringify({ metadata: metadata ?? loaded.dump.metadata, alarm: loaded.dump.alarm }, null, 2)}</pre>
              <pre className="debug-raw-html">{loaded.dump.html}</pre>
            </details>

            <button type="button" className="debug-insert" onClick={() => onLoad(loaded.dump)}>
              Load into editor
            </button>

            {!confirmingDelete ? (
              <button type="button" className="debug-delete" onClick={() => setConfirmingDelete(true)}>
                Delete Durable Object…
              </button>
            ) : (
              <div className="debug-confirm-delete">
                <span>Permanently delete this DO (it will never deliver)?</span>
                <div className="debug-confirm-buttons">
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</button>
                  <button type="button" className="debug-delete-confirm" onClick={() => void handleDelete()} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
            {deleteMessage && <p className="debug-delete-status" role="status">{deleteMessage}</p>}
          </>
        )}
      </div>
    </Modal>
  )
}

export default DebugMenu
