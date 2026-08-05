/// <reference lib="dom" />
/**
 * Browser-side blob store for sticky-note attachments.
 *
 * v1: the server only persists metadata + a `local://{id}/{filename}` placeholder.
 * The actual bytes live in IndexedDB on the user's device. When object storage
 * lands in v2, this module becomes a thin write-through cache.
 */

const DB_NAME = "timia-sticky-notes";
const DB_VERSION = 1;
const STORE = "attachments";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    });
  }
  return dbPromise;
}

function key(noteId: string, attachmentId: string) {
  return `${noteId}::${attachmentId}`;
}

export async function putAttachment(
  noteId: string,
  attachmentId: string,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key(noteId, attachmentId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

export async function getAttachment(
  noteId: string,
  attachmentId: string,
): Promise<Blob | null> {
  const db = await openDb();
  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key(noteId, attachmentId));
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
  });
}

export async function deleteAttachment(
  noteId: string,
  attachmentId: string,
): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key(noteId, attachmentId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"));
  });
}

export async function purgeNote(noteId: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (typeof cursor.key === "string" && cursor.key.startsWith(`${noteId}::`)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB purge failed"));
  });
}

export async function triggerDownload(
  noteId: string,
  attachmentId: string,
  filename: string,
): Promise<void> {
  const blob = await getAttachment(noteId, attachmentId);
  if (!blob) {
    throw new Error("本地文件不存在");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
