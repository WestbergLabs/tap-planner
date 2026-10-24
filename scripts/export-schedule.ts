// Writes the brewing schedule as a book-style catalogue PDF (cover and contents,
// a one-page quick reference, then one section per beer family, discontinued
// last) and a CSV into data/schedule/, so the workflows' existing `git add data/` carries them into
// the catalog PR. The app serves them at /schedule/pdf and /schedule/csv.
//
// Run by `pnpm scan:releases` (both scan workflows call it after a catalog
// rebuild, and it needs the rebuilt release statuses). Nothing is written when
// the CSV is unchanged, so the PDF's date only moves when the data does.
// ponytail: US Letter portrait, 3x3 cards per page, and an "unchanged CSV means skip" shortcut, so a layout change needs the old PDF deleted first. Add a layout version to the skip check if that bites.

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

// ---- Families -----------------------------------------------------------
// Broad on purpose. First match wins, so "Belgian Dark Ale" lands in Stouts and
// Dark Beers. Anything that matches nothing is an ale, so a brand-new style can
// never break the export.
const FAMILIES: { name: string; test: RegExp }[] = [
  { name: "Ciders and Seltzers", test: /cider|perry|seltzer/i },
  { name: "Stouts and Dark Beers", test: /stout|dark ale|winter ale/i },
  { name: "Lagers", test: /lager|pilsner|dunkel/i },
];
const ALES = "Ales";
const SECTION_ORDER = [ALES, "Stouts and Dark Beers", "Lagers", "Ciders and Seltzers"];
const familyOf = (r: ScheduleRow) => FAMILIES.find((x) => x.test.test(r.style))?.name ?? ALES;

// Within a section, group like styles together (all the IPAs, all the wheats).
const byStyleThenName = (a: ScheduleRow, b: ScheduleRow) => a.style.localeCompare(b.style) || a.name.localeCompare(b.name);

type Section = { title: string; rows: ScheduleRow[] };
const sections: Section[] = SECTION_ORDER.map((title) => ({ title, rows: onSale.filter((r) => familyOf(r) === title).sort(byStyleThenName) })).filter((s) => s.rows.length);
if (gone.length) sections.push({ title: "Discontinued and Unavailable", rows: gone });

// ---- PDF ----------------------------------------------------------------
const W = 612, H = 792, M = 36, GAP = 10;
const COLS = 4; // cards across; sections flow down the page and share pages
const CW = (W - 2 * M - GAP * (COLS - 1)) / COLS; // card width
const CH = 162, IMGH = 64;
const BREW = "#167f91", COND = "#b97800", INK = "#1f2933", MUTED = "#6b7280", LINE = "#d7dce0", RED = "#cf3f48";
// Date and time, Central. The export skips unchanged schedules, so this is when the data last changed.
const updated = new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).replace(" at ", ", ");
const updatedShort = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).replace(" at ", ", ");

// Plan the pages first: contents and the quick reference need to know them.
// Sections flow one after another, so a short section shares a page with the
// next instead of leaving the rest of its page blank.
const HEAD_H = 34, BOTTOM = H - 44;
type Item = { kind: "head"; section: Section; first: boolean; y: number } | { kind: "card"; row: ScheduleRow; x: number; y: number };
const plan: Item[][] = [[]];
let py = M;
const turn = () => { plan.push([]); py = M; };
for (const section of sections) {
  if (py + HEAD_H + CH > BOTTOM) turn(); // a heading never sits alone at the foot of a page
  plan[plan.length - 1].push({ kind: "head", section, first: true, y: py });
  py += HEAD_H;
  section.rows.forEach((r, i) => {
    const col = i % COLS;
    if (col === 0 && i > 0) py += CH + GAP;
    if (col === 0 && py + CH > BOTTOM) {
      turn();
      plan[plan.length - 1].push({ kind: "head", section, first: false, y: py });
      py += HEAD_H;
    }
    plan[plan.length - 1].push({ kind: "card", row: r, x: M + col * (CW + GAP), y: py });
  });
  py += CH + GAP + 6;
}
const FIRST_CARD_PAGE = 3; // 1 cover, 2 quick reference
const pageOf = new Map<string, number>();
const sectionPage = new Map<string, number>();
plan.forEach((items, i) => {
  for (const it of items) {
    if (it.kind === "head" && it.first) sectionPage.set(it.section.title, FIRST_CARD_PAGE + i);
    if (it.kind === "card") pageOf.set(it.row.id, FIRST_CARD_PAGE + i);
  }
});
const totalPages = FIRST_CARD_PAGE - 1 + plan.length;
const anchor = (title: string) => `sec-${title.replace(/\W+/g, "-").toLowerCase()}`;

const doc = new PDFDocument({
  size: "LETTER",
  margin: M,
  bufferPages: true,
  info: { Title: "Pinter BrewPack Brewing Schedule", Subject: "BrewPack brewing and conditioning times", Keywords: "Pinter, BrewPack, brewing schedule" },
});
mkdirSync(OUT, { recursive: true });
doc.pipe(createWriteStream(PDF));

const label = (t: string, x: number, yy: number, w: number, size: number, color: string, bold = false, align: "left" | "right" | "center" = "left") =>
  doc.fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(t, x, yy, { width: w, align, lineBreak: false });

function rowHead(title: string, y = M) {
  label(title, M, y, W - 2 * M, 16, INK, true);
  doc.moveTo(M, y + 24).lineTo(W - M, y + 24).lineWidth(0.8).strokeColor(LINE).stroke();
}

// Page 1: cover and contents
label("Pinter BrewPack", M, 90, W - 2 * M, 14, MUTED, true);
label("Brewing Schedule", M, 108, W - 2 * M, 34, INK, true);
doc.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(
  `Updated ${updated}. Unofficial and approximate: check Pinter for current guidance.\n\n` +
  "Total days is recommended brewing plus conditioning. The optional 1-day cold crash counts toward conditioning and adds no time. " +
  "Condition at 35 to 40 F; going longer than recommended often improves carbonation and flavor. " +
  "Minimum is the shortest brewing and conditioning time Pinter lists.",
  M, 160, { width: W - 2 * M - 80 },
);
const ly = doc.y + 16;
doc.rect(M, ly, 16, 6).fill(BREW);
label("Brewing", M + 22, ly - 1, 60, 8.5, INK);
doc.rect(M + 80, ly, 16, 6).fill(COND);
label("Conditioning", M + 102, ly - 1, 80, 8.5, INK);

let cy = 330;
label("Contents", M, cy, 200, 13, INK, true);
cy += 24;
const contents: { title: string; page: number; target: string; note?: string }[] = [
  { title: "Quick reference, every pack on one page", page: 2, target: "quick" },
  ...sections.map((s) => ({ title: s.title, page: sectionPage.get(s.title)!, target: anchor(s.title), note: `${s.rows.length} packs` })),
];
for (const c of contents) {
  label(c.title, M, cy, 300, 11, INK);
  if (c.note) label(c.note, 330, cy + 1, 100, 9, MUTED);
  label(`Page ${c.page}`, W - M - 60, cy, 60, 11, INK, false, "right");
  doc.goTo(M, cy - 2, W - 2 * M, 18, c.target);
  doc.moveTo(M, cy + 15).lineTo(W - M, cy + 15).lineWidth(0.4).strokeColor(LINE).stroke();
  cy += 24;
}
doc.outline.addItem("Cover and contents");

// Page 2: quick reference
doc.addPage();
doc.addNamedDestination("quick");
doc.outline.addItem("Quick reference");
rowHead("Quick reference");
const QCOLS = [
  { h: "Beer", x: M + 4, w: 170 }, { h: "Style", x: M + 178, w: 118 }, { h: "ABV", x: 352, w: 34 },
  { h: "Brew", x: 392, w: 34 }, { h: "Cond.", x: 432, w: 34 }, { h: "Total", x: 472, w: 34 }, { h: "Min.", x: 508, w: 40 }, { h: "Pg", x: W - M - 18, w: 18 },
];
let qy = M + 34;
doc.rect(M, qy - 3, W - 2 * M, 15).fill("#2b3a42");
QCOLS.forEach((c) => label(c.h, c.x, qy + 1, c.w, 8, "#ffffff", true));
qy += 17;
[...onSale, ...gone].forEach((r, i) => {
  // A band splits the retired packs from the ones on sale.
  if (i === onSale.length && gone.length) {
    qy += 4;
    doc.rect(M, qy - 3, W - 2 * M, 14.5).fill("#dfe4e7");
    label("Discontinued and unavailable", M + 4, qy + 1, 300, 8, INK, true);
    qy += 14.5;
  }
  if ((i - (i >= onSale.length ? onSale.length : 0)) % 2) doc.rect(M, qy - 3, W - 2 * M, 14.5).fill("#f3f5f6");
  const name = r.status === "available" ? r.name : `${r.name} (${r.status})`;
  const cells = [name, r.style, `${r.abv.toFixed(1)}%`, `${r.recommendedBrewDays}d`, `${r.recommendedConditioningDays}d`, `${r.totalDays}d`, `${r.minimumBrewDays}/${r.minimumConditioningDays}`, `${pageOf.get(r.id)}`];
  cells.forEach((c, k) => {
    doc.fillColor(k === 5 ? INK : INK).font(k === 5 ? "Helvetica-Bold" : "Helvetica").fontSize(7.8).text(c, QCOLS[k].x, qy, { width: QCOLS[k].w, lineBreak: false, ellipsis: true });
  });
  doc.goTo(M, qy - 3, W - 2 * M, 14.5, `pack-${r.id}`);
  qy += 14.5;
});

// Catalogue pages
function card(r: ScheduleRow, x: number, top: number) {
  doc.addNamedDestination(`pack-${r.id}`);
  doc.save().lineWidth(0.6).strokeColor(LINE).rect(x, top, CW, CH).stroke().restore();

  const thumb = getBrewPackThumb(r.id);
  const file = thumb ? path.join(process.cwd(), "public", thumb) : null;
  doc.save().rect(x, top, CW, IMGH).clip();
  try {
    if (!file || !existsSync(file)) throw new Error("no photo");
    // Cover-crop the square shot into the wide photo box.
    doc.image(file, x, top - (CW - IMGH) / 2, { width: CW, height: CW });
  } catch {
    // ponytail: pdfkit reads only JPEG/PNG, and a few captured shots are WebP under a .jpg name (winters-slumber); they get the placeholder. Convert at capture time if that matters.
    doc.rect(x, top, CW, IMGH).fill("#eceff1");
    label("No photo", x, top + IMGH / 2 - 4, CW, 8, MUTED, false, "center");
  }
  doc.restore();

  const tx = x + 8, tw = CW - 16;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(r.name, tx, top + 68, { width: tw, height: 22, ellipsis: true });
  label(`${r.style}  |  ${r.abv.toFixed(1)}% ABV`, tx, top + 92, tw, 7, MUTED);
  if (r.status !== "available") label(r.status.toUpperCase(), tx, top + 101, tw, 7, RED, true);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(`${r.totalDays}`, tx, top + 110, { continued: true, lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("  days total", { lineBreak: false });

  // Brewing and conditioning bar, proportional to their days.
  const by = top + 132, bh = 5;
  const brewW = (tw * r.recommendedBrewDays) / r.totalDays;
  doc.rect(tx, by, brewW, bh).fill(BREW);
  doc.rect(tx + brewW, by, tw - brewW, bh).fill(COND);
  label(`Brew ${r.recommendedBrewDays}d`, tx, by + 8, tw / 2, 7, BREW);
  label(`Condition ${r.recommendedConditioningDays}d`, tx + tw / 2, by + 8, tw / 2, 7, COND, false, "right");
  label(`Minimum ${r.minimumBrewDays} / ${r.minimumConditioningDays} days`, tx, by + 17, tw, 7, MUTED);
}

plan.forEach((items) => {
  doc.addPage();
  for (const it of items) {
    if (it.kind === "card") {
      card(it.row, it.x, it.y);
    } else {
      if (it.first) {
        doc.addNamedDestination(anchor(it.section.title));
        doc.outline.addItem(it.section.title);
      }
      rowHead(it.first ? `${it.section.title}  (${it.section.rows.length})` : `${it.section.title}, continued`, it.y);
    }
  }
});

const range = doc.bufferedPageRange();
if (range.count !== totalPages) throw new Error(`Planned ${totalPages} pages but wrote ${range.count}`);
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0; // otherwise text this low would add a page
  label(`Generated from the tap-planner catalog  |  Last updated ${updatedShort}`, M, H - 26, 400, 7.5, MUTED);
  label(`Page ${i + 1} of ${range.count}`, W - M - 80, H - 26, 80, 7.5, MUTED, false, "right");
}
doc.end();
writeFileSync(CSV, csv);
console.log(`Wrote ${path.relative(process.cwd(), PDF)} (${range.count} pages) and the CSV.`);
