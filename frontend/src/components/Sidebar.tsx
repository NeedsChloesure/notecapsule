import { Box, Button, Flex, IconButton, Input, Text } from '@theme-ui/components'
import { Link } from 'react-router'
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { clearEverything } from '../utils/clearEverything.js'
import { getImage } from '../utils/imageStore.js'
import { primaryButtonSx, sidebarButtonSx } from './buttonStyles'

const DEFAULT_API_SERVER = 'https://api.notesnook.com'

const attributeLabels = ['Archived', 'Readonly', 'Pinned', 'Favorited'] as const

type SidebarProps = {
  editorKey: number
  setEditorKey: Dispatch<SetStateAction<number>>
  title: string
  tags: string[]
  noteAttributes: boolean[]
  setNoteAttributes: Dispatch<SetStateAction<boolean[]>>
  notebooks: string[]
  setNotebooks: Dispatch<SetStateAction<string[]>>
  apiKey: string
  setApiKey: Dispatch<SetStateAction<string>>
  server?: string
  setServer: Dispatch<SetStateAction<string | undefined>>
  content: string
  setTitle: Dispatch<SetStateAction<string>>
  setTags: Dispatch<SetStateAction<string[]>>
  setContent: Dispatch<SetStateAction<string>>
}

type NoteOptions = {
	notebookIds?: string[],
	tagIds?: string[],
	archived?: boolean,
	readonly?: boolean,
	pinned?: boolean,
	favorite?: boolean,
	title: string
}

type UserOptions = {
	note: NoteOptions,
	server?: string,
	apikey: string,
}

type UserData = {
	options: UserOptions,
	content: string,
	toDate: number,
}

function normalizeServer(server: string | undefined): string {
  if (server) {
    return (server.trim()).replace(/\/+$/, '')
  }
  return (DEFAULT_API_SERVER).replace(/\/+$/, '')
}

const toDateTimeLocal = (timestamp: number) => {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function describeSendError(status: number, statusText: string): string {
  switch (status) {
    case 401:
      return 'The API key was rejected. Check that it is valid and try again.'
    case 413:
      return 'The note is too large to schedule. Try removing or shrinking large images.'
    case 429:
      return 'You have been ratelimited. Try again in about a minute.'
    default:
      return statusText || `The note could not be scheduled (${status}).`
  }
}

function Sidebar({
  editorKey,
  setEditorKey,
  title,
  noteAttributes,
  setNoteAttributes,
  notebooks,
  setNotebooks,
  apiKey,
  setApiKey,
  tags,
  server,
  setServer,
  content,
  setTitle,
  setTags,
  setContent,
}: SidebarProps) {
  const [canProceed, setProceed] = useState(false)
  const [notebookInput, setNotebookInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [sendToDate, setDate] = useState(0)

  async function validateKey(): Promise<void> {
    if (!apiKey.trim()) {
      setProceed(false)
      setStatusMessage('Enter an Inbox API key first.')
      return
    }

    setStatusMessage('Validating API key…')
    try {
      const apiServer = normalizeServer(server)
      // we validate the key on the worker instead of in the client
      // in order to ensure that:
      // - the worker can connect to the server.
      // - what we send as the server is correct.
      const result = await fetch(`/api/key`, {
        method: "POST",
        body: JSON.stringify({server: apiServer, apikey: apiKey})
        //headers: { Authorization: apiKey.trim() },
      })
      if (!result.ok) {
        setProceed(false)
        setStatusMessage('The API key could not be validated.')
        return
      }
      setStatusMessage("Key was validated")
      setProceed(true)
      setTimeout(() => setStatusMessage(''), 3000)
    } catch(err) {
      setProceed(false)
      console.error(err)
      setStatusMessage("Unable to reach Notecapsule's backend server to validate the key.")
    }
  }

  function updateServer(value: string): void {
    setServer(value)
    sessionStorage.setItem('server', value)
    setProceed(false)
  }

  function updateApiKey(value: string): void {
    setApiKey(value)
    sessionStorage.setItem('apikey', value)
    setProceed(false)
  }

  function updateAttribute(index: number, value: boolean): void {
    const nextAttributes = [...noteAttributes]
    nextAttributes[index] = value
    setNoteAttributes(nextAttributes)
    sessionStorage.setItem('noteAttributes', JSON.stringify(nextAttributes))
  }

  function addNotebook(): void {
    const notebookId = notebookInput.trim()
    if (!notebookId || notebooks.includes(notebookId)) return

    const nextNotebooks = [...notebooks, notebookId]
    setNotebooks(nextNotebooks)
    sessionStorage.setItem('notebooks', JSON.stringify(nextNotebooks))
    setNotebookInput('')
  }

  function removeNotebook(notebookId: string): void {
    const nextNotebooks = notebooks.filter((notebook) => notebook !== notebookId)
    setNotebooks(nextNotebooks)
    sessionStorage.setItem('notebooks', JSON.stringify(nextNotebooks))
  }

  async function sendNote(): Promise<void> {
    if (!title.trim()) {
      setStatusMessage("A title is required to send your note.")
      return
    }
    if (!sendToDate) {
      setStatusMessage("You must schedule a date to send your note.")
      return
    }

    setIsSending(true)
    setStatusMessage("Sending...")
    try {
      const publishedContent = await alterHTMLForPublishing(content)
      const payload: UserData = {
        options: {
          apikey: apiKey.trim(),
          note: {
            title: title,
            tagIds: (tags.length ? tags : undefined),
            notebookIds: (notebooks.length ? notebooks : undefined),
            archived: noteAttributes[0] ? true : undefined, // if false, don't include it.
            readonly: noteAttributes[1] ? true : undefined,
            pinned: noteAttributes[2] ? true : undefined,
            favorite: noteAttributes[3] ? true : undefined
          },
          server: (server ? normalizeServer(server) : undefined)
        },
        content: publishedContent,
        toDate: sendToDate
      }

      const string = JSON.stringify(payload)
      const response = await fetch("/api", {
        headers: {'Content-Type': "application/json"},
        body: string,
        method: "POST"
      })
      if (response.ok) {
        setStatusMessage("Sent")
        clearEverything({ setContent, setTitle, setTags, setNoteAttributes, setNotebooks, editorKey, setEditorKey })
        setTimeout(() => {setStatusMessage('')}, 3000)
      } else {
        setStatusMessage(describeSendError(response.status, response.statusText))
      }
    } catch(err) {
      setStatusMessage('Unable to reach the scheduling service. Check your connection and try again. More details can be found in dev tools.')
      console.error(err)
    } finally {
      setIsSending(false)
      //setStatusMessage("Sent")
      //clearEverything({ setContent, setTitle, setTags, setNoteAttributes, setNotebooks, editorKey, setEditorKey })
    }
  }

  return (
    <Flex
      as="nav"
      className="app-sidebar"
      sx={{
        flexDirection: 'column',
        width: '300px',
        flexShrink: 0,
        height: '100%',
        borderRight: '1px solid',
        borderColor: 'border',
        bg: 'background-secondary',
        overflowY: 'auto',
      }}
    >
      <Flex className="sidebar-header" sx={{ alignItems: 'center', gap: 3 }}>
        <Box>
          <Text className="brand-name">NoteCapsule</Text>
          <Text className="brand-headline">Schedule a note for the future.</Text>
        </Box>
      </Flex>
      <Box className="sidebar-content" sx={{ px: 3, py: 3 }}>
        <Text className="sidebar-heading"
          sx={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: 'paragraph',
          }}
        >
          Delivery settings
        </Text>
        <Text className="sidebar-subheading">Choose where and when this note should arrive.</Text>
        <label className="form-label" htmlFor="api-key">Inbox API key</label>
        <Input
          id="api-key"
          className="app-input"
          type="password"
          placeholder="Inbox API key"
          autoComplete="off"
          data-lpignore="true"
          data-bwignore
          data-1p-ignore
          data-form-type="other"
          onChange={(event) => updateApiKey(event.target.value)}
          value={apiKey}
        />
        <Box sx={{ minHeight: '5px' }} />
        <Button
          type="button"
          onClick={() => void validateKey()}
          disabled={!apiKey.trim()}
          className="primary-action"
          sx={{ ...primaryButtonSx, width: '100%' }}
          style={canProceed ? {display: "none"} : {}}
        >
          {canProceed ? '' : 'Validate Key'}
        </Button>
        <Text className="status-message" role="status" aria-live="polite" sx={{ display: 'block', mt: 2, fontSize: '13px' }}>
          {statusMessage}
        </Text>

        <details className="advanced-settings">
          <summary>Advanced settings</summary>
          <Box className="advanced-settings-content">
            <label className="form-label" htmlFor="server">API server</label>
            <Input
              id="server"
              className="app-input"
              placeholder={DEFAULT_API_SERVER}
              onChange={(event) => updateServer(event.target.value)}
              value={server ?? ''}
            />
            <Text style={{ fontSize: '12px' }}>
              You only have to change this setting if you do <i>not</i> use
              the official Notesnook servers.
            </Text>
          </Box>
        </details>

        {canProceed && (
          <Box className="options-panel" as="section" aria-label="Note options" sx={{ mt: 3 }}>
            <Text className="options-title" sx={{ fontWeight: 'bold', mb: 2 }}>Note attributes</Text>
            {attributeLabels.map((label, index) => (
              <label className="attribute-option" key={label} htmlFor={`attribute-${label.toLowerCase()}`} style={{ display: 'block', marginBottom: '8px' }}>
                <input
                  id={`attribute-${label.toLowerCase()}`}
                  type="checkbox"
                  checked={noteAttributes[index] ?? false}
                  onChange={(event) => updateAttribute(index, event.target.checked)}
                />{' '}
                {label}
              </label>
            ))}

            <Text className="options-title" sx={{ fontWeight: 'bold', mt: 3, mb: 2 }}>Notebooks</Text>
            <Flex sx={{ gap: 1, alignItems: 'center' }}>
              <Input
                id="notebook-id"
                className="app-input"
                placeholder="Paste notebook ID"
                value={notebookInput}
                onChange={(event) => setNotebookInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addNotebook()
                  }
                }}
              />
              <Button
                type="button"
                onClick={addNotebook}
                disabled={!notebookInput.trim()}
                className="secondary-action"
                sx={{ ...sidebarButtonSx, flexShrink: 0, px: 2 }}
              >
                Add
              </Button>
            </Flex>
            {notebooks.length > 0 && (
              <Box className="id-list" as="ul" sx={{ pl: 3, mb: 0 }}>
                {notebooks.map((notebookId) => (
                  <li key={notebookId}>
                    <Flex sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Text sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{notebookId}</Text>
                      <IconButton
                        type="button"
                        onClick={() => removeNotebook(notebookId)}
                        aria-label={`Remove notebook ${notebookId}`}
                        size={24}
                        sx={{
                          flexShrink: 0,
                          color: 'paragraph',
                          borderRadius: '50%',
                          '&:hover': { bg: 'background' },
                        }}
                      >
                        ×
                      </IconButton>
                    </Flex>
                  </li>
                ))}
              </Box>
            )}

            <Text className="options-title" sx={{ fontWeight: 'bold', mt: 3, mb: 2 }}>Send at</Text>

            <input
              className="date-input"
              type="datetime-local"
              min={toDateTimeLocal(Date.now())}
              onChange={(e) => {setDate(new Date(e.target.value).getTime()); console.log(sendToDate)}}
            />

            <Button
              type="button"
              onClick={() => void sendNote()}
              disabled={isSending}
              className="primary-action"
              sx={{ ...primaryButtonSx, width: '100%', mt: 3 }}
            >
              {isSending ? 'Sending…' : 'Send Note'}
            </Button>
          </Box>
        )}
      </Box>
      <Box className="sidebar-footer">
        <Text className="sidebar-footer-copy">
          By using NoteCapsule, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </Text>
        <Text className="sidebar-footer-copy sidebar-footer-affiliation">
          NoteCapsule is an independent community project and is not affiliated with or endorsed by Notesnook or Streetwriters (Private) Ltd.
        </Text>
        <Text className='sidebar-footer-copy'>NoteCapsule is opensource software, find more information <Link to="https://github.com/needschloesure/notecapsule">here.</Link></Text>
      </Box>
    </Flex>
  )
}

async function alterHTMLForPublishing(content: string): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')
  const images = doc.querySelectorAll('img')
  for (const image of images) {
    const hash = image.dataset?.hash
    if (hash !== undefined) {
      const data = await getImage(hash)
      if (!data) {
        image.remove()
        continue
      }
      image.src = data
      image.removeAttribute("data-hash") // remove hash since the client will supply its own on receipt.
      continue
    }

    // No hash: the image entered the document outside the normal flow and
    // wasn't migrated to IndexedDB when it was inserted. Keep an inline data
    // URL rather than dropping the image; it is never re-stored here because
    // IndexedDB is cleared right after a successful publish.
    const src = image.getAttribute('src')
    if (src && src.startsWith('data:')) {
      continue
    }

    image.remove()
  }
  return doc.body.innerHTML
}

export default Sidebar
