import { MIN_CROP_WIDTH } from "./math.ts";
import type { CropState, PhotoRecord, UiPrefs } from "./types.ts";

const DB_NAME = "viewfinder";
const DB_VERSION = 1;

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob && value.size > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCrop(value: unknown): value is CropState {
  if (!value || typeof value !== "object") return false;
  const crop = value as Partial<CropState>;
  return (
    isFiniteNumber(crop.cx) &&
    isFiniteNumber(crop.cy) &&
    isFiniteNumber(crop.width) &&
    crop.width > 0 &&
    isFiniteNumber(crop.rotation)
  );
}

/** Keep existing library records even when older fields are missing. Never drops the photo bytes. */
export function normalizePhoto(raw: unknown): PhotoRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<PhotoRecord> & { blob?: unknown; thumb?: unknown };
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (!isBlob(record.blob)) return null;

  const crop: CropState = isCrop(record.crop)
    ? {
        cx: record.crop.cx,
        cy: record.crop.cy,
        width: Math.max(record.crop.width, MIN_CROP_WIDTH),
        rotation: record.crop.rotation,
      }
    : { cx: 0, cy: 0, width: MIN_CROP_WIDTH, rotation: 0 };

  return {
    id: record.id,
    name: typeof record.name === "string" && record.name ? record.name : "Photo",
    addedAt: isFiniteNumber(record.addedAt) ? record.addedAt : 0,
    blob: record.blob,
    thumb: isBlob(record.thumb) ? record.thumb : record.blob,
    imageRotation: isFiniteNumber(record.imageRotation) ? record.imageRotation : 0,
    crop,
  };
}

export function cropIsPlaceholder(crop: CropState): boolean {
  return (
    crop.cx === 0 && crop.cy === 0 && crop.width === MIN_CROP_WIDTH && crop.rotation === 0
  );
}

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
      // Only create missing stores. Never delete photos — that would wipe the local library.
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
  return photos
    .map((row) => normalizePhoto(row))
    .filter((photo): photo is PhotoRecord => photo !== null)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function getPhoto(
  db: IDBDatabase,
  id: string,
): Promise<PhotoRecord | undefined> {
  const tx = db.transaction("photos", "readonly");
  return normalizePhoto(await requestToPromise(tx.objectStore("photos").get(id))) ?? undefined;
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
