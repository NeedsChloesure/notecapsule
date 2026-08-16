/**
 * Stores image bytes (as data URLs) in IndexedDB, keyed by a hash.
 * The editor document only ever stores the hash + metadata — never the
 * actual bytes — so undo/redo history and note serialization stay light
 * regardless of how many/large the images are.
 */

const DB_NAME = 'images'
const STORE_NAME = 'images'
const DB_VERSION = 1

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION)

  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME)
  }

  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

/** Wraps an IDBRequest in a real promise that resolves with its result. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function hashBytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Decodes a data URL to a Blob so we can hash its raw bytes (which matches
 *  the hash produced from the original file the data URL was created from). */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

async function hashAndStore(dataUrl: string, bytes: ArrayBuffer): Promise<string> {
  const hash = await hashBytes(bytes)
  // Dedupe: if we've already stored this exact image, don't write it again.
  const existing = await getImage(hash)
  if (!existing) await storeImage(hash, dataUrl)
  return hash
}

export async function storeImage(hash: string, dataUrl: string): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).put(dataUrl, hash)
  // Wait for the whole transaction to commit, not just the individual
  // request, so callers can trust the write is durable once this resolves.
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function getImage(hash: string): Promise<string | undefined> {
  const db = await dbPromise
  const transaction = db.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).get(hash) as IDBRequest<
    string | undefined
  >
  const value = await promisifyRequest(request)
  return value ?? undefined
}

export async function deleteImage(hash: string): Promise<void> {
  const db = await dbPromise
  const transaction = db.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).delete(hash)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Hashes + stores a data URL's bytes and returns the attrs to hand straight to
 * editor.commands.insertImage(...) — deliberately with no `src`, so the
 * document only ever gets the reference, not the bytes.
 */
export async function prepareImageDataUrlForInsert(dataUrl: string, filename = '') {
  const blob = await dataUrlToBlob(dataUrl)
  const hash = await hashAndStore(dataUrl, await blob.arrayBuffer())

  const { width, height } = await getImageDimensions(dataUrl)

  return {
    hash,
    mime: blob.type,
    filename,
    size: blob.size,
    width,
    height,
    aspectRatio: width / height,
  }
}

/**
 * Hashes + stores a File's bytes and returns the attrs to hand straight to
 * editor.commands.insertImage(...) — deliberately with no `src`, so the
 * document only ever gets the reference, not the bytes.
 */
export async function prepareImageForInsert(file: File) {
  const dataUrl = await readFileAsDataURL(file)
  return prepareImageDataUrlForInsert(dataUrl, file.name)
}

export async function deleteAll(): Promise<void> {
  const db = await dbPromise;
  const transaction = db.transaction(STORE_NAME, "readwrite")
  transaction.objectStore(STORE_NAME).clear()
}