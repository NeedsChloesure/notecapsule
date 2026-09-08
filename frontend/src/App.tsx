import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Flex } from '@theme-ui/components'
import { EmotionThemeProvider } from '@notesnook/theme'
import Sidebar from './components/Sidebar'
import NoteEditor from './components/NoteEditor'
import ThemeVariables from './components/ThemeVariables'
import { PrivacyPolicy, TermsOfService } from './pages/LegalPages'
import { clearEverything } from './utils/clearEverything'
import { prepareImageDataUrlForInsert, deleteAll } from './utils/imageStore'
import DebugMenu, { type DumpMetadata, type DumpedNote } from './components/DebugMenu'

function EditorApp() {
  const deadState = sessionStorage.getItem('hasUnsentChanges')
  const [editorKey, setEditorKey] = useState<number>(0)
  const [apiKey, setApiKey] = useState<string>(sessionStorage.getItem('apikey') ?? '')
  const [title, setTitle] = useState<string>(deadState ? sessionStorage.getItem('title') ?? '' : '')
  const [tags, setTags] = useState<string[]>(deadState ? JSON.parse(sessionStorage.getItem('tags') ?? '[]') : [])
  const [notebooks, setNotebooks] = useState<string[]>(deadState ? JSON.parse(sessionStorage.getItem('notebooks') ?? '[]') : [])
  const [noteAttributes, setNoteAttributes] = useState<boolean[]>(deadState ? JSON.parse(sessionStorage.getItem('noteAttributes') ?? '[false, false, false, false]') : [false, false, false, false])
  const [content, setContent] = useState<string>(deadState ? sessionStorage.getItem('note_content') ?? '<p></p>' : '<p></p>')
  const [server, setServer] = useState<string | undefined>(sessionStorage.getItem('server') ?? undefined)
  const [debugMenuOpen, setDebugMenuOpen] = useState(false)
  const initialEditorKey = useRef(editorKey)
  const didInitialize = useRef(false)

  // If this is a fresh session (no unsent draft), drop any leftover draft data
  // from a previous session. Runs once on mount so the state initializers above
  // have already read whatever was persisted before we clear it.
  useEffect(() => {
    if (didInitialize.current) return
    didInitialize.current = true

    if (!deadState) {
      void clearEverything({
        setContent,
        setEditorKey,
        setTags,
        setNotebooks,
        setTitle,
        setNoteAttributes,
        editorKey: initialEditorKey.current,
      })
    }
  }, [deadState])

  /**
   * Applies a note pulled from a Durable Object via the debug menu.
   * Mirrors how the editor loads a persisted draft: state first, then a
   * fresh editor keyed off it. Images arrive as inline data URLs (publish
   * time inlining strips their hashes), so each one is re-stored into
   * IndexedDB and swapped back to a hash reference to keep the document
   * light, exactly like a pasted image.
   */
  async function loadDumpedNote(dump: DumpedNote): Promise<void> {
    const metadata: DumpMetadata | null = (() => {
      try {
        return JSON.parse(dump.metadata) as DumpMetadata
      } catch {
        return null
      }
    })()

    // Replace whatever is in the editor with the dumped note. Reset the draft
    // state first — this wipes the image store, so it must complete before the
    // dumped images are re-stored below.
    clearEverything({
      setContent,
      setTitle,
      setTags,
      setNoteAttributes,
      setNotebooks,
      setEditorKey,
      editorKey,
      skipEditorRemount: true,
    })
    await deleteAll()
    const parser = new DOMParser()
    const doc = parser.parseFromString(dump.html, 'text/html')
    for (const image of Array.from(doc.querySelectorAll('img'))) {
      const src = image.getAttribute('src')
      if (!src?.startsWith('data:')) continue
      try {
        const attrs = await prepareImageDataUrlForInsert(src)
        image.removeAttribute('src')
        image.setAttribute('data-hash', attrs.hash)
        image.setAttribute('data-mime', attrs.mime)
        image.setAttribute('data-filename', attrs.filename)
        image.setAttribute('data-size', String(attrs.size))
        if (attrs.width) image.setAttribute('width', String(attrs.width))
        if (attrs.height) image.setAttribute('height', String(attrs.height))
        image.setAttribute('data-aspect-ratio', String(attrs.aspectRatio))
      } catch (err) {
        console.error('Failed to restore dumped image, keeping data URL', err)
      }
    }

    setTitle(metadata?.note?.title ?? '')
    sessionStorage.setItem('title', metadata?.note?.title ?? '')
    const tagIds = metadata?.note?.tagIds ?? []
    if (tagIds.length) {
      setTags(tagIds)
      sessionStorage.setItem('tags', JSON.stringify(tagIds))
    }
    const attributes = [
      metadata?.note?.archived ?? false,
      metadata?.note?.readonly ?? false,
      metadata?.note?.pinned ?? false,
      metadata?.note?.favorite ?? false,
    ]
    setNoteAttributes(attributes)
    sessionStorage.setItem('noteAttributes', JSON.stringify(attributes))
    const notebookIds = metadata?.note?.notebookIds ?? []
    if (notebookIds.length) {
      setNotebooks(notebookIds)
      sessionStorage.setItem('notebooks', JSON.stringify(notebookIds))
    }
    const html = doc.body.innerHTML
    setContent(html)
    sessionStorage.setItem('note_content', html)
    sessionStorage.setItem('hasUnsentChanges', '1')
    // Mount a fresh editor that picks up the dumped content in one go.
    setEditorKey(editorKey + 1)
    setDebugMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <Flex className="app-layout" sx={{ height: '100%', width: '100%' }}>
        <Sidebar
          onOpenDebugMenu={() => setDebugMenuOpen(true)}
          editorKey={editorKey}
          setEditorKey={setEditorKey}
          content={content}
          apiKey={apiKey}
          setApiKey={setApiKey}
          tags={tags}
          setNoteAttributes={setNoteAttributes}
          noteAttributes={noteAttributes}
          notebooks={notebooks}
          setNotebooks={setNotebooks}
          server={server}
          setServer={setServer}
          title={title}
          setTags={setTags}
          setTitle={setTitle}
          setContent={setContent}
        />
        <Flex className="note-workspace" sx={{ flex: 1, height: '100%', minWidth: 0 }}>
          <NoteEditor
            key={editorKey}
            content={content}
            onContentChange={setContent}
            title={title}
            setTitle={setTitle}
            tags={tags}
            setTags={setTags}
          />
        </Flex>
      </Flex>
      {debugMenuOpen && (
        <DebugMenu
          onClose={() => setDebugMenuOpen(false)}
          onLoad={(dump) => void loadDumpedNote(dump)}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <EmotionThemeProvider
      scope="base"
      sx={{ height: '100vh', width: '100vw', bg: 'background' }}
    >
      <ThemeVariables />
      <Routes>
        <Route path="/" element={<EditorApp />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </EmotionThemeProvider>
  )
}

export default App
