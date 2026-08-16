import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Flex } from '@theme-ui/components'
import { EmotionThemeProvider } from '@notesnook/theme'
import Sidebar from './components/Sidebar'
import NoteEditor from './components/NoteEditor'
import ThemeVariables from './components/ThemeVariables'
import { PrivacyPolicy, TermsOfService } from './pages/LegalPages'
import { clearEverything } from './utils/clearEverything'

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

  return (
    <div className="app-shell">
      <Flex className="app-layout" sx={{ height: '100%', width: '100%' }}>
        <Sidebar
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
