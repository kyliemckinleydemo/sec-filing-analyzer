// SPDX-License-Identifier: Apache-2.0
// Records the live Bastion dashboard demo with Playwright: a visible cursor + click-RIPPLE overlay,
// and each demo segment paced to its narration duration so the narration stays synced to the actions.
import { chromium } from "playwright";
import { W, H, OW, OH, SCALE } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected into every page: a floating cursor + an expanding ring on each click (real or scripted).
const OVERLAY = `
(() => {
  if (window.__castInit) return; window.__castInit = 1;
  const cur = document.createElement('div');
  cur.id='__cast_cursor';
  cur.style.cssText='position:fixed;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;left:50vw;top:62vh;opacity:0;pointer-events:none;border-radius:50%;background:rgba(45,212,191,.35);border:2px solid #2dd4bf;box-shadow:0 0 10px rgba(45,212,191,.6);transition:left .4s cubic-bezier(.22,1,.36,1),top .4s cubic-bezier(.22,1,.36,1),opacity .3s ease';
  const add=()=>{ if(document.body && !document.getElementById('__cast_cursor')) document.body.appendChild(cur); };
  add(); document.addEventListener('DOMContentLoaded', add);
  // Fade the cursor IN and slide it to the target (a placed, deliberate move — not a jump from off-screen).
  window.__castMove=(x,y)=>{ add(); cur.style.opacity='1'; cur.style.left=x+'px'; cur.style.top=y+'px'; };
  // Fade it OUT when nothing is being pointed at (scripted chat turns) so it's never hovering idly.
  window.__castHide=()=>{ const c=document.getElementById('__cast_cursor'); if(c) c.style.opacity='0'; };
  window.__castRipple=(x,y)=>{ add(); const r=document.createElement('div');
    r.style.cssText='position:fixed;z-index:2147483646;left:'+x+'px;top:'+y+'px;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:3px solid #2dd4bf;pointer-events:none;opacity:.9;transition:all .55s ease-out';
    document.body.appendChild(r); requestAnimationFrame(()=>{ r.style.width='84px';r.style.height='84px';r.style.margin='-42px 0 0 -42px';r.style.opacity='0'; });
    setTimeout(()=>r.remove(),650); cur.style.transform='scale(.8)'; setTimeout(()=>cur.style.transform='scale(1)',150); };
  document.addEventListener('click', e=>window.__castRipple(e.clientX,e.clientY), true);
})();`;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The agent writes verbose targets with the real hooks EMBEDDED, e.g.
//   "the 'Sensitive record' example chip"  ·  "the 'Boundary' row ... in #result"
// So extract quoted labels + #id/.class tokens and try those (specific → general).
async function resolve(page, target) {
  const t = String(target);
  const tries = [];
  const quoted = [...t.matchAll(/[‘'"“]([^’'"”]{2,60})[’'"”]/g)].map((m) => m[1].trim()).filter(Boolean);
  const css = [...t.matchAll(/(#[A-Za-z][\w-]*|\.[A-Za-z][\w-]{2,})/g)].map((m) => m[1]);
  for (const q of quoted) {
    const re = new RegExp(escapeRe(q), "i");
    tries.push(() => page.getByRole("button", { name: re }).first());
    tries.push(() => page.getByRole("link", { name: re }).first());
    tries.push(() => page.locator(`.examples`).getByText(re).first());
    tries.push(() => page.getByText(re).first());
    tries.push(() => page.getByPlaceholder(re).first());
  }
  for (const c of css) tries.push(() => page.locator(c).first());
  tries.push(() => page.getByText(new RegExp(escapeRe(t.slice(0, 36)), "i")).first());
  for (const fn of tries) {
    try { const loc = fn(); if (await loc.count() > 0 && await loc.isVisible()) return loc; } catch { /* next */ }
  }
  return null;
}

// A fresh Playwright context has no localStorage, so first-run onboarding/overlays appear — dismiss them.
async function dismissOverlay(page) {
  for (const name of ["Skip", "Use defaults", "Skip - use defaults", "Got it", "Close", "Dismiss", "Continue"]) {
    try {
      const b = page.getByRole("button", { name: new RegExp(escapeRe(name), "i") }).first();
      if (await b.count() > 0 && await b.isVisible()) { await b.click({ timeout: 2000 }).catch(() => {}); await sleep(400); return; }
    } catch { /* next */ }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function pointAt(page, loc) {
  try {
    const box = await loc.boundingBox();
    if (!box) return null;
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    await page.evaluate(([x, y]) => window.__castMove && window.__castMove(x, y), [x, y]);
    await sleep(420);
    await page.evaluate(([x, y]) => window.__castRipple && window.__castRipple(x, y), [x, y]);
    await sleep(160);
    return { x, y };
  } catch { return null; }
}

/** plan: [{ id, section:'demo', narrationSec, steps:[{action,target,value,note}] }], baseUrl. */
export async function recordDemo(plan, { baseUrl = "http://localhost:3000", outDir }) {
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  // Record at the NATIVE viewport size (recordVideo.size == viewport) so the page FILLS the frame.
  // Playwright only scales a recording DOWN to fit `size`; a viewport smaller than `size` lands in the
  // TOP-LEFT with black margins (the "demo in the corner" bug at 1440p). demoClip() then upscales the
  // native W×H recording to the OW×OH canvas (same 16:9 aspect → clean, no distortion).
  const context = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: { width: W, height: H } },
    colorScheme: "dark",
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" }).catch(() => {});
  await page.evaluate(OVERLAY).catch(() => {});
  await sleep(800);
  await dismissOverlay(page);

  const recordStart = Date.now();
  const timing = [];
  for (const seg of plan) {
    const startSec = (Date.now() - recordStart) / 1000;
    for (const step of (seg.steps || [])) {
      try {
        if (step.action === "navigate") {
          const url = step.target.startsWith("http") ? step.target : baseUrl.replace(/\/$/, "") + "/" + step.target.replace(/^\//, "");
          await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
          await page.evaluate(OVERLAY).catch(() => {});
          await sleep(500);
          await dismissOverlay(page);
          // Anchor every page at the TOP so the sticky nav + first panel are always fully in frame
          // (the taller restructured pages otherwise land mid-scroll with the header clipped).
          await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
          await sleep(150);
        } else if (step.action === "wait") {
          await page.waitForLoadState("networkidle").catch(() => {}); // let a chat reply's fetch land before we move on
          await sleep(Math.min(9000, Number(step.value) || 1200));
        } else if (step.action === "scroll") {
          await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), Number(step.value) || 500);
          await sleep(700);
        } else if (step.action === "scenario") {
          // Drive the chat client's SCRIPTED demo: it highlights the active scenario chip (a color
          // change — no cursor, no click that reads as a needed user action) and plays the turns with
          // their governance badges, fast + deterministic. Park the cursor off-screen so it isn't
          // hovering a chip, then await the scripted exchange; the segment then paces to narration.
          await page.evaluate(() => window.__castHide && window.__castHide()).catch(() => {});
          await page.evaluate((key) => (window.__bastionDemo ? window.__bastionDemo(key) : null), step.target).catch((e) => console.log(`  · scenario error «${step.target}»: ${String(e).slice(0, 60)}`));
          await sleep(500);
        } else if (step.action === "turn") {
          // Play ONE turn of a scenario (target "key:index"), APPENDED to the running conversation — reset
          // only on turn 0. The following `wait` steps pace each turn to the narration, so the chat builds
          // up in sync with the voice instead of a whole scenario firing (and wiping) at once.
          const [key, idx] = String(step.target).split(":");
          await page.evaluate(() => window.__castHide && window.__castHide()).catch(() => {});
          await page.evaluate(([k, i]) => (window.__bastionTurn ? window.__bastionTurn(k, Number(i)) : null), [key, idx]).catch((e) => console.log(`  · turn error «${step.target}»: ${String(e).slice(0, 60)}`));
          await sleep(300);
        } else {
          const loc = await resolve(page, step.target);
          if (!loc) { console.log(`  · step skipped (not found): ${step.action} «${step.target}»`); continue; }
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          const pt = await pointAt(page, loc);
          if (step.action === "click") { await loc.click({ timeout: 8000 }).catch(() => {}); await sleep(700); }
          else if (step.action === "type") { await loc.click({ timeout: 8000 }).catch(() => {}); await loc.fill(String(step.value ?? ""), { timeout: 8000 }).catch(() => {}); await sleep(500); }
          else if (step.action === "highlight") { await sleep(900); }
        }
      } catch (e) { console.log(`  · step error (${step.action} «${step.target}»): ${String(e).slice(0, 80)}`); }
    }
    // Pace the segment to its narration duration so the audio stays synced.
    const elapsed = (Date.now() - recordStart) / 1000 - startSec;
    const pad = (seg.narrationSec || 0) - elapsed;
    if (pad > 0) await sleep(Math.min(20000, pad * 1000));
    timing.push({ id: seg.id, startSec, durSec: Math.max(elapsed, seg.narrationSec || 0) });
  }
  await sleep(400);
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();
  return { videoPath, timing };
}
