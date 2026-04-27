# ⚡ Flashy Lyric Video Generator

A browser-based tool that turns SRT subtitles + an audio file into a beat-synced lyric video with flashy visual effects. Built with React, Remotion, and the Web Audio API.

**No server required.** Everything runs client-side — audio analysis, preview, and MP4 export. Deploy it as a static site (GitHub Pages, Netlify, etc.).

## Features

- **SRT editor** with inline timing controls (nudge ±0.1s), right-click context menu to insert/delete cues
- **Live timing mode** — play the audio and press `I`/`O` to stamp cue start/end times in real time
- **FFT beat detection** — audio is analyzed via Web Audio API to extract per-frame energy and onset beats
- **Beat sensitivity slider** — dial in how reactive the visuals are, from subtle pulses to full strobe
- **Configurable resolution** — presets for 9:16, 16:9, 1:1, 720p, 4K, or custom dimensions
- **In-browser MP4 export** via `@remotion/web-renderer` and WebCodecs (Chrome/Edge 94+)
- **Auto-save** — all state (SRT, settings, layout) persists to localStorage

## Visual effects

The composition renders these beat-synced effects:

- Color-cycling flash overlays (8 vibrant colors) driven by onset detection
- White strobe on strong beats
- Floating particle bursts on medium+ beats
- Per-word spring-animated subtitle entrance
- Text glow and scale that pulse with audio energy
- Breathing scene zoom
- Animated vignette and scan line overlay
- Energy bar at the bottom

## Getting started

```bash
cd flashy-video-app
npm install
npm run dev
```

Open `http://localhost:5173`, paste your SRT, upload an MP3, and hit play.

## Usage

### Basic workflow

1. Paste SRT subtitles (or use the built-in editor to create cues from scratch)
2. Upload an audio file (MP3, WAV, OGG)
3. Adjust beat sensitivity to taste
4. Preview the video with the player controls
5. Click **Export to MP4** to render and download

### Live timing mode

For aligning lyrics to audio in real time:

1. Paste your lyrics as cues with placeholder times
2. Toggle **Live Mode** on
3. Start playback
4. Press **I** to set the start time of the current cue
5. Press **O** to set the end time and auto-advance to the next cue (`O` also sets the next cue's start time for seamless chaining)
6. Click any cue row to jump the live cursor there

### SRT editor

- **Editor tab** — table view with text, start/end time fields, and ◀▶ nudge buttons
- **Raw tab** — edit the SRT text directly
- **Right-click** any row for insert above/below/delete
- **+ Add cue** at the bottom appends a new cue
- Active cue highlights purple during playback, live target highlights yellow

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Serve it with any static file server or deploy to GitHub Pages.

### GitHub Pages deployment

```bash
npm run build
# push dist/ to your gh-pages branch, or use gh-pages package:
npx gh-pages -d dist
```

## Tech stack

- [React](https://react.dev) — UI
- [Remotion](https://remotion.dev) — video composition framework
- [@remotion/player](https://remotion.dev/player) — in-browser video preview
- [@remotion/web-renderer](https://remotion.dev/docs/web-renderer) — client-side MP4 rendering via WebCodecs
- [@remotion/media](https://remotion.dev/docs/media) — audio playback compatible with web rendering
- [Vite](https://vite.dev) — build tool
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — FFT energy analysis and beat detection

## Browser support

Preview works in all modern browsers. MP4 export requires WebCodecs support (Chrome/Edge 94+, Safari 16.4+). Firefox does not yet support WebCodecs for encoding.

## License

MIT
