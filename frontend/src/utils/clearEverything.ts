import { deleteAll } from "./imageStore";
import type { Dispatch, SetStateAction } from "react";

type ClearEverythingProps = {
    setContent: Dispatch<SetStateAction<string>>,
    setTitle: Dispatch<SetStateAction<string>>,
    setTags: Dispatch<SetStateAction<string[]>>,
    setNoteAttributes: Dispatch<SetStateAction<boolean[]>>,
    setNotebooks: Dispatch<SetStateAction<string[]>>,
    setEditorKey: Dispatch<SetStateAction<number>>,
    editorKey: number,
    /** Skip remounting the editor (used when new content is applied right after). */
    skipEditorRemount?: boolean
}

/** sessionStorage keys that hold the unsent draft. */
export const DRAFT_STORAGE_KEYS = ["hasUnsentChanges", "tags", "title", "notebooks", "noteAttributes", "note_content"]

const keys = DRAFT_STORAGE_KEYS

export function clearEverything({
    editorKey,
    setContent,
    setTitle,
    setTags,
    setNoteAttributes,
    setNotebooks,
    setEditorKey,
    skipEditorRemount = false
}: ClearEverythingProps): void {
  setContent('<p></p>');
  void deleteAll();
  setTitle('');
  setTags([]);
  setNoteAttributes([false, false, false, false]);
  setNotebooks([]);
  if (!skipEditorRemount) setEditorKey(editorKey + 1)

  for (const key of keys) {
    sessionStorage.removeItem(key)
  }
}