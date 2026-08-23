import { ASPECT, cropCorners, cropExtent, defaultCrop } from "./math.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function nearly(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-9, `${message} (got ${actual}, expected ${expected})`);
}

function visualSize(crop: ReturnType<typeof defaultCrop>): { w: number; h: number } {
  const corners = cropCorners(crop);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

const portrait = defaultCrop(3000, 4000);
nearly(portrait.rotation, 0, "portrait photo starts with an unrotated crop");
nearly(portrait.width, 3000, "portrait crop uses the image width");
const portraitExtent = cropExtent(portrait.width);
assert(portraitExtent.w < portraitExtent.h, "portrait crop is 4:5 (taller than wide)");
const portraitVisual = visualSize(portrait);
assert(portraitVisual.w < portraitVisual.h, "portrait crop appears portrait");
assert(portraitVisual.w <= 3000 + 1e-6, "portrait crop fits image width");
assert(portraitVisual.h <= 4000 + 1e-6, "portrait crop fits image height");

const landscape = defaultCrop(4000, 3000);
nearly(landscape.rotation, Math.PI / 2, "landscape photo starts with a 90° crop");
nearly(landscape.width, Math.min(3000, 4000 * ASPECT), "landscape crop is the largest 5:4 that fits");
const landscapeVisual = visualSize(landscape);
assert(landscapeVisual.w > landscapeVisual.h, "landscape crop appears landscape");
assert(landscapeVisual.w <= 4000 + 1e-6, "landscape crop fits image width");
assert(landscapeVisual.h <= 3000 + 1e-6, "landscape crop fits image height");

const square = defaultCrop(1000, 1000);
nearly(square.rotation, 0, "square photo keeps a portrait 4:5 crop");
assert(visualSize(square).w < visualSize(square).h, "square photo crop appears portrait");

const wide = defaultCrop(1920, 1080);
nearly(wide.rotation, Math.PI / 2, "16:9 photo starts landscape");
assert(visualSize(wide).w > visualSize(wide).h, "16:9 crop appears landscape");

console.log("defaultCrop orientation tests passed");
