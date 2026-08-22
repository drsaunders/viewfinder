import { defaultCrop } from "./math.ts";
import type { PhotoRecord } from "./types.ts";

export async function decodePhoto(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

export async function makeThumb(bitmap: ImageBitmap): Promise<Blob> {
  const max = 280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create thumbnail canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
  return blob;
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

export async function recordFromFile(file: File): Promise<PhotoRecord> {
  const bitmap = await decodePhoto(file);
  try {
    const thumb = await makeThumb(bitmap);
    return {
      id: crypto.randomUUID(),
      name: file.name || "Photo",
      addedAt: Date.now(),
      blob: file,
      thumb,
      imageRotation: 0,
      crop: defaultCrop(bitmap.width, bitmap.height),
    };
  } finally {
    bitmap.close();
  }
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif|avif|bmp|tif{1,2})$/i.test(file.name);
}
