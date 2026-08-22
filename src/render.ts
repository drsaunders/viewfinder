import {
  boundsOf,
  cropCorners,
  cropExtent,
  expandRect,
  fitView,
  rotatedImageCorners,
  unionRect,
  workToScreen,
  type ViewMap,
} from "./math.ts";
import type { CropState, Point } from "./types.ts";

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
): void {
  const dpr = sizeCanvas(canvas, cssW, cssH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  prep(ctx);

  const { w: cropW, h: cropH } = cropExtent(crop.width);
  const scale = Math.min(cssW / cropW, cssH / cropH);
  const outW = cropW * scale;
  const outH = cropH * scale;
  const ox = (cssW - outW) / 2;
  const oy = (cssH - outH) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, outW, outH);
  ctx.clip();
  ctx.translate(ox + outW / 2, oy + outH / 2);
  ctx.scale(scale, scale);
  ctx.rotate(-crop.rotation);
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
): ViewMap {
  const imageBounds = boundsOf(
    rotatedImageCorners(bitmap.width, bitmap.height, imageRotation),
  );
  const cropBounds = boundsOf(cropCorners(crop));
  const world = expandRect(unionRect(imageBounds, cropBounds), 24);
  return fitView(world, cssW, cssH, 56);
}

export function drawEditor(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  crop: CropState,
  imageRotation: number,
  cssW: number,
  cssH: number,
): ViewMap {
  const dpr = sizeCanvas(canvas, cssW, cssH);
  const ctx = canvas.getContext("2d");
  const view = editorViewMap(bitmap, crop, imageRotation, cssW, cssH);
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

export function paintCrosshair(svg: SVGSVGElement, cssW: number, cssH: number): void {
  svg.setAttribute("viewBox", `0 0 ${cssW} ${cssH}`);
  svg.setAttribute("width", String(cssW));
  svg.setAttribute("height", String(cssH));
  const v = svg.querySelector<SVGLineElement>("#hair-v");
  const h = svg.querySelector<SVGLineElement>("#hair-h");
  if (!v || !h) return;
  v.setAttribute("x1", String(cssW / 2));
  v.setAttribute("x2", String(cssW / 2));
  v.setAttribute("y1", "0");
  v.setAttribute("y2", String(cssH));
  h.setAttribute("x1", "0");
  h.setAttribute("x2", String(cssW));
  h.setAttribute("y1", String(cssH / 2));
  h.setAttribute("y2", String(cssH / 2));
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
