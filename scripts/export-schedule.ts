// Writes the brewing schedule as a catalogue-style PDF and a CSV into
// data/schedule/, so the workflows' existing `git add data/` carries them into
// the catalog PR. The app serves them at /schedule/pdf and /schedule/csv.
//
// Run by `pnpm scan:releases` (both scan workflows call it after a catalog
// rebuild, and it needs the rebuilt release statuses). Nothing is written when
// the CSV is unchanged, so the PDF's date only moves when the data does.
// ponytail: fixed 2x4 card grid on US Letter; add layout options only if someone asks for another paper size.

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { getBrewPackThumb } from "../lib/brewpackImages";
import { scheduleRows, type ScheduleRow } from "../lib/scheduleRows";

const OUT = path.join(process.cwd(), "data", "schedule");
const CSV = path.join(OUT, "Pinter_Brewing_Schedule.csv");
const PDF = path.join(OUT, "Pinter_Brewing_Schedule.pdf");

const byName = (a: ScheduleRow, b: ScheduleRow) => a.name.localeCompare(b.name);
const onSale = scheduleRows.filter((r) => r.status === "available").sort(byName);
const gone = scheduleRows.filter((r) => r.status !== "available").sort(byName);

const HEAD = ["Beer", "Status", "ABV %", "Brewing days", "Conditioning days", "Total days", "Min brewing days", "Min conditioning days"];
const csvRow = (r: ScheduleRow) =>
  [r.name, r.status, r.abv, r.recommendedBrewDays, r.recommendedConditioningDays, r.totalDays, r.minimumBrewDays, r.minimumConditioningDays]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(",");
const csv = [HEAD.map((h) => `"${h}"`).join(","), ...[...onSale, ...gone].map(csvRow)].join("\n") + "\n";

if (existsSync(CSV) && readFileSync(CSV, "utf8") === csv && existsSync(PDF)) {
  console.log("Schedule unchanged; nothing to write.");
  process.exit(0);
}

// ---- PDF ----------------------------------------------------------------
const W = 612, H = 792, M = 36, GAP = 12;
const CW = (W - 2 * M - GAP) / 2; // card width
const CH = 140; // card height
const IMG = 120; // photo width inside the card
const BREW = "#167f91", COND = "#b97800", INK = "#1f2933", MUTED = "#6b7280", LINE = "#d7dce0";
const updated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

const doc = new PDFDocument({ size: "LETTER", margin: M, bufferPages: true, info: { Title: "Pinter BrewPack Brewing Schedule" } });
mkdirSync(OUT, { recursive: true });
doc.pipe(createWriteStream(PDF));

let col = 0;
let y = M;

function card(r: ScheduleRow, x: number, top: number) {
  doc.save().lineWidth(0.6).strokeColor(LINE).rect(x, top, CW, CH).stroke().restore();

  const thumb = getBrewPackThumb(r.id);
  const file = thumb ? path.join(process.cwd(), "public", thumb) : null;
  doc.save().rect(x, top, IMG, CH).clip();
  try {
    if (!file || !existsSync(file)) throw new Error("no photo");
    // Cover-crop the square shot into the tall photo box.
    doc.image(file, x - (CH - IMG) / 2, top, { width: CH, height: CH });
  } catch {
    // ponytail: pdfkit reads only JPEG/PNG, and a few captured shots are WebP under a .jpg name (winters-slumber); they get the placeholder. Convert at capture time if that matters.
    doc.rect(x, top, IMG, CH).fill("#eceff1");
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("No photo", x, top + CH / 2 - 4, { width: IMG, align: "center" });
  }
  doc.restore();

  const tx = x + IMG + 10, tw = CW - IMG - 18;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(r.name, tx, top + 9, { width: tw, height: 28, ellipsis: true });
  const nameBottom = Math.min(top + 9 + doc.heightOfString(r.name, { width: tw }), top + 37);
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`${r.style}  |  ${r.abv.toFixed(1)}% ABV`, tx, nameBottom + 2, { width: tw, lineBreak: false });
  if (r.status !== "available") {
    doc.fillColor("#cf3f48").font("Helvetica-Bold").fontSize(7.5).text(r.status.toUpperCase(), tx, nameBottom + 14, { width: tw, lineBreak: false });
  }

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(`${r.totalDays}`, tx, top + 66, { continued: true, lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("  days total", { lineBreak: false });

  // Brewing and conditioning bar, proportional to their days.
  const by = top + 100, bw = tw, bh = 7;
  const brewW = (bw * r.recommendedBrewDays) / r.totalDays;
  doc.rect(tx, by, brewW, bh).fill(BREW);
  doc.rect(tx + brewW, by, bw - brewW, bh).fill(COND);
  doc.font("Helvetica").fontSize(7.5).fillColor(BREW).text(`Brew ${r.recommendedBrewDays}d`, tx, by + 10, { width: tw / 2, lineBreak: false });
  doc.fillColor(COND).text(`Condition ${r.recommendedConditioningDays}d`, tx + tw / 2, by + 10, { width: tw / 2, align: "right", lineBreak: false });
  doc.fillColor(MUTED).text(`Minimum ${r.minimumBrewDays} / ${r.minimumConditioningDays} days`, tx, by + 22, { width: tw, lineBreak: false });
}

function place(r: ScheduleRow) {
  if (y + CH > H - M - 14) { doc.addPage(); y = M; col = 0; }
  card(r, M + col * (CW + GAP), y);
  if (col === 1) { y += CH + GAP; col = 0; } else col = 1;
}

function section(title: string, rows: ScheduleRow[]) {
  if (col === 1) { y += CH + GAP; col = 0; }
  if (y + 24 + CH > H - M - 14) { doc.addPage(); y = M; }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(`${title} (${rows.length})`, M, y, { lineBreak: false });
  y += 20;
  rows.forEach(place);
  if (col === 1) { y += CH + GAP; col = 0; }
  y += 4;
}

doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text("Pinter BrewPack Brewing Schedule", M, y, { lineBreak: false });
y += 30;
doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(
  `Updated ${updated}. Unofficial and approximate: check Pinter for current guidance. Total days is recommended brewing plus conditioning. ` +
  "The optional 1-day cold crash counts toward conditioning and adds no time. Condition at 35 to 40 F; going longer often improves carbonation and flavor. " +
  "Minimum is the shortest brewing and conditioning time Pinter lists.",
  M, y, { width: W - 2 * M },
);
y = doc.y + 12;

section("On sale", onSale);
if (gone.length) section("Discontinued or unavailable", gone);

const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0; // otherwise text this low would add a page
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text("Generated from the tap-planner catalog", M, H - 26, { lineBreak: false });
  doc.text(`Page ${i + 1} of ${range.count}`, W - M - 60, H - 26, { width: 60, align: "right", lineBreak: false });
}
doc.end();
writeFileSync(CSV, csv);
console.log(`Wrote ${path.relative(process.cwd(), PDF)} (${range.count} pages) and the CSV.`);
