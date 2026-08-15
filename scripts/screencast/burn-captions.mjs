// SPDX-License-Identifier: Apache-2.0
// Burn the sidecar .srt into an OPEN-caption "-cc.mp4" WITHOUT libass/drawtext (this box's ffmpeg
// has neither). Each cue is rendered to a transparent PNG by Chromium (the same engine as the slides),
// composited into ONE alpha caption track (qtrle .mov) via the concat demuxer, then overlaid in a
// single pass onto the video.  Usage:  node scripts/screencast/burn-captions.mjs <video.mp4>
// (expects a sibling <video>.srt).  Set BURN_TEST_SEC=60 to render only the first N seconds (a quick check).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { W, H, SCALE } from "./lib.mjs";

const ff = (args) => { const r = spawnSync("ffmpeg", args, { encoding: "utf8" }); if (r.status !== 0) throw new Error("ffmpeg: " + (r.stderr || "").slice(-500)); };
const probeDur = (p) => Number((spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" }).stdout || "0").trim()) || 0;
// Read the ACTUAL video dimensions so captions always match, regardless of how this was invoked (the
// SCALE env may be unset when run standalone — that shipped 1080p captions onto a 1440p cut).
const probeWH = (p) => { const s = (spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", p], { encoding: "utf8" }).stdout || "").trim().split(","); return { w: Number(s[0]) || W, h: Number(s[1]) || H }; };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parseTs = (s) => { const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
function parseSrt(p) {
  const cues = [];
  for (const b of fs.readFileSync(p, "utf8").split(/\r?\n\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const lines = b.split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = lines[i].split("-->");
    cues.push({ start: parseTs(a), end: parseTs(z), text: lines.slice(i + 1).join(" ").trim() });
  }
  return cues;
}

// A single caption "line box" pinned near the bottom, on a transparent page.
function captionHTML(text) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
    .wrap{position:absolute;left:0;right:0;bottom:92px;display:flex;justify-content:center;padding:0 120px}
    .cap{max-width:1400px;background:rgba(9,11,16,.82);color:#f4f6fb;
      font:600 34px/1.34 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      padding:14px 28px;border-radius:12px;text-align:center;letter-spacing:.1px;
      box-shadow:0 8px 34px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12)}
  </style></head><body>${text ? `<div class="wrap"><div class="cap">${esc(text)}</div></div>` : ""}</body></html>`;
}

async function main() {
  const mp4 = process.argv[2];
  if (!mp4 || !fs.existsSync(mp4)) throw new Error("usage: burn-captions.mjs <video.mp4> (with sibling .srt)");
  const base = mp4.replace(/\.mp4$/, "");
  const srt = `${base}.srt`;
  if (!fs.existsSync(srt)) throw new Error(`no sidecar SRT next to the video: ${srt}`);
  // Match the caption canvas to the video: lay out at W×H logical, render at the video's device density
  // so each PNG is exactly the video's pixel size and overlay=0:0 lines up perfectly at the bottom.
  const { w: VW, h: VH } = probeWH(mp4);
  const dpr = VH / H;
  console.log(`  video ${VW}×${VH} → caption density ${dpr.toFixed(3)}`);
  const cap = Number(process.env.BURN_TEST_SEC) || 0;
  let cues = parseSrt(srt);
  if (cap) cues = cues.filter((c) => c.start < cap);
  const total = cap || probeDur(mp4);
  const dir = `${base}-ccframes`;
  fs.mkdirSync(dir, { recursive: true });
  console.log(`burn-captions: ${cues.length} cues, ${total.toFixed(0)}s → rendering transparent PNGs`);

  // 1) blank + per-cue transparent PNGs (Chromium, omitBackground)
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr })).newPage();
  const blank = path.join(dir, "blank.png");
  await page.setContent(captionHTML(""), { waitUntil: "load" });
  await page.screenshot({ path: blank, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  const cuePng = [];
  for (let i = 0; i < cues.length; i++) {
    const f = path.join(dir, `c${String(i).padStart(4, "0")}.png`);
    await page.setContent(captionHTML(cues[i].text), { waitUntil: "load" });
    await page.screenshot({ path: f, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
    cuePng.push(f);
  }
  await browser.close();
  console.log(`  ✓ ${cues.length + 1} PNGs`);

  // 2) ffconcat timeline: blank during gaps, each cue PNG for its duration
  const rows = ["ffconcat version 1.0"];
  const add = (file, dur) => { if (dur > 0.001) rows.push(`file '${path.resolve(file)}'`, `duration ${dur.toFixed(3)}`); };
  let t = 0;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start > t) add(blank, cues[i].start - t);
    add(cuePng[i], Math.max(0.05, cues[i].end - cues[i].start));
    t = cues[i].end;
  }
  if (total > t) add(blank, total - t);
  rows.push(`file '${path.resolve(blank)}'`);   // concat quirk: repeat last so its duration is honored
  const listPath = path.join(dir, "track.ffconcat");
  fs.writeFileSync(listPath, rows.join("\n") + "\n");

  // 3) single alpha caption track (qtrle .mov keeps transparency), CFR 30
  console.log("  ▶ encoding alpha caption track (qtrle)");
  const track = path.join(dir, "track.mov");
  ff(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-r", "30", "-c:v", "qtrle", "-pix_fmt", "argb", track]);

  // 4) ONE overlay onto the video → -cc.mp4
  console.log("  ▶ overlaying onto the video");
  const out = `${base}${cap ? "-cctest" : "-cc"}.mp4`;
  ff(["-y", "-i", mp4, "-i", track, "-filter_complex", "[0:v][1:v]overlay=0:0:eof_action=pass:format=auto[v]",
    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "copy", ...(cap ? ["-t", String(cap)] : []), out]);
  console.log(`\n✅ ${out}  (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)\n`);
}
main().catch((e) => { console.error("\n✗ " + (e && e.stack || e) + "\n"); process.exit(1); });
