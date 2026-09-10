/**
 * Dev-only: build a collage of captured Pinter pack shots for the README.
 *
 * Reads the image manifest rather than globbing the directory, so it only ever
 * shows packs the app actually knows about, and picks evenly across the
 * alphabet so the collage is a spread rather than the first N.
 *
 * Run: node scripts/pack-collage.mjs [columns] [rows]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const COLS = Number(process.argv[2] ?? 6);
const ROWS = Number(process.argv[3] ?? 3);
/** Output width. Kept well under the source resolution: this is a README
    illustration, not something anyone needs to read pack copy from. */
const OUT_W = Number(process.argv[4] ?? 760);
const CELL = 160;
const GAP = 6;

const manifest = JSON.parse(
  readFileSync(new URL("../data/brewpack-images.json", import.meta.url), "utf8"),
);

const entries = Object.entries(manifest.packs).sort(([a], [b]) =>
  a.localeCompare(b),
);

const wanted = COLS * ROWS;

if (entries.length < wanted) {
  console.error(`Only ${entries.length} pack shots; need ${wanted}.`);
  process.exit(1);
}

// Evenly spaced picks across the sorted list, so the collage spans the catalog
// instead of showing everything beginning with "A".
const step = entries.length / wanted;
const chosen = Array.from(
  { length: wanted },
  (_, i) => entries[Math.floor(i * step)],
);

function dataUri(file) {
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  const bytes = readFileSync(
    new URL(`../public/brewpacks/${file}`, import.meta.url),
  );

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

const width = COLS * CELL + (COLS - 1) * GAP;
const height = ROWS * CELL + (ROWS - 1) * GAP;

const tiles = chosen
  .map(([, record], index) => {
    const x = (index % COLS) * (CELL + GAP);
    const y = Math.floor(index / COLS) * (CELL + GAP);
    const href = dataUri(record.thumb ?? record.file);

    return (
      `<image href="${href}" x="${x}" y="${y}" width="${CELL}" ` +
      `height="${CELL}" preserveAspectRatio="xMidYMid slice"/>`
    );
  })
  .join("");

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
  `<rect width="${width}" height="${height}" fill="#f3efe6"/>${tiles}</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: OUT_W } })
  .render()
  .asPng();

writeFileSync(new URL("../docs/images/pack-collage.png", import.meta.url), png);

console.log(
  `wrote docs/images/pack-collage.png — ${wanted} of ${entries.length} packs, ` +
    `${OUT_W}px wide, ${Math.round(png.length / 1024)}KB`,
);
