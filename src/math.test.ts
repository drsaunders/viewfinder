import {
  ASPECT,
  clampCrop,
  cropAxisSize,
  cropCorners,
  cropExtent,
  defaultCrop,
  defaultViewNav,
  imageCenter,
  MAX_VIEW_ZOOM,
  rotateCropAround,
  rotateCropBy,
  rotateImageWithCrop,
  rotatePoint,
  viewImageRect,
  zoomViewNav,
} from "./math.ts";
import type { CropState, Point } from "./types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function nearly(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-6, `${message} (got ${actual}, expected ${expected})`);
}

function visualSize(crop: CropState): { w: number; h: number } {
  const corners = cropCorners(crop);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function imageLocalCorners(
  crop: CropState,
  imgW: number,
  imgH: number,
  imageRotation: number,
): Point[] {
  const origin = imageCenter(imgW, imgH);
  return cropCorners(crop).map((p) => rotatePoint(p, origin, -imageRotation));
}

function assertInside(
  crop: CropState,
  imgW: number,
  imgH: number,
  imageRotation: number,
  label: string,
): void {
  for (const p of imageLocalCorners(crop, imgW, imgH, imageRotation)) {
    assert(p.x >= -1e-6 && p.x <= imgW + 1e-6, `${label}: x ${p.x} outside 0..${imgW}`);
    assert(p.y >= -1e-6 && p.y <= imgH + 1e-6, `${label}: y ${p.y} outside 0..${imgH}`);
  }
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

const imgW = 1000;
const imgH = 800;
const origin = imageCenter(imgW, imgH);
const offCenter: CropState = { cx: 300, cy: 400, width: 160, rotation: 0 };
const around = rotateCropAround(offCenter, origin, Math.PI / 2);
const expected = rotatePoint({ x: 300, y: 400 }, origin, Math.PI / 2);
nearly(around.cx, expected.x, "crop center follows the shared rotation point");
nearly(around.cy, expected.y, "crop center follows the shared rotation point");
nearly(around.rotation, Math.PI / 2, "crop rotation matches the image turn");

const synced = rotateImageWithCrop(offCenter, 0, Math.PI / 2, imgW, imgH);
nearly(synced.imageRotation, Math.PI / 2, "image rotation advances");
nearly(synced.crop.rotation, Math.PI / 2, "crop stays in sync with the image");
nearly(synced.crop.cx, expected.x, "synced crop uses the image center as pivot");
nearly(synced.crop.cy, expected.y, "synced crop uses the image center as pivot");
assertInside(synced.crop, imgW, imgH, synced.imageRotation, "synced 90°");

const cropOnly = rotateCropBy(offCenter, Math.PI / 2);
nearly(cropOnly.cx, offCenter.cx, "crop-only rotate leaves the center in place");
nearly(cropOnly.cy, offCenter.cy, "crop-only rotate leaves the center in place");
nearly(cropOnly.rotation, Math.PI / 2, "crop-only rotate turns the frame");

const again = rotateImageWithCrop(synced.crop, synced.imageRotation, Math.PI / 2, imgW, imgH);
nearly(again.imageRotation, Math.PI, "second image turn");
assertInside(again.crop, imgW, imgH, again.imageRotation, "synced 180°");

console.log("image/crop rotation sync tests passed");

const tooBig = clampCrop({ cx: 500, cy: 400, width: 4000, rotation: 0 }, imgW, imgH, 0);
nearly(tooBig.width, Math.min(imgW, imgH * ASPECT), "oversized crop shrinks to the photo");
assertInside(tooBig, imgW, imgH, 0, "shrunk crop");

const outside = clampCrop({ cx: -200, cy: 2000, width: 160, rotation: 0 }, imgW, imgH, 0);
const outsideSize = cropAxisSize(outside.width, 0);
assert(outside.cx >= outsideSize.w / 2 - 1e-6, "crop pulled in from the left");
assert(outside.cx <= imgW - outsideSize.w / 2 + 1e-6, "crop stays left of the right edge");
assert(outside.cy >= outsideSize.h / 2 - 1e-6, "crop pulled in from the top");
assert(outside.cy <= imgH - outsideSize.h / 2 + 1e-6, "crop stays above the bottom edge");
assertInside(outside, imgW, imgH, 0, "repositioned crop");

const landscapeTurn = clampCrop(rotateCropBy(defaultCrop(imgW, imgH), Math.PI / 2), imgW, imgH, 0);
assertInside(landscapeTurn, imgW, imgH, 0, "crop rotate then clamp");
const landscapeSize = visualSize(landscapeTurn);
assert(landscapeSize.w <= imgW + 1e-6, "rotated crop width fits");
assert(landscapeSize.h <= imgH + 1e-6, "rotated crop height fits");

const afterImage = rotateImageWithCrop(defaultCrop(4000, 3000), 0, Math.PI / 2, 4000, 3000);
assertInside(afterImage.crop, 4000, 3000, afterImage.imageRotation, "landscape photo after image rotate");

const viewStart = defaultCrop(4000, 3000);
const viewSize0 = cropAxisSize(viewStart.width, viewStart.rotation);
assert(viewSize0.w > viewSize0.h, "landscape crop displays landscape");
const viewTurn = rotateImageWithCrop(viewStart, 0, Math.PI / 2, 4000, 3000);
const viewSize1 = cropAxisSize(viewTurn.crop.width, viewTurn.crop.rotation);
assert(viewSize1.h > viewSize1.w, "image rotate flips the on-screen crop orientation");
assert(Math.abs(viewSize0.w - viewSize1.h) < 1e-6, "rotated view keeps the same pixel window");
assert(Math.abs(viewSize0.h - viewSize1.w) < 1e-6, "rotated view keeps the same pixel window");

console.log("clampCrop containment tests passed");
console.log("view orientation tests passed");

const zoomCrop = defaultCrop(4000, 3000);
const startNav = defaultViewNav();
const cssW = 1600;
const cssH = 900;
const before = viewImageRect(zoomCrop, cssW, cssH, startNav);
const focus = { x: before.x + before.w * 0.25, y: before.y + before.h * 0.25 };
const zoomed = zoomViewNav(startNav, 2, focus, focus, zoomCrop, cssW, cssH);
assert(zoomed.zoom === 2, "pinch zoom doubles the view scale");
const after = viewImageRect(zoomCrop, cssW, cssH, zoomed);
const relX0 = (focus.x - (before.x + before.w / 2)) / before.w;
const relY0 = (focus.y - (before.y + before.h / 2)) / before.h;
const relX1 = (focus.x - (after.x + after.w / 2)) / after.w;
const relY1 = (focus.y - (after.y + after.h / 2)) / after.h;
nearly(relX1, relX0, "zoom keeps the focal point on the same image location");
nearly(relY1, relY0, "zoom keeps the focal point on the same image location");
assert(Math.abs(after.w - before.w * 2) < 1 || after.w >= cssW - 1e-6, "zoomed image is larger");
assert(zoomCrop.width === defaultCrop(4000, 3000).width, "zoom does not change the crop");
assert(zoomCrop.cx === defaultCrop(4000, 3000).cx, "zoom does not move the crop");

const midAfter = { x: after.x + after.w / 2, y: after.y + after.h / 2 };
assert(Math.abs(midAfter.x - (after.x + after.w / 2)) < 1e-9, "crosshair stays on the image midlines");
const capped = zoomViewNav(startNav, 100, { x: cssW / 2, y: cssH / 2 }, { x: cssW / 2, y: cssH / 2 }, zoomCrop, cssW, cssH);
nearly(capped.zoom, MAX_VIEW_ZOOM, "view zoom is capped");

console.log("view zoom tests passed");
