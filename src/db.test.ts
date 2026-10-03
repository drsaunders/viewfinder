import { cropIsPlaceholder, normalizePhoto } from "./db.ts";
import { MIN_CROP_WIDTH } from "./math.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
const thumb = new Blob([new Uint8Array([5, 6])], { type: "image/jpeg" });

assert(normalizePhoto(null) === null, "rejects null");
assert(normalizePhoto({}) === null, "rejects a record with no photo bytes");

const legacy = normalizePhoto({
  id: "abc",
  name: "Harbor.jpg",
  addedAt: 123,
  blob,
  thumb,
  imageRotation: 0,
  crop: { cx: 800, cy: 600, width: 400, rotation: 0 },
});
assert(legacy !== null, "keeps a complete stored photo");
assert(legacy?.id === "abc", "keeps the photo id");
assert(legacy?.blob === blob, "never drops the original bytes");
assert(legacy?.crop.width === 400, "keeps the stored crop");

const missingCrop = normalizePhoto({
  id: "old",
  blob,
});
assert(missingCrop !== null, "keeps a photo that only has bytes");
assert(missingCrop?.blob === blob, "bytes survive a missing crop");
assert(missingCrop?.thumb === blob, "falls back to the photo bytes for the thumb");
assert(missingCrop ? cropIsPlaceholder(missingCrop.crop) : false, "marks a missing crop for rebuild");
assert(missingCrop?.crop.width === MIN_CROP_WIDTH, "placeholder crop is tiny until open");

console.log("library record compatibility tests passed");
