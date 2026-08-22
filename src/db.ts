import type { PhotoRecord, UiPrefs } from "./types.ts";

const DB_NAME = "viewfinder";
const DB_VERSION = 1;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("prefs")) {
        db.createObjectStore("prefs", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPhotos(db: IDBDatabase): Promise<PhotoRecord[]> {
  const tx = db.transaction("photos", "readonly");
  const photos = await requestToPromise(tx.objectStore("photos").getAll());
  photos.sort((a, b) => b.addedAt - a.addedAt);
  return photos;
}

export async function getPhoto(
  db: IDBDatabase,
  id: string,
): Promise<PhotoRecord | undefined> {
  const tx = db.transaction("photos", "readonly");
  return requestToPromise(tx.objectStore("photos").get(id));
}

export async function savePhoto(db: IDBDatabase, photo: PhotoRecord): Promise<void> {
  const tx = db.transaction("photos", "readwrite");
  await requestToPromise(tx.objectStore("photos").put(photo));
}

export async function deletePhoto(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction("photos", "readwrite");
  await requestToPromise(tx.objectStore("photos").delete(id));
}

export async function loadPrefs(db: IDBDatabase): Promise<UiPrefs> {
  const tx = db.transaction("prefs", "readonly");
  const prefs = await requestToPromise(tx.objectStore("prefs").get("ui"));
  return (
    prefs ?? {
      key: "ui",
      crosshair: true,
      selectedId: null,
    }
  );
}

export async function savePrefs(db: IDBDatabase, prefs: UiPrefs): Promise<void> {
  const tx = db.transaction("prefs", "readwrite");
  await requestToPromise(tx.objectStore("prefs").put(prefs));
}
