/**
 * Dev-only: render label cards to SVG files and assert nothing overflows the
 * 4x6 trim. Run with `pnpm preview:labels`, then open scripts/out/*.svg.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { renderToStaticMarkup } from "react-dom/server";

import LabelCard, { type LabelFields } from "../components/LabelCard";

/** Inline a repo-relative image so resvg can render it. */
function dataUri(relativePath: string): string {
  const mime = relativePath.endsWith(".png") ? "image/png" : "image/jpeg";
  const bytes = readFileSync(new URL(`../${relativePath}`, import.meta.url));

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

const CASES: { file: string; fields: LabelFields }[] = [
  {
    file: "worst-case",
    fields: {
      name: "Adnams Ghost Ship Remixed",
      style: "Pale Ale",
      abv: "4.5",
      brewedDate: "2026-09-01",
      tappedDate: "2026-09-14",
      batch: "#12",
      notes:
        "Big citrus nose with soft bitterness and a dry finish. Best served properly cold, straight from the fridge door.",
    },
  },
  {
    file: "stout",
    fields: {
      name: "Coffee Imperial Stout",
      style: "Coffee Imperial Stout",
      abv: "8",
      brewedDate: "2026-08-20",
      tappedDate: "2026-09-10",
      batch: "#2",
      notes: "Roasted, rich, and deep.",
    },
  },
  {
    file: "minimal",
    fields: {
      name: "Dark Matter",
      style: "",
      abv: "",
      brewedDate: "",
      tappedDate: "",
      batch: "",
      notes: "",
    },
  },
  {
    // A real captured pack shot, to check the photo path and not just the
    // generated-motif fallback.
    file: "packshot",
    fields: {
      name: "Sport Beer",
      style: "Dunkel",
      abv: "4.8",
      brewedDate: "2026-09-01",
      tappedDate: "2026-09-14",
      batch: "#4",
      notes: "Malty, clean, and easy drinking.",
      // resvg will not resolve a filesystem path from an href, so the preview
      // inlines the bytes. The browser uses the plain `/brewpacks/...` path.
      image: dataUri("public/brewpacks/sport-beer.jpg"),
    },
  },
  {
    file: "cider",
    fields: {
      name: "Cloudy Apple Cider",
      style: "Cloudy Apple Cider",
      abv: "4.5",
      brewedDate: "",
      tappedDate: "2026-09-20",
      batch: "",
      notes: "",
    },
  },
];

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });

let failures = 0;

for (const testCase of CASES) {
  const markup = renderToStaticMarkup(
    <LabelCard fields={testCase.fields} gradientId={`g-${testCase.file}`} />,
  );

  writeFileSync(new URL(`./out/${testCase.file}.svg`, import.meta.url), markup);

  // Rasterize so the card can actually be looked at, not just measured.
  // 800px wide is 2x the 400-unit viewBox, i.e. 200dpi at 4in.
  const png = new Resvg(markup, {
    fitTo: { mode: "width", value: 800 },
    font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
  })
    .render()
    .asPng();

  writeFileSync(new URL(`./out/${testCase.file}.png`, import.meta.url), png);

  // Every text baseline must clear the 14-unit foot bar at y=586, and no
  // baseline may sit above the artwork panel.
  const baselines = [...markup.matchAll(/<text[^>]*\sy="([\d.]+)"/g)].map(
    (match) => Number(match[1]),
  );

  const lowest = Math.max(...baselines);
  const highest = Math.min(...baselines);
  const ok = lowest <= 580 && highest >= 268;

  if (!ok) {
    failures += 1;
  }

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${testCase.file.padEnd(12)} ` +
      `text ${highest.toFixed(1)}..${lowest.toFixed(1)} of 0..600`,
  );
}

// Compose the 2-up sheet the way `/labels` does in print, at 100 units per
// inch, so the sheet geometry can be looked at and not just reasoned about.
const SHEET = { w: 1100, h: 850, card: { w: 400, h: 600 }, gap: 60 };
const blockWidth = SHEET.card.w * 2 + SHEET.gap;
const originX = (SHEET.w - blockWidth) / 2;
const originY = (SHEET.h - SHEET.card.h) / 2;

// Two real pack shots, so the sheet doubles as the check that photo cards
// crop sanely across differently framed source images.
const SHEET_CASES = [
  CASES.find((c) => c.file === "packshot")!,
  {
    file: "banner",
    fields: {
      ...CASES[0].fields,
      name: "Lagunitas Super Cluster",
      style: "Double IPA",
      abv: "8.2",
      notes: "",
      image: dataUri("public/brewpacks/lagunitas-super-cluster-remixed.png"),
    },
  },
];

const sheetCards = SHEET_CASES
  .map((testCase, index) => {
    const x = originX + index * (SHEET.card.w + SHEET.gap);
    const card = renderToStaticMarkup(
      <LabelCard fields={testCase.fields} gradientId={`sheet-${index}`} />,
    ).replace(
      'width="100%" height="100%"',
      `x="${x}" y="${originY}" width="${SHEET.card.w}" height="${SHEET.card.h}"`,
    );

    const guide =
      `<rect x="${x - 10}" y="${originY - 10}" ` +
      `width="${SHEET.card.w + 20}" height="${SHEET.card.h + 20}" ` +
      `fill="none" stroke="#9a9a9a" stroke-width="2" stroke-dasharray="8 8"/>`;

    return card + guide;
  })
  .join("");

const sheet =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}">` +
  `<rect width="${SHEET.w}" height="${SHEET.h}" fill="#ffffff"/>${sheetCards}</svg>`;

writeFileSync(new URL("./out/sheet.svg", import.meta.url), sheet);
writeFileSync(
  new URL("./out/sheet.png", import.meta.url),
  new Resvg(sheet, {
    fitTo: { mode: "width", value: 1100 },
    font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
  })
    .render()
    .asPng(),
);

const fitsWidth = blockWidth + 40 <= SHEET.w;
const fitsHeight = SHEET.card.h + 40 <= SHEET.h;

console.log(
  `${fitsWidth && fitsHeight ? "PASS" : "FAIL"}  ${"2-up sheet".padEnd(12)} ` +
    `block ${blockWidth}x${SHEET.card.h} + guides in ${SHEET.w}x${SHEET.h}`,
);

if (!fitsWidth || !fitsHeight) {
  failures += 1;
}

if (failures > 0) {
  process.exitCode = 1;
}
