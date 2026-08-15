# StockHuntr screencast & deck pipeline

Produces the StockHuntr **promo video** and a matching **marketing deck** from JSON storyboards,
using one branded slide renderer so both share the same visual language. Ported from the
Bastion/ThreatVec screencast toolchain and re-themed for StockHuntr (near-black navy + teal accent).

## What it makes

| Command | Output |
|---------|--------|
| `node scripts/screencast/build.mjs scripts/screencast/storyboard.json` | `screencast/stockhuntr-screencast.mp4` + `.srt`/`.vtt` captions |
| `node scripts/screencast/build-deck.mjs scripts/screencast/deck-storyboard.json` | `deck/stockhuntr-deck.pdf` + `deck/slides/NN-*.png` |

Both output dirs (`screencast/`, `deck/`) are git-ignored — regenerate on demand.

## Requirements

- **ffmpeg / ffprobe** on `PATH` (`brew install ffmpeg`).
- **Playwright** chromium (already a dev dependency; `npx playwright install chromium` if missing).
- **ElevenLabs API key** for real narration. `build.mjs` reads `ELEVENLABS_API_KEY` from the env or
  the repo `.env`. Without it, the pipeline still runs with **silent placeholder audio** (sized to the
  narration) so you can preview timing; add the key and re-run with `REGEN=1` for the voice.
  Optional: `ELEVENLABS_VOICE_ID` (defaults to the "Rachel" voice).
- **Live demo**: the video's demo segments record the real app. Start `npm run dev` first
  (`http://localhost:3000`); if it's not reachable the demo segments fall back to slides.
  Override the target with `SCREENCAST_URL=...`.

```bash
# One-time render (dev server must be running for the live demo):
npm run dev &                                   # or in another terminal
ELEVENLABS_API_KEY=xxx node scripts/screencast/build.mjs scripts/screencast/storyboard.json
node scripts/screencast/build-deck.mjs scripts/screencast/deck-storyboard.json
```

Tuning knobs (env): `SCALE` (1 = 1080p, 1.3333 = 1440p, 2 = 4K for the video), `DECK_SCALE`
(deck PNG density, default 2), `CAPTIONS=burn` (bake open captions into an `-cc.mp4`),
`REGEN=1` (re-generate all narration audio).

## Storyboard schema

`storyboard.json` (video) and `deck-storyboard.json` (deck) share the same shape:

```jsonc
{
  "title": "…", "output": "stockhuntr-screencast.mp4",
  "brand": { "name": "StockHuntr", "tagline": "chat with SEC filings" },
  "parts": { "intro": [1, "The Problem"], "features": [3, "What You Get"], … },  // section → [n, LABEL]
  "segments": [
    { "id": "cover", "section": "intro", "visualKind": "title",
      "slideTitle": "Chat with SEC filings — Get cited answers.", "tagline": "…", "intro": "…",
      "narration": "" },                                    // empty narration on a title = silent hold
    { "id": "feat", "section": "features", "visualKind": "slide", "partTotal": 6,
      "slideTitle": "…", "slideBullets": ["…", "…"],
      "narration": "on-screen caption text",
      "narrationSpoken": "phonetic text for TTS (e.g. S-E-C, ten-K, A.I.)" },
    { "id": "demo", "section": "demo", "visualKind": "demo", "partTotal": 6,
      "narration": "…",
      "demoSteps": [ { "action": "navigate", "target": "/pulse" }, { "action": "scroll", "value": 800 },
                     { "action": "wait", "value": 1200 } ] }  // actions: navigate|scroll|wait|click|type|highlight
  ]
}
```

- `visualKind`: `title` (cover), `slide` (title + bullets), `image` (title + a `docs/assets` PNG + caption),
  `demo` (live screen recording driven by `demoSteps`).
- `narration` is the caption text; `narrationSpoken` (optional) is what the voice reads — use it for
  phonetic spellings (`S-E-C`, `ten-K`, `A.I.`) that the caption should still show cleanly.
- Demo segments are paced to their narration length, so the voice stays synced to the on-screen actions.

## Files

- `build.mjs` — video orchestrator (audio → frames → live demo → ffmpeg assembly + captions).
- `build-deck.mjs` — deck builder (branded slide PNGs → combined PDF).
- `lib.mjs` — TTS, the branded slide/title/image HTML renderers (`setBrand`/`setParts`), ffmpeg helpers, captions.
- `record-demo.mjs` — Playwright live-demo recorder with an on-screen cursor + click ripples.
- `burn-captions.mjs` — optional open-caption burn-in (`CAPTIONS=burn`).
- `storyboard.json` / `deck-storyboard.json` — the StockHuntr video and deck content.
