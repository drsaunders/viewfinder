import {
  cropAxisSize,
  cropCorners,
  editorWorldRect,
  fitView,
  viewImageRect,
  workToScreen,
  type ViewMap,
} from "./math.ts";
import type { CropState, Point, ViewNav } from "./types.ts";

export function sizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): number {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return dpr;
}

function prep(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

export function drawView(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  crop: CropState,
  imageRotation: number,
  cssW: number,
  cssH: number,
  nav: ViewNav,
): void {
  const dpr = sizeCanvas(canvas, cssW, cssH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  prep(ctx);

  const rect = viewImageRect(crop, cssW, cssH, nav);
  const { w: cropW } = cropAxisSize(crop.width, crop.rotation);
  const scale = rect.w / cropW;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-crop.cx, -crop.cy);
  ctx.translate(bitmap.width / 2, bitmap.height / 2);
  ctx.rotate(imageRotation);
  ctx.translate(-bitmap.width / 2, -bitmap.height / 2);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}

export function editorViewMap(
  bitmap: ImageBitmap,
  crop: CropState,
  imageRotation: number,
  cssW: number,
  cssH: number,
  focus: "crop" | "image" = "crop",
): ViewMap {
  const world = editorWorldRect(bitmap.width, bitmap.height, crop, imageRotation, focus);
  return fitView(world, cssW, cssH, focus === "image" ? 56 : 48);
}

export function drawEditor(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  _crop: CropState,
  imageRotation: number,
  cssW: number,
  cssH: number,
  view: ViewMap,
): ViewMap {
  const dpr = sizeCanvas(canvas, cssW, cssH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return view;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  prep(ctx);

  ctx.save();
  ctx.translate(view.origin.x, view.origin.y);
  ctx.scale(view.scale, view.scale);
  ctx.translate(bitmap.width / 2, bitmap.height / 2);
  ctx.rotate(imageRotation);
  ctx.translate(-bitmap.width / 2, -bitmap.height / 2);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
  return view;
}

export function paintCropOverlay(
  svg: SVGSVGElement,
  crop: CropState,
  view: ViewMap,
  cssW: number,
  cssH: number,
): void {
  svg.setAttribute("viewBox", `0 0 ${cssW} ${cssH}`);
  svg.setAttribute("width", String(cssW));
  svg.setAttribute("height", String(cssH));

  const corners = cropCorners(crop).map((p) => workToScreen(p, view));

  const dim = svg.querySelector<SVGPathElement>("#crop-dim");
  const frame = svg.querySelector<SVGPolygonElement>("#crop-frame");
  if (!dim || !frame) return;

  const quad = corners.map((p) => `${p.x},${p.y}`).join(" ");
  dim.setAttribute(
    "d",
    `M0,0H${cssW}V${cssH}H0Z M${corners[0].x},${corners[0].y}L${corners[1].x},${corners[1].y}L${corners[2].x},${corners[2].y}L${corners[3].x},${corners[3].y}Z`,
  );
  frame.setAttribute("points", quad);

  corners.forEach((p, i) => {
    const node = svg.querySelector<SVGCircleElement>(`#crop-c${i}`);
    if (!node) return;
    node.setAttribute("cx", String(p.x));
    node.setAttribute("cy", String(p.y));
  });
}

export function paintCrosshair(
  svg: SVGSVGElement,
  cssW: number,
  cssH: number,
  image: { x: number; y: number; w: number; h: number },
): void {
  svg.setAttribute("viewBox", `0 0 ${cssW} ${cssH}`);
  svg.setAttribute("width", String(cssW));
  svg.setAttribute("height", String(cssH));
  const v = svg.querySelector<SVGLineElement>("#hair-v");
  const h = svg.querySelector<SVGLineElement>("#hair-h");
  if (!v || !h) return;
  const midX = image.x + image.w / 2;
  const midY = image.y + image.h / 2;
  v.setAttribute("x1", String(midX));
  v.setAttribute("x2", String(midX));
  v.setAttribute("y1", String(image.y));
  v.setAttribute("y2", String(image.y + image.h));
  h.setAttribute("x1", String(image.x));
  h.setAttribute("x2", String(image.x + image.w));
  h.setAttribute("y1", String(midY));
  h.setAttribute("y2", String(midY));
}

export function hitEditor(
  pointer: Point,
  crop: CropState,
  view: ViewMap,
): { kind: "corner" | "move" | "none"; corner?: number } {
  const corners = cropCorners(crop).map((p) => workToScreen(p, view));
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i];
    if (Math.hypot(pointer.x - p.x, pointer.y - p.y) <= 18) {
      return { kind: "corner", corner: i };
    }
  }
  const workCorners = cropCorners(crop);
  const workPointer = {
    x: (pointer.x - view.origin.x) / view.scale,
    y: (pointer.y - view.origin.y) / view.scale,
  };
  if (pointInPoly(workPointer, workCorners)) return { kind: "move" };
  return { kind: "none" };
}

function pointInPoly(p: Point, quad: Point[]): boolean {
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
