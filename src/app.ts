import {
  deletePhoto,
  listPhotos,
  loadPrefs,
  openDb,
  savePhoto,
  savePrefs,
} from "./db.ts";
import { isImageFile, decodePhoto, recordFromFile } from "./image.ts";
import {
  clampCrop,
  defaultCrop,
  moveCrop,
  resizeCropFromCorner,
  rotateCropBy,
  scaleCrop,
  screenToWork,
  snapQuarterTurn,
  type ViewMap,
} from "./math.ts";
import {
  drawEditor,
  drawView,
  hitEditor,
  paintCropOverlay,
  paintCrosshair,
} from "./render.ts";
import type { CropState, EditorDrag, PhotoRecord, Point, UiPrefs } from "./types.ts";
import { ScreenGuard, enterFullscreen, exitFullscreen, isFullscreen } from "./wakelock.ts";

const HALF_PI = Math.PI / 2;

export class App {
  private db!: IDBDatabase;
  private photos: PhotoRecord[] = [];
  private prefs!: UiPrefs;
  private bitmap: ImageBitmap | null = null;
  private selected: PhotoRecord | null = null;
  private mode: "view" | "crop" = "view";
  private viewMap: ViewMap | null = null;
  private drag: EditorDrag | null = null;
  private pointers = new Map<number, Point>();
  private pinch: { startDist: number; startCrop: CropState } | null = null;
  private guard = new ScreenGuard();
  private studio = false;
  private chromeHidden = false;
  private hideTimer = 0;
  private saveTimer = 0;
  private thumbUrls = new Map<string, string>();

  private readonly root = $("#app");
  private readonly stage = $("#stage");
  private readonly canvas = $("#photo") as HTMLCanvasElement;
  private readonly overlay = $("#overlay") as unknown as SVGSVGElement;
  private readonly empty = $("#empty");
  private readonly loading = $("#loading");
  private readonly viewBar = $("#view-bar");
  private readonly cropBar = $("#crop-bar");
  private readonly libraryEl = $("#library");
  private readonly thumbsEl = $("#thumbs");
  private readonly fileInput = $("#file-input") as HTMLInputElement;
  private readonly toast = $("#toast");
  private readonly btnCrosshair = $("#btn-crosshair");
  private readonly btnFullscreen = $("#btn-fullscreen");

  async start(): Promise<void> {
    this.db = await openDb();
    this.prefs = await loadPrefs(this.db);
    this.photos = await listPhotos(this.db);
    this.bind();
    await this.selectInitial();
    this.syncChrome();
    this.renderLibrary();
    this.render();
  }

  private bind(): void {
    $("#btn-add").addEventListener("click", () => this.fileInput.click());
    $("#btn-add-empty").addEventListener("click", () => this.fileInput.click());
    $("#btn-library").addEventListener("click", () => this.toggleLibrary(true));
    $("#btn-library-close").addEventListener("click", () => this.toggleLibrary(false));
    $("#btn-library-add").addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", () => {
      void this.importFiles(this.fileInput.files);
      this.fileInput.value = "";
    });

    $("#btn-crop").addEventListener("click", () => this.setMode("crop"));
    $("#btn-crop-done").addEventListener("click", () => this.setMode("view"));
    $("#btn-crop-reset").addEventListener("click", () => this.resetCrop());
    this.btnCrosshair.addEventListener("click", () => {
      void this.setCrosshair(!this.prefs.crosshair);
    });
    this.btnFullscreen.addEventListener("click", () => {
      void this.toggleStudio();
    });

    $("#btn-img-ccw").addEventListener("click", () => this.nudgeImage(-HALF_PI));
    $("#btn-img-cw").addEventListener("click", () => this.nudgeImage(HALF_PI));
    $("#btn-img-ccw-crop").addEventListener("click", () => this.nudgeImage(-HALF_PI));
    $("#btn-img-cw-crop").addEventListener("click", () => this.nudgeImage(HALF_PI));
    $("#btn-crop-ccw").addEventListener("click", () => this.nudgeCrop(-HALF_PI));
    $("#btn-crop-cw").addEventListener("click", () => this.nudgeCrop(HALF_PI));

    this.overlay.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.overlay.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.overlay.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.overlay.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    this.stage.addEventListener("click", (e) => this.onStageClick(e));

    this.stage.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.stage.classList.add("drop");
    });
    this.stage.addEventListener("dragleave", () => this.stage.classList.remove("drop"));
    this.stage.addEventListener("drop", (e) => {
      e.preventDefault();
      this.stage.classList.remove("drop");
      void this.importFiles(e.dataTransfer?.files ?? null);
    });

    document.addEventListener("keydown", (e) => this.onKey(e));
    document.addEventListener("fullscreenchange", () => {
      if (!isFullscreen() && this.studio) void this.leaveStudio(false);
    });

    const ro = new ResizeObserver(() => this.render());
    ro.observe(this.stage);

    this.libraryEl.addEventListener("click", (e) => {
      if (e.target === this.libraryEl) this.toggleLibrary(false);
    });
  }

  private async selectInitial(): Promise<void> {
    if (this.photos.length === 0) {
      await this.select(null);
      return;
    }
    const remembered = this.photos.find((p) => p.id === this.prefs.selectedId);
    await this.select(remembered ?? this.photos[0]);
  }

  private async select(photo: PhotoRecord | null): Promise<void> {
    this.bitmap?.close();
    this.bitmap = null;
    this.selected = photo;
    this.prefs.selectedId = photo?.id ?? null;
    void savePrefs(this.db, this.prefs);
    if (!photo) {
      this.setMode("view");
      this.syncChrome();
      this.render();
      return;
    }
    this.loading.hidden = false;
    try {
      this.bitmap = await decodePhoto(photo.blob);
      this.snapStoredRotations();
    } catch {
      this.announce("Could not open that photo.");
    } finally {
      this.loading.hidden = true;
    }
    this.syncChrome();
    this.renderLibrary();
    this.render();
  }

  private async importFiles(list: FileList | null): Promise<void> {
    if (!list || list.length === 0) return;
    const files = [...list].filter(isImageFile);
    if (files.length === 0) {
      this.announce("Choose an image file.");
      return;
    }
    this.loading.hidden = false;
    let last: PhotoRecord | null = null;
    try {
      for (const file of files) {
        const record = await recordFromFile(file);
        await savePhoto(this.db, record);
        this.photos.unshift(record);
        last = record;
      }
    } catch {
      this.announce("Something went wrong adding a photo.");
    } finally {
      this.loading.hidden = true;
    }
    this.toggleLibrary(this.photos.length > 1);
    this.renderLibrary();
    if (last) await this.select(last);
  }

  private setMode(mode: "view" | "crop"): void {
    if (!this.selected && mode === "crop") return;
    this.mode = mode;
    this.drag = null;
    this.pinch = null;
    this.pointers.clear();
    this.syncChrome();
    this.render();
  }

  private resetCrop(): void {
    if (!this.selected || !this.bitmap) return;
    this.selected.crop = defaultCrop(this.bitmap.width, this.bitmap.height);
    this.selected.imageRotation = 0;
    this.persistSelected();
    this.render();
  }

  private async setCrosshair(on: boolean): Promise<void> {
    this.prefs.crosshair = on;
    await savePrefs(this.db, this.prefs);
    this.syncChrome();
    this.render();
  }

  private async toggleStudio(): Promise<void> {
    if (this.studio) await this.leaveStudio(true);
    else await this.enterStudio();
  }

  private async enterStudio(): Promise<void> {
    this.studio = true;
    this.root.classList.add("studio");
    const native = await enterFullscreen(document.documentElement);
    this.root.classList.toggle("studio-fake", !native);
    await this.guard.setActive(true);
    this.scheduleChromeHide();
    this.syncChrome();
    this.render();
  }

  private async leaveStudio(exitNative: boolean): Promise<void> {
    this.studio = false;
    this.chromeHidden = false;
    this.root.classList.remove("studio", "studio-fake", "chrome-hidden");
    window.clearTimeout(this.hideTimer);
    await this.guard.setActive(false);
    if (exitNative) await exitFullscreen();
    this.syncChrome();
    this.render();
  }

  private scheduleChromeHide(): void {
    window.clearTimeout(this.hideTimer);
    this.chromeHidden = false;
    this.root.classList.remove("chrome-hidden");
    this.hideTimer = window.setTimeout(() => {
      if (!this.studio || this.mode === "crop") return;
      this.chromeHidden = true;
      this.root.classList.add("chrome-hidden");
    }, 2200);
  }

  private onStageClick(e: Event): void {
    if (!this.studio || this.mode === "crop") return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest("button, input, aside, a")) return;
    if (this.chromeHidden) {
      this.scheduleChromeHide();
    } else {
      this.chromeHidden = true;
      this.root.classList.add("chrome-hidden");
    }
  }

  private nudgeImage(delta: number): void {
    if (!this.selected) return;
    this.selected.imageRotation = snapQuarterTurn(this.selected.imageRotation + delta);
    this.persistSelected();
    this.render();
  }

  private nudgeCrop(delta: number): void {
    if (!this.selected) return;
    this.selected.crop = rotateCropBy(this.selected.crop, delta);
    this.persistSelected();
    this.render();
  }

  private snapStoredRotations(): void {
    if (!this.selected) return;
    const imageRotation = snapQuarterTurn(this.selected.imageRotation);
    const rotation = snapQuarterTurn(this.selected.crop.rotation);
    if (
      imageRotation === this.selected.imageRotation &&
      rotation === this.selected.crop.rotation
    ) {
      return;
    }
    this.selected.imageRotation = imageRotation;
    this.selected.crop = { ...this.selected.crop, rotation };
    this.persistSelected();
  }

  private persistSelected(): void {
    if (!this.selected) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.selected) void savePhoto(this.db, this.selected);
    }, 200);
  }

  private stageSize(): { w: number; h: number } {
    const rect = this.stage.getBoundingClientRect();
    return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
  }

  private pointerInStage(e: PointerEvent): Point {
    const rect = this.stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.mode !== "crop" || !this.selected || !this.viewMap) return;
    e.preventDefault();
    this.overlay.setPointerCapture(e.pointerId);
    const p = this.pointerInStage(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.drag = null;
      this.pinch = {
        startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        startCrop: { ...this.selected.crop },
      };
      return;
    }

    const hit = hitEditor(p, this.selected.crop, this.viewMap);
    if (hit.kind === "none") return;
    this.drag = {
      kind: hit.kind,
      corner: hit.corner,
      startPointer: p,
      startCrop: { ...this.selected.crop },
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.mode !== "crop" || !this.selected || !this.viewMap || !this.bitmap) return;
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointerInStage(e);
    this.pointers.set(e.pointerId, p);

    if (this.pinch && this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const factor = dist / Math.max(1, this.pinch.startDist);
      const next = scaleCrop(this.pinch.startCrop, factor);
      this.selected.crop = clampCrop(next, this.bitmap.width, this.bitmap.height);
      this.persistSelected();
      this.render();
      return;
    }

    if (!this.drag) return;
    const startWork = screenToWork(this.drag.startPointer, this.viewMap);
    const work = screenToWork(p, this.viewMap);
    let next = this.drag.startCrop;
    if (this.drag.kind === "move") {
      next = moveCrop(this.drag.startCrop, {
        x: work.x - startWork.x,
        y: work.y - startWork.y,
      });
    } else if (this.drag.kind === "corner" && this.drag.corner !== undefined) {
      next = resizeCropFromCorner(this.drag.startCrop, this.drag.corner, work);
    }
    this.selected.crop = clampCrop(next, this.bitmap.width, this.bitmap.height);
    this.persistSelected();
    this.render();
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.drag = null;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "Escape") {
      if (this.mode === "crop") this.setMode("view");
      else if (this.studio) void this.leaveStudio(true);
      else this.toggleLibrary(false);
    } else if (e.key === "f" || e.key === "F") {
      void this.toggleStudio();
    } else if (e.key === "x" || e.key === "X") {
      void this.setCrosshair(!this.prefs.crosshair);
    } else if (e.key === "[") {
      this.nudgeImage(-HALF_PI);
    } else if (e.key === "]") {
      this.nudgeImage(HALF_PI);
    }
  }

  private toggleLibrary(open?: boolean): void {
    const next = open ?? Boolean(this.libraryEl.hidden);
    this.libraryEl.hidden = !next;
    this.root.classList.toggle("library-open", next);
  }

  private renderLibrary(): void {
    this.thumbsEl.replaceChildren();
    if (this.photos.length === 0) {
      const p = document.createElement("p");
      p.className = "library-empty";
      p.textContent = "No photos yet. Add one from your camera roll.";
      this.thumbsEl.append(p);
      return;
    }
    for (const photo of this.photos) {
      const url = this.thumbUrl(photo);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.classList.toggle("selected", photo.id === this.selected?.id);
      btn.setAttribute("aria-label", photo.name);
      const img = document.createElement("img");
      img.src = url;
      img.alt = photo.name;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "thumb-del";
      del.setAttribute("aria-label", `Remove ${photo.name}`);
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.removePhoto(photo.id);
      });
      btn.append(img, del);
      btn.addEventListener("click", () => {
        void this.select(photo);
        if (window.matchMedia("(max-width: 720px)").matches) this.toggleLibrary(false);
      });
      this.thumbsEl.append(btn);
    }
  }

  private thumbUrl(photo: PhotoRecord): string {
    const existing = this.thumbUrls.get(photo.id);
    if (existing) return existing;
    const url = URL.createObjectURL(photo.thumb);
    this.thumbUrls.set(photo.id, url);
    return url;
  }

  private async removePhoto(id: string): Promise<void> {
    const photo = this.photos.find((p) => p.id === id);
    if (!photo) return;
    if (!window.confirm(`Remove “${photo.name}” from the library?`)) return;
    await deletePhoto(this.db, id);
    this.photos = this.photos.filter((p) => p.id !== id);
    const url = this.thumbUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.thumbUrls.delete(id);
    if (this.selected?.id === id) {
      await this.select(this.photos[0] ?? null);
    } else {
      this.renderLibrary();
    }
  }

  private syncChrome(): void {
    const hasPhoto = Boolean(this.selected && this.bitmap);
    this.empty.hidden = hasPhoto;
    this.canvas.hidden = !hasPhoto;
    this.overlay.classList.toggle("idle", !hasPhoto);
    this.viewBar.hidden = this.mode !== "view" || !hasPhoto;
    this.cropBar.hidden = this.mode !== "crop" || !hasPhoto;
    this.btnCrosshair.setAttribute("aria-pressed", String(this.prefs.crosshair));
    this.btnCrosshair.classList.toggle("on", this.prefs.crosshair);
    this.btnFullscreen.setAttribute("aria-pressed", String(this.studio));
    this.btnFullscreen.classList.toggle("on", this.studio);
    $("#btn-library").setAttribute("aria-expanded", String(!this.libraryEl.hidden));
    this.overlay.style.pointerEvents = this.mode === "crop" ? "auto" : "none";
    this.root.dataset.mode = this.mode;
  }

  private render(): void {
    const { w, h } = this.stageSize();
    const cropGroup = $("#crop-ui");
    const hairGroup = $("#hair-ui");

    if (!this.selected || !this.bitmap) {
      setLayer(cropGroup, false);
      setLayer(hairGroup, false);
      return;
    }

    if (this.mode === "crop") {
      setLayer(hairGroup, false);
      setLayer(cropGroup, true);
      this.viewMap = drawEditor(
        this.canvas,
        this.bitmap,
        this.selected.crop,
        this.selected.imageRotation,
        w,
        h,
      );
      paintCropOverlay(this.overlay, this.selected.crop, this.viewMap, w, h);
      return;
    }

    setLayer(cropGroup, false);
    this.viewMap = null;
    drawView(this.canvas, this.bitmap, this.selected.crop, this.selected.imageRotation, w, h);
    paintCrosshair(this.overlay, w, h);
    setLayer(hairGroup, this.prefs.crosshair);
  }

  private announce(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add("show");
    window.setTimeout(() => this.toast.classList.remove("show"), 2800);
  }
}

function $(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    throw new Error(`Missing ${selector}`);
  }
  return el as HTMLElement;
}

function setLayer(el: HTMLElement, on: boolean): void {
  el.classList.toggle("off", !on);
}
