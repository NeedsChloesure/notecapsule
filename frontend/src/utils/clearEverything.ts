import { deleteAll } from "./imageStore";
import type { Dispatch, SetStateAction } from "react";

type ClearEverythingProps = {
    setContent: Dispatch<SetStateAction<string>>,
    setTitle: Dispatch<SetStateAction<string>>,
    setTags: Dispatch<SetStateAction<string[]>>,
    setNoteAttributes: Dispatch<SetStateAction<boolean[]>>,
    setNotebooks: Dispatch<SetStateAction<string[]>>,
    setEditorKey: Dispatch<SetStateAction<number>>,
    editorKey: number
}

const keys = ["hasUnsentChanges", "tags", "title", "notebooks", "noteAttributes", "note_content"]

export function clearEverything({
    editorKey,
    setContent,
    setTitle,
    setTags,
    setNoteAttributes,
    setNotebooks,
    setEditorKey
}: ClearEverythingProps): void {
  setContent('<p></p>');
  (async () => {await deleteAll()})();
  setTitle('');
  setTags([]);
  setNoteAttributes([false, false, false, false]);
  setNotebooks([]);
  setEditorKey(editorKey + 1)

  for (const key of keys) {
    sessionStorage.removeItem(key)
  }
}