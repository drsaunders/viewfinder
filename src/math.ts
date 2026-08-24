import type { CropState, Point, Rect, ViewNav } from "./types.ts";

/** Crop window width:height. */
export const ASPECT = 4 / 5;

export const MIN_CROP_WIDTH = 48;

export function cropExtent(width: number): { w: number; h: number } {
  return { w: width, h: width / ASPECT };
}

export function rotatePoint(p: Point, origin: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapQuarterTurn(radians: number): number {
  const quarter = Math.PI / 2;
  return Math.round(radians / quarter) * quarter;
}

/** True when a quarter-turned crop is landscape (5:4) in the given frame. */
export function cropIsLandscape(rotation: number): boolean {
  const quarter = Math.round(snapQuarterTurn(rotation) / (Math.PI / 2));
  return Math.abs(quarter) % 2 === 1;
}

/** Axis-aligned size of a 4:5 crop after `rotation`. */
export function cropAxisSize(width: number, rotation: number): { w: number; h: number } {
  const { w, h } = cropExtent(width);
  return cropIsLandscape(rotation) ? { w: h, h: w } : { w, h };
}

/** Largest short-side that keeps the rotated 4:5 crop inside the image. */
export function maxFittedCropWidth(imgW: number, imgH: number, rotation: number): number {
  return cropIsLandscape(rotation)
    ? Math.min(imgH, imgW * ASPECT)
    : Math.min(imgW, imgH * ASPECT);
}

/** Largest 4:5 crop that fits in the image, matching its landscape/portrait orientation. */
export function defaultCrop(imgW: number, imgH: number): CropState {
  const rotation = imgW > imgH ? Math.PI / 2 : 0;
  return {
    cx: imgW / 2,
    cy: imgH / 2,
    width: maxFittedCropWidth(imgW, imgH, rotation),
    rotation,
  };
}

export function cropCorners(crop: CropState): Point[] {
  const { w, h } = cropExtent(crop.width);
  const locals: Point[] = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  const origin: Point = { x: crop.cx, y: crop.cy };
  return locals.map((p) => rotatePoint(add(origin, p), origin, crop.rotation));
}

export function rotateCropBy(crop: CropState, delta: number): CropState {
  return { ...crop, rotation: snapQuarterTurn(crop.rotation + delta) };
}

/** Rotate the crop around `origin` (the image center when keeping image+crop in sync). */
export function rotateCropAround(crop: CropState, origin: Point, delta: number): CropState {
  const center = rotatePoint({ x: crop.cx, y: crop.cy }, origin, delta);
  return {
    ...crop,
    cx: center.x,
    cy: center.y,
    rotation: snapQuarterTurn(crop.rotation + delta),
  };
}

/** Rotate the photo and the crop together around the image center. */
export function rotateImageWithCrop(
  crop: CropState,
  imageRotation: number,
  delta: number,
  imgW: number,
  imgH: number,
): { crop: CropState; imageRotation: number } {
  const nextImage = snapQuarterTurn(imageRotation + delta);
  const nextCrop = rotateCropAround(crop, imageCenter(imgW, imgH), delta);
  return {
    crop: clampCrop(nextCrop, imgW, imgH, nextImage),
    imageRotation: nextImage,
  };
}

export function imageCorners(imgW: number, imgH: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: imgW, y: 0 },
    { x: imgW, y: imgH },
    { x: 0, y: imgH },
  ];
}

export function imageCenter(imgW: number, imgH: number): Point {
  return { x: imgW / 2, y: imgH / 2 };
}

export function rotatedImageCorners(
  imgW: number,
  imgH: number,
  imageRotation: number,
): Point[] {
  const origin = imageCenter(imgW, imgH);
  return imageCorners(imgW, imgH).map((p) => rotatePoint(p, origin, imageRotation));
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function expandRect(rect: Rect, pad: number): Rect {
  return {
    minX: rect.minX - pad,
    minY: rect.minY - pad,
    maxX: rect.maxX + pad,
    maxY: rect.maxY + pad,
  };
}

export function rectWidth(rect: Rect): number {
  return rect.maxX - rect.minX;
}

export function rectHeight(rect: Rect): number {
  return rect.maxY - rect.minY;
}

export function rectCenter(rect: Rect): Point {
  return {
    x: (rect.minX + rect.maxX) / 2,
    y: (rect.minY + rect.maxY) / 2,
  };
}

export function pointInQuad(p: Point, quad: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const a = quad[i];
    const b = quad[j];
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function toCropLocal(p: Point, crop: CropState): Point {
  const dx = p.x - crop.cx;
  const dy = p.y - crop.cy;
  const c = Math.cos(-crop.rotation);
  const s = Math.sin(-crop.rotation);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** Keep the crop inside the photo, after undoing `imageRotation`. */
export function clampCrop(
  crop: CropState,
  imgW: number,
  imgH: number,
  imageRotation = 0,
): CropState {
  const relRotation = snapQuarterTurn(crop.rotation - imageRotation);
  const fitted = maxFittedCropWidth(imgW, imgH, relRotation);
  const minWidth = Math.min(MIN_CROP_WIDTH, fitted);
  const width = clamp(crop.width, minWidth, fitted);
  const { w: visW, h: visH } = cropAxisSize(width, relRotation);
  const origin = imageCenter(imgW, imgH);
  const local = rotatePoint({ x: crop.cx, y: crop.cy }, origin, -imageRotation);
  const clampedLocal = {
    x: clamp(local.x, visW / 2, imgW - visW / 2),
    y: clamp(local.y, visH / 2, imgH - visH / 2),
  };
  const world = rotatePoint(clampedLocal, origin, imageRotation);
  return {
    ...crop,
    width,
    cx: world.x,
    cy: world.y,
    rotation: snapQuarterTurn(crop.rotation),
  };
}

export function moveCrop(crop: CropState, delta: Point): CropState {
  return { ...crop, cx: crop.cx + delta.x, cy: crop.cy + delta.y };
}

export function resizeCropFromCorner(
  start: CropState,
  cornerIndex: number,
  pointer: Point,
): CropState {
  const startCorners = cropCorners(start);
  const opposite = startCorners[(cornerIndex + 2) % 4];
  const local = toCropLocal(sub(pointer, opposite), { ...start, cx: 0, cy: 0 });
  const signX = local.x >= 0 ? 1 : -1;
  const signY = local.y >= 0 ? 1 : -1;

  let w = Math.max(MIN_CROP_WIDTH, Math.abs(local.x));
  let h = w / ASPECT;
  if (Math.abs(local.y) > h) {
    h = Math.max(MIN_CROP_WIDTH / ASPECT, Math.abs(local.y));
    w = h * ASPECT;
  }

  const newLocalCorner = { x: signX * w, y: signY * h };
  const rotated = rotatePoint(newLocalCorner, { x: 0, y: 0 }, start.rotation);
  const newCorner = add(opposite, rotated);
  return {
    ...start,
    cx: (opposite.x + newCorner.x) / 2,
    cy: (opposite.y + newCorner.y) / 2,
    width: w,
  };
}

export function scaleCrop(crop: CropState, factor: number): CropState {
  return { ...crop, width: crop.width * factor };
}

export interface ViewMap {
  scale: number;
  origin: Point;
}

export function fitView(rect: Rect, viewW: number, viewH: number, inset: number): ViewMap {
  const availW = Math.max(1, viewW - inset * 2);
  const availH = Math.max(1, viewH - inset * 2);
  const scale = Math.min(availW / rectWidth(rect), availH / rectHeight(rect));
  const center = rectCenter(rect);
  return {
    scale,
    origin: {
      x: viewW / 2 - center.x * scale,
      y: viewH / 2 - center.y * scale,
    },
  };
}

export function workToScreen(p: Point, view: ViewMap): Point {
  return {
    x: p.x * view.scale + view.origin.x,
    y: p.y * view.scale + view.origin.y,
  };
}

export function screenToWork(p: Point, view: ViewMap): Point {
  return {
    x: (p.x - view.origin.x) / view.scale,
    y: (p.y - view.origin.y) / view.scale,
  };
}

export const MIN_VIEW_ZOOM = 0.5;
export const MAX_VIEW_ZOOM = 8;

export function defaultViewNav(): ViewNav {
  return { zoom: 1, pan: { x: 0, y: 0 } };
}

/** On-screen rectangle of the cropped image after fit, zoom, and pan. */
export function viewImageRect(
  crop: CropState,
  cssW: number,
  cssH: number,
  nav: ViewNav,
): { x: number; y: number; w: number; h: number } {
  const { w: cropW, h: cropH } = cropAxisSize(crop.width, crop.rotation);
  const fit = Math.min(cssW / cropW, cssH / cropH);
  const scale = fit * nav.zoom;
  const outW = cropW * scale;
  const outH = cropH * scale;
  return {
    x: (cssW - outW) / 2 + nav.pan.x,
    y: (cssH - outH) / 2 + nav.pan.y,
    w: outW,
    h: outH,
  };
}

export function clampViewNav(
  nav: ViewNav,
  crop: CropState,
  cssW: number,
  cssH: number,
): ViewNav {
  const zoom = clamp(nav.zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const rect = viewImageRect(crop, cssW, cssH, { zoom, pan: { x: 0, y: 0 } });
  const maxPanX = Math.max(0, (rect.w - cssW) / 2);
  const maxPanY = Math.max(0, (rect.h - cssH) / 2);
  return {
    zoom,
    pan: {
      x: clamp(nav.pan.x, -maxPanX, maxPanX),
      y: clamp(nav.pan.y, -maxPanY, maxPanY),
    },
  };
}

/** Zoom/pan so the crop point under `from` stays under `to` (pinch or wheel). */
export function zoomViewNav(
  start: ViewNav,
  factor: number,
  from: Point,
  to: Point,
  crop: CropState,
  cssW: number,
  cssH: number,
): ViewNav {
  const { w: cropW, h: cropH } = cropAxisSize(crop.width, crop.rotation);
  const fit = Math.min(cssW / cropW, cssH / cropH);
  const startScale = fit * start.zoom;
  const cropRel = {
    x: (from.x - (cssW / 2 + start.pan.x)) / startScale,
    y: (from.y - (cssH / 2 + start.pan.y)) / startScale,
  };
  const zoom = start.zoom * factor;
  const nextScale = fit * clamp(zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  return clampViewNav(
    {
      zoom,
      pan: {
        x: to.x - cssW / 2 - cropRel.x * nextScale,
        y: to.y - cssH / 2 - cropRel.y * nextScale,
      },
    },
    crop,
    cssW,
    cssH,
  );
}

export function panViewNav(
  start: ViewNav,
  delta: Point,
  crop: CropState,
  cssW: number,
  cssH: number,
): ViewNav {
  return clampViewNav(
    { zoom: start.zoom, pan: { x: start.pan.x + delta.x, y: start.pan.y + delta.y } },
    crop,
    cssW,
    cssH,
  );
}
