import { defaultCrop } from "./math.ts";
import type { PhotoRecord } from "./types.ts";

const MAX_EDGE = 4096;

export async function decodePhoto(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      return decodeViaElement(blob);
    }
  }
}

async function decodeViaElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    return await createImageBitmap(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = url;
  });
}

export async function makeThumb(bitmap: ImageBitmap): Promise<Blob> {
  return (await rasterize(bitmap, 280, 0.82)).blob;
}

async function rasterize(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create image canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return {
    blob: await canvasToBlob(canvas, "image/jpeg", quality),
    width: canvas.width,
    height: canvas.height,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode image"));
    }, type, quality);
  });
}

/** Copy picker bytes immediately — Android content URIs are often readable only once. */
async function durableCopy(file: Blob): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  return new Blob([buffer], { type: file.type || "application/octet-stream" });
}

export async function recordFromFile(file: File): Promise<PhotoRecord> {
  const raw = await durableCopy(file);
  const bitmap = await decodePhoto(raw);
  try {
    let stored: Blob;
    let width = bitmap.width;
    let height = bitmap.height;
    try {
      const raster = await rasterize(bitmap, MAX_EDGE, 0.92);
      stored = raster.blob;
      width = raster.width;
      height = raster.height;
    } catch {
      stored = raw;
    }
    const thumb = await makeThumb(bitmap);
    return {
      id: crypto.randomUUID(),
      name: file.name || "Photo",
      addedAt: Date.now(),
      blob: stored,
      thumb,
      imageRotation: 0,
      crop: defaultCrop(width, height),
    };
  } finally {
    bitmap.close();
  }
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif|avif|bmp|tif{1,2})$/i.test(file.name);
}
