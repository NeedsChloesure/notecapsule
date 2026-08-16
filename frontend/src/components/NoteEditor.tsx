import { useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  useTiptap,
  Toolbar,
  getDefaultPresets,
  type Editor,
  type TiptapOptions,
} from '@notesnook/editor'
import { TextSelection } from '@tiptap/pm/state'
import { EmotionThemeProvider } from '@notesnook/theme'
import { Flex, Box, Input, Text } from '@theme-ui/components'
import { prepareImageForInsert, prepareImageDataUrlForInsert, getImage } from '../utils/imageStore'

import '@notesnook/editor/styles/styles.css'
import '@notesnook/editor/styles/katex.min.css'
import '@notesnook/editor/styles/katex-fonts.css'
import '@notesnook/editor/styles/fonts.css'

const toolbarTools = getDefaultPresets().default
const NEWLINE = String.fromCharCode(10)

function findAncestorDepth(editor: Editor, nodeName: string): number | undefined {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) return depth
  }
  return undefined
}

function isAtEndOfAncestor(editor: Editor, depth: number): boolean {
  const { $from } = editor.state.selection
  return $from.pos >= $from.end(depth) - 1
}

function exitTable(editor: Editor, tableDepth: number): boolean {
  const { state } = editor
  const { $from } = state.selection
  const tablePosition = $from.before(tableDepth)
  const tableNode = $from.node(tableDepth)
  const afterTablePosition = tablePosition + tableNode.nodeSize
  const transaction = state.tr

  // A table at the end of the document needs a paragraph to give the cursor
  // somewhere valid to go. If a following block already exists, reuse it.
  if (!state.doc.nodeAt(afterTablePosition)) {
    transaction.insert(afterTablePosition, state.schema.nodes.paragraph.create())
  }

  transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(afterTablePosition + 1), 1),
  )
  editor.view.dispatch(transaction.scrollIntoView())
  editor.view.focus()
  return true
}

function exitCodeBlock(editor: Editor, trailingNewlineCount = 0): boolean {
  const chain = editor.chain()
  if (trailingNewlineCount > 0) {
    const { $from } = editor.state.selection
    chain.deleteRange({
      from: $from.pos - trailingNewlineCount,
      to: $from.pos,
    })
  }
  return chain.exitCode().run()
}

function ensureTrailingParagraph(editor: Pick<Editor, 'state' | 'view'>): void {
  const lastBlock = editor.state.doc.lastChild
  if (lastBlock?.type.name === 'paragraph' || lastBlock?.type.name === 'heading') return

  const paragraph = editor.state.schema.nodes.paragraph.create()
  const transaction = editor.state.tr
    .insert(editor.state.doc.content.size, paragraph)
    .setMeta('addToHistory', false)

  editor.view.dispatch(transaction)
}

function handleEditorKeyDown(editor: Editor | null, event: KeyboardEvent): boolean {
  if (!editor || !editor.isEditable || !editor.state.selection.empty) return false

  const tableDepth = findAncestorDepth(editor, 'table')
  const cellDepth = findAncestorDepth(editor, 'tableCell') ?? findAncestorDepth(editor, 'tableHeader')
  const isModEnter = event.key === 'Enter' && (event.metaKey || event.ctrlKey)

  if (tableDepth !== undefined && cellDepth !== undefined) {
    const { $from } = editor.state.selection
    const tableNode = $from.node(tableDepth)
    const rowIndex = $from.index(tableDepth)
    const rowNode = $from.node(tableDepth + 1)
    const cellIndex = $from.index(tableDepth + 1)
    const isLastRow = rowIndex === tableNode.childCount - 1
    const isLastCell = cellIndex === rowNode.childCount - 1
    const isAtCellEnd = isAtEndOfAncestor(editor, cellDepth)
    const isEmptyCellParagraph = $from.parent.textContent.length === 0

    if (isModEnter || (event.key === 'Escape') || (event.key === 'ArrowDown' && isLastRow && isAtCellEnd)) {
      event.preventDefault()
      return exitTable(editor, tableDepth)
    }

    // An empty cell in the final row is a natural place to press Enter when
    // the user wants to continue writing below the table.
    if (event.key === 'Enter' && !event.shiftKey && isLastRow && isLastCell && isAtCellEnd && isEmptyCellParagraph) {
      event.preventDefault()
      return exitTable(editor, tableDepth)
    }

  }

  const codeBlockDepth = findAncestorDepth(editor, 'codeblock')
  if (codeBlockDepth !== undefined) {
    const { $from } = editor.state.selection
    const isAtCodeBlockEnd = isAtEndOfAncestor(editor, codeBlockDepth)
    const codeText = $from.node(codeBlockDepth).textContent

    if (event.key === 'Escape' || isModEnter) {
      event.preventDefault()
      return exitCodeBlock(editor)
    }

    // The bundled code-block keymap exits after triple Enter, but its custom
    // node view can restore the selection to the previous content line. Handle
    // the exit before that keymap runs and remove the two blank line markers.
    let trailingNewlineCount = 0
    for (let index = codeText.length - 1; index >= 0 && codeText[index] === NEWLINE; index -= 1) {
      trailingNewlineCount += 1
    }
    if (event.key === 'Enter' && !event.shiftKey && isAtCodeBlockEnd && (codeText.length === 0 || trailingNewlineCount > 0)) {
      event.preventDefault()
      return exitCodeBlock(editor, trailingNewlineCount)
    }
  }

  return false
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

function getImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  const files: File[] = []
  // Clipboard image bitmaps (e.g. screenshots, "Copy image") show up as
  // `file` items before they appear in `.files` in some browsers.
  if (dataTransfer.items?.length) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }
  if (files.length === 0 && dataTransfer.files?.length) {
    for (const file of Array.from(dataTransfer.files)) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

function htmlHasTextContent(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img, br, hr, meta').forEach((el) => el.remove())
  return (doc.body?.textContent ?? '').trim().length > 0
}

function extractDataUriImages(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('img'))
    .map((img) => img.getAttribute('src'))
    .filter((src): src is string => !!src && src.startsWith('data:'))
}

async function insertImageFiles(editor: Editor | null, files: File[]): Promise<void> {
  if (!editor) return
  for (const file of files) {
    try {
      const attrs = await prepareImageForInsert(file)
      editor.chain().focus().insertImage(attrs).run()
    } catch (err) {
      console.error('Failed to insert pasted image', err)
    }
  }
}

async function insertImageDataUrls(editor: Editor | null, dataUrls: string[]): Promise<void> {
  if (!editor) return
  for (const dataUrl of dataUrls) {
    try {
      const attrs = await prepareImageDataUrlForInsert(dataUrl)
      editor.chain().focus().insertImage(attrs).run()
    } catch (err) {
      console.error('Failed to insert pasted image', err)
    }
  }
}

function handleEditorPaste(editor: Editor | null, event: ClipboardEvent): boolean {
  const files = getImageFiles(event.clipboardData)
  const html = event.clipboardData?.getData('text/html') ?? ''
  if (files.length > 0) {
    // Only take over an image-only paste so we don't swallow surrounding text.
    if (htmlHasTextContent(html)) return false
    void insertImageFiles(editor, files)
    return true
  }
  const dataUrls = extractDataUriImages(html)
  if (dataUrls.length > 0 && !htmlHasTextContent(html)) {
    void insertImageDataUrls(editor, dataUrls)
    return true
  }
  return false
}

function handleEditorDrop(editor: Editor | null, event: DragEvent): boolean {
  const files = getImageFiles(event.dataTransfer)
  if (files.length === 0) return false
  void insertImageFiles(editor, files)
  return true
}

type NoteEditorType = {
  content: string
  onContentChange: (content: string) => void
  title: string
  setTitle: Dispatch<SetStateAction<string>>
  tags: string[]
  setTags: Dispatch<SetStateAction<string[]>>
}

function NoteEditor({content, onContentChange, tags, title, setTags, setTitle}:NoteEditorType) {
  const [tagInput, setTagInput] = useState('')

  function addTag(value: string = tagInput): void {
    const tag = value.trim()
    if (!tag || tags.includes(tag)) {
      setTagInput('')
      return
    }

    const nextTags = [...tags, tag]
    setTags(nextTags)
    sessionStorage.setItem('tags', JSON.stringify(nextTags))
    sessionStorage.setItem('hasUnsentChanges', '1')
    setTagInput('')
  }

  function removeTag(tagToRemove: string): void {
    const nextTags = tags.filter((tag) => tag !== tagToRemove)
    setTags(nextTags)
    sessionStorage.setItem('tags', JSON.stringify(nextTags))
    sessionStorage.setItem('hasUnsentChanges', '1')
  }
  // The editor needs a real, stable DOM node to mount into *before* it is
  // constructed (useTiptap builds the Editor instance on first render via
  // useMemo). So we create a detached container up-front, hand it to the
  // editor as `element`, then attach that detached node into our rendered
  // host div once React has committed it to the DOM.
  const contentElRef = useRef<HTMLDivElement>(document.createElement('div'))
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)

  // Called when the user picks the "Image" toolbar tool. We deliberately
  // never give insertImage a `src` — only a `hash` + metadata — so the
  // document itself stays tiny regardless of image size or count. The
  // actual bytes live in sessionStorage, looked up lazily via
  // getAttachmentData below (only once the image scrolls into view).
  const openAttachmentPicker = useCallback(async (type: string) => {
    if (type !== 'image' && type !== 'camera') return
    const file = await pickFile()
    if (!file) return
    const attrs = await prepareImageForInsert(file)
    editorRef.current?.chain().focus().insertImage(attrs).run()
  }, [])

  // Called lazily by the image node view when it scrolls into view and has
  // a `hash` but no `src`. Must resolve to a data URL string.
  const getAttachmentData = useCallback(
    async ({ hash }: { hash: string; type: string }) => {
      return getImage(hash) ?? undefined
    },
    []
  )

  function persistEditorContent(editor: { getHTML: () => string }): void {
    const editorHTML = editor.getHTML()
    onContentChange(editorHTML)
    sessionStorage.setItem('note_content', editorHTML)
    sessionStorage.setItem('hasUnsentChanges', '1')
  }

  const tiptapOptions: Partial<TiptapOptions> = {
    element: contentElRef.current,
    editable: true,
    autofocus: 'start',
    content: content,
    dateFormat: 'MMM DD, YYYY',
    timeFormat: '24-hour',
    // The bundled syntax highlighter marks some code-block transactions with
    // `preventUpdate`. Persist from onTransaction so those transactions are
    // not skipped, and keep onUpdate/onBlur as normal-editor fallbacks.
    onTransaction({ editor, transaction }) {
      if (transaction.docChanged) {
        ensureTrailingParagraph(editor)
        persistEditorContent(editor)
      }
    },
    onUpdate({ editor }) {
      persistEditorContent(editor)
    },
    onBlur({ editor }) {
      persistEditorContent(editor)
    },
    openAttachmentPicker,
    getAttachmentData,
    editorProps: {
      handleKeyDown: (_view, event) => handleEditorKeyDown(editorRef.current, event),
      handlePaste: (_view, event) => handleEditorPaste(editorRef.current, event),
      handleDrop: (_view, event) => handleEditorDrop(editorRef.current, event),
    },
  }

  const editor = useTiptap(tiptapOptions, [])
  editorRef.current = editor

  useLayoutEffect(() => {
    const host = hostRef.current
    const content = contentElRef.current
    if (host && content && !host.contains(content)) {
      host.appendChild(content)
    }
    ensureTrailingParagraph(editor)
  }, [editor])

  return (
    <EmotionThemeProvider
      scope="editor"
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
    >
      {/* The editor's popup layer (`showPopup` / link menu) locates its DOM
          via `document.querySelector(".active .dialogContainer")` and
          `.active .editor-toolbar`. Without those, it falls back to
          `document.body`, and React's createRoot then clears <body> on
          render — which wipes the whole editor when Ctrl+K opens the link
          popup. Provide the expected `.active` wrapper + dedicated
          `.dialogContainer` so popups mount somewhere safe. */}
      <Box className="note-editor-shell active" sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Box className="dialogContainer" />
      <Box className="note-header">
        <Text className="note-eyebrow">New note</Text>
      <Input
        className="note-title"
        placeholder='Note Title'
        style={{ border: 'none', boxShadow: 'none', outline: 'none', background: 'transparent' }}
        sx={{
          border: 0,
          borderRadius: 0,
          boxShadow: 'none',
          bg: 'transparent',
          '&:focus': { outline: 'none', boxShadow: 'none' },
        }}
        onChange={(e) => {
          setTitle(e.target.value);
          sessionStorage.setItem("title", e.target.value)}
        }
        value={title}
      />
      <Box sx={{ minHeight: '5px' }} />
      <Flex
        className="note-tags"
        as="section"
        aria-label="Note tags"
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 2,
          minHeight: '38px',
        }}
      >
        {tags.map((tag) => (
          <Flex
            key={tag}
            className="tag-chip"
            sx={{

              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: '999px',
              bg: 'background-secondary',
              color: 'paragraph',
              fontSize: '13px',
            }}
          >
            <Text>{tag}</Text>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="tag-remove"
              style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
            >
              ×
            </button>
          </Flex>
        ))}
        <Input
          id="tag-input"
          className="tag-input"
          aria-label="Paste a tag ID"
          style={{ border: 'none', boxShadow: 'none', outline: 'none', background: 'transparent' }}
          placeholder="Paste a tag ID"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTag()
            } else if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
              removeTag(tags[tags.length - 1])
            }
          }}
          sx={{ flex: '1 1 120px', minWidth: '120px', border: 0, boxShadow: 'none', px: 0 }}
        />
      </Flex>
      </Box>
      <Box
        className="editor-toolbar"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'border',
          bg: 'background',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <Toolbar
          editor={editor}
          location="top"
          tools={toolbarTools}
          defaultFontFamily="sans-serif"
          defaultFontSize={16}
          sx={{ flexWrap: 'wrap', px: 2, py: 1 }}
        />
      </Box>
      <Flex
        className="editor-scroll"
        sx={{
          flex: 1,
          overflowY: 'auto',
          justifyContent: 'center',
          px: 4,
          py: 4,
        }}
      >
        <Box
          ref={hostRef}
          className="editor-container editor-page"
          sx={{
            width: '100%',
            maxWidth: '900px',
            minHeight: '100%',
            fontSize: '16px',
            color: 'paragraph',
            bg: 'background',
            '.ProseMirror': { outline: 'none', minHeight: '60vh' },
          }}
        />
      </Flex>
      </Box>
    </EmotionThemeProvider>
  )
}

export default NoteEditor