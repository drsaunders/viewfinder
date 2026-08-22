# viewfinder

A browser drawing assistant. Upload a photo, crop it to **4:5**, keep a faint midpoint crosshair over the current crop, and go full screen so the tablet stays awake while you draw.

There is no backend. Photos and crops stay in this browser (IndexedDB).

Live site, once Pages is enabled:

**https://drsaunders.github.io/viewfinder/**

## Requirements

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Local development

```bash
npm run dev
```

Open [http://localhost:4537](http://localhost:4537).

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite server |
| `npm run build` | Production build (`base: /`) |
| `npm run preview` | Preview the production build locally |
| `npm run build:pages` | Build for GitHub Pages (`base: /viewfinder/`) |
| `npm run preview:pages` | Preview the Pages build at `/viewfinder/` |

## Use

1. **Add photos** from your camera roll or files. The library can hold several.
2. **Crop** opens an editor. Drag the 4:5 window, pull a corner to resize, or pinch to scale. Image ↺/↻ turns the photo in 90° steps. Crop ↺/↻ turns only the frame (portrait 4:5 or landscape 5:4). **Reset** restores the largest upright 4:5. Each photo remembers its own crop and rotations.
3. **Crosshair** toggles the exact 50% vertical and horizontal lines of the current crop.
4. **Full screen** fills the display and requests a [screen wake lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) so the device does not dim from idle timeout. Tap the image to show or hide the chrome. On phones that block the Fullscreen API, the app still expands and holds the wake lock.

Keyboard: `F` full screen, `X` crosshair, `[` / `]` rotate image 90°, `Esc` back.

## Deploy (GitHub Pages)

Pushes to `main` rebuild and redeploy via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). In the GitHub repo: **Settings → Pages → Source → GitHub Actions**. You can also run **Actions → Deploy to GitHub Pages → Run workflow**.

If the repo name ever changes, update `repoName` in `vite.config.ts` so the Vite `base` path still matches.

## Stack

- Vanilla TypeScript
- Vite
- IndexedDB for the photo library and remembered crops
