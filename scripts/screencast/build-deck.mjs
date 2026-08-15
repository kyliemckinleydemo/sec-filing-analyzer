// SPDX-License-Identifier: Apache-2.0
// Marketing-deck builder: renders a deck-storyboard.json into on-brand slide PNGs and a combined PDF,
// reusing the SAME slide renderer as the screencast (scripts/screencast/lib.mjs) so the deck and the
// promo video share one visual language.
//   node scripts/screencast/build-deck.mjs [deck-storyboard.json]
// Output: deck/stockhuntr-deck.pdf  +  deck/slides/NN-<id>.png  (individual slides for Keynote/Slides).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { slideHTML, imageHTML, titleHTML, setBrand, setParts, W, H } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCALE = Number(process.env.DECK_SCALE) || 2; // 2x = crisp on retina + print

async function main() {
  const sbPath = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "deck-storyboard.json");
  const sb = JSON.parse(fs.readFileSync(sbPath, "utf8"));
  if (sb.brand) setBrand(sb.brand);
  if (sb.parts) setParts(sb.parts);
  const segs = sb.segments.map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, _i: i }));

  const OUT = path.join(ROOT, "deck");
  const SLIDES = path.join(OUT, "slides");
  fs.mkdirSync(SLIDES, { recursive: true });
  console.log(`\n${(sb.brand && sb.brand.name) || "StockHuntr"} deck — ${segs.length} slides · "${sb.title}"\n`);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })).newPage();

  // 1) Render each segment to a full-bleed 1920×1080 PNG (same HTML the video frames use).
  const pngs = [];
  for (const s of segs) {
    const html = s.visualKind === "image" ? imageHTML(s) : s.visualKind === "title" ? titleHTML(s) : slideHTML(s);
    await page.setContent(html, { waitUntil: "load" });
    const p = path.join(SLIDES, `${String(s._i + 1).padStart(2, "0")}-${s.id}.png`);
    await page.screenshot({ path: p, clip: { x: 0, y: 0, width: W, height: H } });
    pngs.push(p);
    console.log(`  ✓ slide ${s._i + 1}  ${s.slideTitle ? `— ${s.slideTitle.slice(0, 52)}` : ""}`);
  }

  // 2) Assemble the PNGs into one PDF — each slide is one 1920×1080 page (no margins, backgrounds on).
  const pagesHtml = pngs.map((p) => `<img src="data:image/png;base64,${fs.readFileSync(p).toString("base64")}"/>`).join("");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${W}px ${H}px; margin: 0; }
    * { margin: 0; padding: 0; }
    html, body { background: #020617; }
    img { display: block; width: ${W}px; height: ${H}px; page-break-after: always; }
    img:last-child { page-break-after: auto; }
  </style></head><body>${pagesHtml}</body></html>`;
  await page.setContent(doc, { waitUntil: "load" });
  const pdfPath = path.join(OUT, sb.output || "stockhuntr-deck.pdf");
  await page.pdf({ path: pdfPath, width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: `1-${pngs.length}` });
  await browser.close();

  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log(`\n✅ ${pdfPath}  (${pngs.length} slides, ${kb} KB)`);
  console.log(`   individual slides → ${path.relative(ROOT, SLIDES)}/\n`);
}
main().catch((e) => { console.error("\n✗ " + (e && e.stack || e) + "\n"); process.exit(1); });
