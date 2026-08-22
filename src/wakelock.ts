export class ScreenGuard {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.active) {
        void this.acquire();
      }
    });
  }

  async setActive(on: boolean): Promise<void> {
    this.active = on;
    if (on) await this.acquire();
    else await this.release();
  }

  private async acquire(): Promise<void> {
    if (!("wakeLock" in navigator)) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
      });
    } catch {
      this.sentinel = null;
    }
  }

  private async release(): Promise<void> {
    try {
      await this.sentinel?.release();
    } catch {
      /* already released */
    }
    this.sentinel = null;
  }
}

export async function enterFullscreen(el: HTMLElement): Promise<boolean> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (anyEl.webkitRequestFullscreen) {
      await anyEl.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    webkitFullscreenElement?: Element | null;
  };
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

export function isFullscreen(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}
