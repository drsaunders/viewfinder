export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Oriented 4:5 crop in original image pixel space. */
export interface CropState {
  cx: number;
  cy: number;
  /** Short side of the 4:5 window, in image pixels. Height is width / (4/5). */
  width: number;
  rotation: number;
}

export interface PhotoRecord {
  id: string;
  name: string;
  addedAt: number;
  blob: Blob;
  thumb: Blob;
  imageRotation: number;
  crop: CropState;
}

export interface UiPrefs {
  key: "ui";
  crosshair: boolean;
  selectedId: string | null;
}

export type EditorHandle = "move" | "rotate" | "corner";

export interface EditorDrag {
  kind: EditorHandle;
  corner?: number;
  startPointer: Point;
  startCrop: CropState;
  startAngle?: number;
}
