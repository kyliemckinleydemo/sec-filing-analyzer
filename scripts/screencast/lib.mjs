// SPDX-License-Identifier: Apache-2.0
// Screencast production lib: ElevenLabs TTS · audio duration · on-brand slide frames · ffmpeg assembly.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, "..", "..", "docs", "assets");

// StockHuntr palette: near-black navy (slate-950) with a teal accent (matches the brand dot in the
// site header) and a green "good" tone for the closing/summary section.
export const THEME = { BG: "#020617", PANEL: "#0f172a", LINE: "#1e293b", TXT: "#e6e9ef", MUT: "#94a3b8", ACCENT: "#2dd4bf", GOOD: "#34d399" };

// Brand chrome (wordmark + tagline shown on slides). Override per-storyboard via setBrand({...}).
export let BRAND = { name: "StockHuntr", tagline: "chat with SEC filings", footer: "StockHuntr — chat with SEC filings, cited" };
export function setBrand(b = {}) { BRAND = { ...BRAND, ...b }; }
// Gradient endpoint for the brand wordmark mark (accent → this lighter tint).
const MARK_TINT = "#7bffe4";
export const W = 1920, H = 1080;
// Playback tuning: SPEED>1 makes narration + demo N% faster (pitch-preserving atempo); GAP holds a short
// pause (silence + last frame) after each segment so slides breathe and narration doesn't run together.
export const SPEED = 1.0; // natural pace — clarity matters for a product explainer (was 1.2 for Bastion)
export const GAP = 0.45;   // short pause between segments (was 1.0s — too much dead air across 15 segments)
export const LEAD_IN = 0.5; // 0.5s of silence before the very first word so its onset isn't clipped
// Output resolution multiplier over the 1920×1080 LOGICAL layout: 1 = 1080p, 1.3333 = 1440p, 2 = 2160p (4K).
// Slides/captions render at this deviceScaleFactor (crisp); the demo records at the scaled size; ffmpeg
// emits at OW×OH. The CSS is unchanged (still laid out at W×H logical) — only pixel density increases.
export const SCALE = Number(process.env.SCALE) || 1;
export const OW = Math.round(W * SCALE / 2) * 2, OH = Math.round(H * SCALE / 2) * 2; // even dims for yuv420p

// ---- ElevenLabs TTS ---------------------------------------------------------
const EL_MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
// Default voice: "Rachel" (clean, professional, en). Override with ELEVENLABS_VOICE_ID.
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

export async function elevenTTS(text, outPath, opts = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set (add it to .env)");
  const voice = opts.voiceId || EL_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: opts.model || EL_MODEL,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

// Silent placeholder audio sized to the narration (~153 wpm) — lets the whole pipeline run + a cut be
// previewed before the ElevenLabs key is in place. Swap in the real voice later with REGEN=1.
export function silentAudio(text, outPath) {
  const words = Math.max(1, String(text).trim().split(/\s+/).length);
  const dur = Math.max(2.5, words / 2.55);
  const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", dur.toFixed(2), "-q:a", "9", "-acodec", "libmp3lame", outPath], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("silence: " + (r.stderr || "").slice(-200));
  return outPath;
}

export function audioDurationSec(p) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" });
  return parseFloat((r.stdout || "0").trim()) || 0;
}

// ---- On-brand slide HTML (screenshotted to a PNG frame by Playwright) --------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Section pill map: section-key → [partNumber, "LABEL"]. Override per-storyboard via setParts({...}).
let PART = {
  intro: [1, "The Problem"], why: [2, "Why StockHuntr"], principles: [3, "How It Works"],
  features: [4, "Features"], architecture: [5, "Under the Hood"], demo: [6, "Live Demo"], summary: [7, "Get Started"],
};
export function setParts(p) { if (p && typeof p === "object") PART = p; }

export function slideHTML(seg) {
  const t = THEME;
  // A segment may override the PART pill (n + label) — briefing decks carry their own arc
  // (e.g. [3, "The Clean Answer"]) rather than the product deck's fixed sections.
  const [pn, plabel] = seg.part || PART[seg.section] || [0, ""];
  const b = seg.slideBullets || [];
  const hero = b.length <= 1; // title/statement slides get a bigger, centered treatment
  const bullets = b.map((x) => `<li><span class="chev">▸</span><span>${esc(x)}</span></li>`).join("");
  const accent = seg.section === "summary" ? t.GOOD : t.ACCENT;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html,body { width:${W}px; height:${H}px; overflow:hidden; }
    body { color:${t.TXT}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      background:
        radial-gradient(1200px 700px at 88% -8%, ${accent}22, transparent 60%),
        radial-gradient(900px 600px at -6% 108%, #ffffff08, transparent 55%),
        ${t.BG};
      padding:110px 130px 120px; display:flex; flex-direction:column; ${hero ? "justify-content:center;" : ""} position:relative; }
    .eyebrow { display:flex; align-items:center; gap:20px; margin-bottom:26px; }
    .pill { display:inline-flex; align-items:center; gap:12px; background:${t.PANEL}; border:1px solid ${t.LINE};
      border-radius:999px; padding:12px 22px; }
    .pill .dot { width:12px; height:12px; border-radius:50%; background:${accent}; box-shadow:0 0 14px ${accent}; }
    .pill .n { color:${accent}; font-weight:800; letter-spacing:1px; font-size:22px; }
    .pill .sep { color:${t.LINE}; }
    .pill .lbl { color:${t.MUT}; font-weight:700; letter-spacing:3px; text-transform:uppercase; font-size:20px; }
    .rule { width:96px; height:7px; background:${accent}; border-radius:4px; margin:0 0 40px; box-shadow:0 0 22px ${accent}66; }
    h1 { font-size:${hero ? 104 : 70}px; font-weight:800; line-height:1.06; letter-spacing:-1px;
      max-width:${hero ? 1500 : 1560}px; ${hero ? "max-width:1560px;" : ""} }
    .spine { margin-top:52px; padding-left:34px; border-left:4px solid ${accent}55; }
    ul { list-style:none; }
    li { display:flex; gap:22px; align-items:flex-start; font-size:39px; line-height:1.42; margin-bottom:34px; color:#dfe4ee; max-width:1560px; }
    li .chev { color:${accent}; font-weight:800; flex:0 0 auto; margin-top:2px; }
    .brand { position:absolute; bottom:70px; left:130px; display:flex; align-items:center; gap:16px; }
    .brand .mark { width:34px; height:34px; border-radius:9px; background:linear-gradient(135deg, ${t.ACCENT}, ${MARK_TINT}); box-shadow:0 0 20px ${t.ACCENT}55; }
    .brand .txt { color:${t.MUT}; font-size:25px; font-weight:600; }
    .brand .txt b { color:${t.TXT}; font-weight:800; }
    .pageno { position:absolute; bottom:74px; right:130px; color:${t.MUT}; font-size:22px; font-weight:700; letter-spacing:2px; }
  </style></head><body>
    <div class="eyebrow"><span class="pill"><span class="dot"></span><span class="n">PART ${pn}</span><span class="sep">/</span><span class="lbl">${esc(plabel)}</span></span></div>
    <div class="rule"></div>
    <h1>${esc(seg.slideTitle || "")}</h1>
    ${bullets ? `<div class="spine"><ul>${bullets}</ul></div>` : ""}
    <div class="brand"><span class="mark"></span><span class="txt"><b>${esc(BRAND.name)}</b> — ${esc(BRAND.tagline)}</span></div>
    <div class="pageno">${pn} / ${seg.partTotal || 7}</div>
    <script>
      // AUTO-FIT: a dense slide must never flow into the footer. Shrink the bullet list
      // until its bottom clears the brand/pageno row (mirrors the deck renderer's auto-fit).
      (function () {
        var SAFE = ${H} - 150;                 // keep the list this far above the very bottom
        var spine = document.querySelector('.spine');
        if (!spine) return;                    // hero/statement slides have no list
        var lis = spine.querySelectorAll('li');
        var fs = 39, mb = 34, guard = 0;
        while (spine.getBoundingClientRect().bottom > SAFE && fs > 21 && guard < 60) {
          fs -= 1.2; mb = Math.max(12, mb - 1.2); guard++;
          lis.forEach(function (li) { li.style.fontSize = fs + 'px'; li.style.marginBottom = mb + 'px'; li.style.lineHeight = '1.34'; });
        }
      })();
    </script>
  </body></html>`;
}

function imgDataUri(name) {
  return "data:image/png;base64," + fs.readFileSync(path.join(ASSETS, name)).toString("base64");
}

// A narrated IMAGE segment (visualKind:"image") — an on-brand frame with the PART pill + title, a
// centered diagram/screenshot from docs/assets/, and a caption. Lets a briefing video show the
// control-stack diagram and real product screenshots, not just bullet slides. Held for its narration
// like any slide (build.mjs renders it to a frame the same way).
export function imageHTML(seg) {
  const t = THEME;
  const [pn, plabel] = seg.part || PART[seg.section] || [0, ""];
  const accent = seg.section === "summary" ? t.GOOD : t.ACCENT;
  const cap = seg.caption || "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html,body { width:${W}px; height:${H}px; overflow:hidden; }
    body { color:${t.TXT}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      background:
        radial-gradient(1200px 700px at 88% -8%, ${accent}22, transparent 60%),
        radial-gradient(900px 600px at -6% 108%, #ffffff08, transparent 55%),
        ${t.BG};
      padding:84px 120px 96px; display:flex; flex-direction:column; position:relative; }
    .eyebrow { display:flex; align-items:center; gap:20px; margin-bottom:20px; }
    .pill { display:inline-flex; align-items:center; gap:12px; background:${t.PANEL}; border:1px solid ${t.LINE};
      border-radius:999px; padding:10px 20px; }
    .pill .dot { width:11px; height:11px; border-radius:50%; background:${accent}; box-shadow:0 0 14px ${accent}; }
    .pill .n { color:${accent}; font-weight:800; letter-spacing:1px; font-size:20px; }
    .pill .sep { color:${t.LINE}; }
    .pill .lbl { color:${t.MUT}; font-weight:700; letter-spacing:3px; text-transform:uppercase; font-size:18px; }
    .rule { width:88px; height:6px; background:${accent}; border-radius:4px; margin:0 0 22px; box-shadow:0 0 22px ${accent}66; }
    h1 { font-size:56px; font-weight:800; line-height:1.06; letter-spacing:-1px; max-width:1600px; margin-bottom:26px; }
    .imgwrap { flex:1; display:flex; align-items:center; justify-content:center; min-height:0; }
    .imgwrap img { max-width:1560px; max-height:${seg.imageMaxH || (cap ? 560 : 640)}px; border:1px solid ${t.LINE}; border-radius:12px; }
    .cap { color:${t.MUT}; font-size:24px; line-height:1.4; max-width:1600px; margin-top:20px; }
    .brand { position:absolute; bottom:52px; left:120px; display:flex; align-items:center; gap:16px; }
    .brand .mark { width:32px; height:32px; border-radius:9px; background:linear-gradient(135deg, ${t.ACCENT}, ${MARK_TINT}); box-shadow:0 0 20px ${t.ACCENT}55; }
    .brand .txt { color:${t.MUT}; font-size:23px; font-weight:600; }
    .brand .txt b { color:${t.TXT}; font-weight:800; }
    .pageno { position:absolute; bottom:56px; right:120px; color:${t.MUT}; font-size:20px; font-weight:700; letter-spacing:2px; }
  </style></head><body>
    <div class="eyebrow"><span class="pill"><span class="dot"></span><span class="n">PART ${pn}</span><span class="sep">/</span><span class="lbl">${esc(plabel)}</span></span></div>
    <div class="rule"></div>
    <h1>${esc(seg.slideTitle || "")}</h1>
    <div class="imgwrap"><img src="${imgDataUri(seg.image)}"/></div>
    ${cap ? `<div class="cap">${esc(cap)}</div>` : ""}
    <div class="brand"><span class="mark"></span><span class="txt"><b>${esc(BRAND.name)}</b> — ${esc(BRAND.tagline)}</span></div>
    <div class="pageno">${pn} / ${seg.partTotal || 7}</div>
  </body></html>`;
}

// The opening COVER slide (visualKind:"title") — brand wordmark + a hero tagline (the part after an
// em-dash renders in the accent colour) + a one/two-line intro. No PART pill or page number.
export function titleHTML(seg) {
  const t = THEME, accent = t.ACCENT;
  const parts = String(seg.slideTitle || "").split(/\s*—\s*/);
  const hero = parts.length > 1
    ? `${esc(parts[0])} —<br><span class="accent">${esc(parts.slice(1).join(" — "))}</span>`
    : esc(seg.slideTitle || "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing:border-box; margin:0; padding:0; }
    html,body { width:${W}px; height:${H}px; overflow:hidden; }
    body { color:${t.TXT}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      background:
        radial-gradient(1300px 820px at 84% -14%, ${accent}30, transparent 60%),
        radial-gradient(1000px 700px at -8% 114%, #7bd0ff14, transparent 55%),
        ${t.BG};
      padding:132px 140px; display:flex; flex-direction:column; justify-content:center; position:relative; }
    .brand { display:flex; align-items:center; gap:22px; margin-bottom:64px; }
    .brand .mark { width:60px; height:60px; border-radius:15px; background:linear-gradient(135deg, ${t.ACCENT}, ${MARK_TINT}); box-shadow:0 0 34px ${t.ACCENT}66; }
    .brand .name { font-size:50px; font-weight:800; letter-spacing:-1px; }
    .brand .cat { color:${t.MUT}; font-size:28px; font-weight:600; }
    .rule { width:120px; height:8px; background:${accent}; border-radius:5px; margin:0 0 46px; box-shadow:0 0 26px ${accent}77; }
    h1 { font-size:100px; font-weight:850; line-height:1.04; letter-spacing:-2px; max-width:1560px; margin-bottom:48px; }
    h1 .accent { color:${accent}; }
    .intro { color:#cfd6e4; font-size:38px; line-height:1.5; max-width:1400px; font-weight:400; }
  </style></head><body>
    <div class="brand"><span class="mark"></span><span class="name">${esc(BRAND.name)}</span><span class="cat">— ${esc(seg.tagline || BRAND.tagline)}</span></div>
    <div class="rule"></div>
    <h1>${hero}</h1>
    ${seg.intro ? `<div class="intro">${esc(seg.intro)}</div>` : ""}
  </body></html>`;
}

// ---- ffmpeg assembly --------------------------------------------------------
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-500)}`);
  return r;
}

// A still slide, held for the (SPEED-adjusted) narration + a GAP pause before the next slide.
export function slideClip(png, mp3, outMp4) {
  const dur = audioDurationSec(mp3) / SPEED;   // narration, sped up (pitch-preserving)
  const total = dur + GAP;                      // + a breather between slides
  run("ffmpeg", ["-y", "-loop", "1", "-i", png, "-i", mp3,
    "-filter_complex",
    `[0:v]scale=${OW}:${OH}:force_original_aspect_ratio=decrease,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v];[1:a]atempo=${SPEED},apad=pad_dur=${GAP}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(2), outMp4]);
  return outMp4;
}

// A short SILENT hold of a still frame — prepended as the very first clip so the opening word isn't
// clipped: the title slide simply shows for `sec` seconds of silence before the narrated intro begins.
export function leadClip(png, outMp4, sec = LEAD_IN) {
  run("ffmpeg", ["-y", "-loop", "1", "-i", png, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
    "-filter_complex", `[0:v]scale=${OW}:${OH}:force_original_aspect_ratio=decrease,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-t", sec.toFixed(2), outMp4]);
  return outMp4;
}

// The demo screen recording (SPEED-adjusted) with narration muxed; pad the shorter stream + a GAP tail.
export function demoClip(demoMp4, mp3, outMp4) {
  const vDur = audioDurationSec(demoMp4) / SPEED, aDur = audioDurationSec(mp3) / SPEED;
  const total = Math.max(vDur, aDur) + GAP;
  run("ffmpeg", ["-y", "-i", demoMp4, "-i", mp3,
    "-filter_complex",
    `[0:v]setpts=PTS/${SPEED},scale=${OW}:${OH}:force_original_aspect_ratio=increase,crop=${OW}:${OH},setsar=1,tpad=stop_mode=clone:stop_duration=${Math.max(0, total - vDur).toFixed(2)}[v];[1:a]atempo=${SPEED},apad=pad_dur=${Math.max(0, total - aDur).toFixed(2)}[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(2), outMp4]);
  return outMp4;
}

// Concatenate segment clips (re-encode for uniform params → clean joins).
export function concatClips(clips, outMp4, workDir) {
  const listFile = path.join(workDir, "concat.txt");
  fs.writeFileSync(listFile, clips.map((c) => `file '${path.resolve(c)}'`).join("\n"));
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k",
    "-vf", `scale=${OW}:${OH}:force_original_aspect_ratio=decrease,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    outMp4]);
  return outMp4;
}

// ---- Closed captions (SRT + WebVTT), synced to the assembled timeline -------
// timestamp → "HH:MM:SS,mmm" (SRT, sep=",") or "HH:MM:SS.mmm" (VTT, sep=".").
function fmtTime(t, sep) {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}${sep}${p(ms % 1000, 3)}`;
}
// Split an over-long sentence at the comma/dash nearest its middle (recursively).
function splitLong(sent, maxChars) {
  sent = sent.trim();
  if (sent.length <= maxChars) return [sent];
  const seps = [...sent.matchAll(/, | — | – |; /g)].map((m) => ({ i: m.index, len: m[0].length, comma: /^[,;]/.test(m[0]) }));
  if (!seps.length) return [sent];
  const mid = sent.length / 2;
  let best = seps[0];
  for (const s of seps) if (Math.abs(s.i - mid) < Math.abs(best.i - mid)) best = s;
  const left = sent.slice(0, best.i + (best.comma ? 1 : 0)).trim();
  const right = sent.slice(best.i + best.len).trim();
  return [...splitLong(left, maxChars), ...splitLong(right, maxChars)];
}
// Turn TTS-phonetic spellings into their display form for captions (audio keeps the phonetics):
// initialisms written A.I. / A-W-S / D-L-P / G-C-P → AI/AWS/DLP/GCP, and "socks" → "SOX".
// (Collapsing A.I. also stops the sentence splitter from breaking it into "A." / "I." fragments.)
function displayText(text) {
  // Keep a sentence-ending period after an initialism ONLY when the next word is a real
  // sentence-starter — so "A.I. We're" keeps the break, but "A.I. Governance Plane" (mid-phrase,
  // capitalized noun) collapses to "AI Governance Plane" and doesn't split into "AI." / "Governance".
  const STARTERS = "We|It|This|That|The|A|An|And|So|But|Or|Now|Here|Then|You|Your|I|In|On|For|With|No|Two|One|Both|Most|Every|Local|Their|They|He|She|StockHuntr|Claude";
  return String(text)
    .replace(/\b([A-Z](?:-[A-Z])+)\b/g, (m) => m.replace(/-/g, ""))
    .replace(new RegExp(`\\b([A-Z](?:\\.[A-Z])+)\\.(?=\\s+(?:${STARTERS})\\b)`, "g"), (m) => m.replace(/\./g, "") + ".")
    .replace(/\b([A-Z](?:\.[A-Z])+)\.?/g, (m) => m.replace(/\./g, ""))
    .replace(/\bsocks\b/g, "SOX");
}
// Narration → readable cue-sized chunks (sentence-level, long sentences halved).
function splitCues(text, maxChars = 140) {
  const norm = displayText(String(text).replace(/\s+/g, " ").trim());
  const sentences = norm.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [norm];
  return sentences.flatMap((s) => splitLong(s.trim(), maxChars)).filter(Boolean);
}
// Cues for ONE segment across [start, start+spoken]; time split by chunk char length.
export function segmentCues(text, start, spoken) {
  const chunks = splitCues(text);
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  const cues = []; let t = start;
  for (const c of chunks) { const d = spoken * (c.length / total); cues.push({ start: t, end: t + d, text: c }); t += d; }
  return cues;
}
// Write the toggleable caption sidecars next to the mp4 (players/YouTube/Vimeo load them as CC).
export function writeCaptions(cues, srtPath, vttPath) {
  fs.writeFileSync(srtPath, cues.map((c, i) => `${i + 1}\n${fmtTime(c.start, ",")} --> ${fmtTime(c.end, ",")}\n${c.text}`).join("\n\n") + "\n");
  if (vttPath) fs.writeFileSync(vttPath, "WEBVTT\n\n" + cues.map((c) => `${fmtTime(c.start, ".")} --> ${fmtTime(c.end, ".")}\n${c.text}`).join("\n\n") + "\n");
  return srtPath;
}
// Open captions (CAPTIONS=burn) are produced by scripts/screencast/burn-captions.mjs, which renders
// each cue to a transparent PNG (Chromium) and overlays them — this box's ffmpeg has no libass/drawtext.
