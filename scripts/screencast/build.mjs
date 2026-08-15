// SPDX-License-Identifier: Apache-2.0
// Orchestrator: storyboard.json → ElevenLabs audio → on-brand slide frames + live-demo recording →
// ffmpeg assembly into a synced MP4 (each visual held for exactly its narration's audio length).
//   node scripts/screencast/build.mjs [storyboard.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { elevenTTS, silentAudio, audioDurationSec, slideHTML, imageHTML, titleHTML, slideClip, demoClip, leadClip, concatClips, segmentCues, writeCaptions, setBrand, setParts, SPEED, LEAD_IN, SCALE, W, H } from "./lib.mjs";
import { recordDemo } from "./record-demo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "screencast");
const D = (...p) => path.join(OUT, ...p);
for (const d of ["audio", "frames", "clips"]) fs.mkdirSync(D(d), { recursive: true });

// Minimal .env loader (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID) — never printed.
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env */ }
}
const ff = (args) => { const r = spawnSync("ffmpeg", args, { encoding: "utf8" }); if (r.status !== 0) throw new Error("ffmpeg: " + (r.stderr || "").slice(-400)); };
const reachable = (url) => { const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "3", url], { encoding: "utf8" }); return /^[23]\d\d$/.test((r.stdout || "").trim()); };

async function main() {
  loadEnv();
  const sbPath = process.argv[2] || D("storyboard.json");
  const sb = JSON.parse(fs.readFileSync(sbPath, "utf8"));
  if (sb.brand) setBrand(sb.brand);           // brand wordmark + tagline on slides
  if (sb.parts) setParts(sb.parts);           // section-key → [partNumber, LABEL] pill map
  const segs = sb.segments.map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, _i: i }));
  console.log(`\n${(sb.brand && sb.brand.name) || "StockHuntr"} screencast — ${segs.length} segments · "${sb.title}"\n`);

  // 1) Narration audio (ElevenLabs). No key → SILENT placeholders so the full pipeline still runs;
  //    add the key and re-run with REGEN=1 for the real voice.
  const haveKey = !!process.env.ELEVENLABS_API_KEY;
  console.log(`▶ 1/4 narration ${haveKey ? "(ElevenLabs)" : "(SILENT placeholders — no ELEVENLABS_API_KEY; add it + REGEN=1 for the voice)"}`);
  const TITLE_HOLD = 3;   // a no-audio cover slide (empty narration) is held this many seconds
  for (const s of segs) {
    // A title/cover slide carries no narration — it is a SILENT hold, no TTS, no caption.
    s._silent = s.visualKind === "title" && !String(s.narration || "").trim();
    if (s._silent) { s._mp3 = null; s._dur = TITLE_HOLD; continue; }
    // TTS reads narrationSpoken when present (phonetic spellings for the voice, e.g. "sock two",
    // "twenty twenty-six", "N-A-I") while `narration` stays clean for the on-screen captions.
    const ttsText = s.narrationSpoken || s.narration;
    const mp3 = D("audio", `${s.id}.mp3`);
    if (!fs.existsSync(mp3) || process.env.REGEN) { if (haveKey) await elevenTTS(ttsText, mp3); else silentAudio(ttsText, mp3); }
    s._mp3 = mp3; s._dur = audioDurationSec(mp3);
  }
  console.log(`  ✓ ${segs.length} clips · ~${Math.round(segs.reduce((a, s) => a + s._dur, 0))}s total`);

  // 2) Slide + image frames (Playwright screenshot of on-brand HTML). "slide" = title+bullets;
  //    "image" = title + a centered diagram/screenshot from docs/assets + caption.
  console.log("\n▶ 2/4 slide frames");
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })).newPage();
  const frameSegs = segs.filter((x) => x.visualKind === "slide" || x.visualKind === "image" || x.visualKind === "title");
  for (const s of frameSegs) {
    await page.setContent(s.visualKind === "image" ? imageHTML(s) : s.visualKind === "title" ? titleHTML(s) : slideHTML(s), { waitUntil: "load" });
    await page.screenshot({ path: D("frames", `${s.id}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  }
  await browser.close();
  console.log(`  ✓ ${frameSegs.length} frames`);

  // 3) Live demo recording (if the dashboard is up); else fall back to slides for demo segments.
  console.log("\n▶ 3/4 live demo");
  const demoSegs = segs.filter((x) => x.visualKind === "demo");
  const firstNav = demoSegs.flatMap((s) => s.demoSteps || []).find((d) => d.action === "navigate" && /^https?:\/\//.test(d.target || ""))?.target;
  const baseUrl = process.env.SCREENCAST_URL || (firstNav ? new URL(firstNav).origin : "http://localhost:3000");
  let demo = null;
  if (demoSegs.length && reachable(baseUrl)) {
    demo = await recordDemo(demoSegs.map((s) => ({ id: s.id, section: s.section, narrationSec: s._dur, steps: s.demoSteps || [] })), { baseUrl, outDir: D("clips") });
    console.log(`  ✓ recorded ${demoSegs.length} demo segments → ${path.basename(demo.videoPath)}`);
  } else if (demoSegs.length) {
    console.log(`  ⚠ ${baseUrl} not reachable — run \`npm run serve\` for the LIVE demo. Falling back to slides for demo segments.`);
    const b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })).newPage();
    for (const s of demoSegs) {
      await pg.setContent(slideHTML({ ...s, slideBullets: s.slideBullets && s.slideBullets.length ? s.slideBullets : (s.demoSteps || []).map((d) => d.note).filter(Boolean).slice(0, 4) }), { waitUntil: "load" });
      await pg.screenshot({ path: D("frames", `${s.id}.png`), clip: { x: 0, y: 0, width: W, height: H } });
    }
    await b.close();
  }

  // 4) Assemble each segment → clip, then concat in order.
  console.log("\n▶ 4/4 assemble");
  const clips = [];
  const cues = [];   // closed-caption cues, accumulated against the real assembled timeline
  let cursor = 0;    // running start time (s) of the next clip in the final video
  // Prepend a 0.5s SILENT hold of the opening slide so the first spoken word's onset isn't clipped
  // — UNLESS the first segment is already a silent title cover (it provides its own opening hold).
  if (!segs[0]?._silent) {
    const leadFrame = D("frames", `${segs[0].id}.png`);
    if (fs.existsSync(leadFrame)) {
      const leadOut = D("clips", "clip-lead.mp4");
      leadClip(leadFrame, leadOut, LEAD_IN);
      clips.push(leadOut);
      cursor += audioDurationSec(leadOut);   // silent lead-in — no caption
      console.log(`  ✓ lead-in (${LEAD_IN}s silent title slide)`);
    }
  }
  for (const s of segs) {
    const out = D("clips", `clip-${String(s._i).padStart(2, "0")}.mp4`);
    if (s._silent) {
      // A no-audio cover slide: a fixed silent hold of its frame, and no caption cue.
      leadClip(D("frames", `${s.id}.png`), out, s._dur);
      clips.push(out);
      cursor += audioDurationSec(out);
      console.log(`  ✓ clip ${s._i} (title cover, ${s._dur}s silent)`);
      continue;
    }
    if (s.visualKind === "demo" && demo) {
      const t = demo.timing.find((x) => x.id === s.id);
      const cut = D("clips", `demo-${s.id}.mp4`);
      ff(["-y", "-i", demo.videoPath, "-ss", String((t?.startSec ?? 0).toFixed(2)), "-t", String((t?.durSec ?? s._dur).toFixed(2)), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", cut]);
      demoClip(cut, s._mp3, out);
    } else {
      slideClip(D("frames", `${s.id}.png`), s._mp3, out);
    }
    clips.push(out);
    // The narration plays at the START of each clip (sped by SPEED); the GAP tail is silent.
    const clipDur = audioDurationSec(out);
    const spoken = Math.max(0.6, Math.min(s._dur / SPEED, clipDur));
    cues.push(...segmentCues(s.narration, cursor, spoken));
    cursor += clipDur;
    console.log(`  ✓ clip ${s._i} (${s.section})`);
  }
  const final = D(sb.output || "bastion-screencast.mp4");
  concatClips(clips, final, D("clips"));
  // Closed captions: toggleable SRT + WebVTT sidecars next to the mp4 (CAPTIONS=burn also bakes them in).
  const base = final.replace(/\.mp4$/, "");
  writeCaptions(cues, `${base}.srt`, `${base}.vtt`);
  console.log(`  ✓ captions → ${path.basename(base)}.srt + .vtt (${cues.length} cues)`);
  if (process.env.CAPTIONS === "burn") {
    // Open captions: this box's ffmpeg has no libass/drawtext, so burn-captions.mjs renders the cues
    // as transparent PNGs (Chromium) and overlays them. Run as a subprocess (it drives its own browser).
    const r = spawnSync("node", [fileURLToPath(new URL("./burn-captions.mjs", import.meta.url)), final], { stdio: "inherit" });
    if (r.status === 0) console.log(`  ✓ open-caption cut → ${path.basename(base)}-cc.mp4`);
    else console.log("  ⚠ open-caption burn failed (sidecar .srt/.vtt still produced)");
  }
  const total = segs.reduce((a, s) => a + s._dur, 0);
  console.log(`\n✅ ${final}  (~${Math.round(total)}s, ${segs.length} segments)\n`);
}
main().catch((e) => { console.error("\n✗ " + (e && e.stack || e) + "\n"); process.exit(1); });
