"use client";

import { useMemo, useRef, useState } from "react";

import Image from "next/image";

import BrewPackPicker from "@/components/BrewPackPicker";
import SiteNav from "@/components/SiteNav";
import PinterNotice from "@/components/PinterNotice";
import LabelCard, { type LabelFields } from "@/components/LabelCard";
import { brewPacks, type BrewPack } from "@/data/brewpacks.generated";
import { getBrewPackImage } from "@/lib/brewpackImages";
import { safeFileName } from "@/lib/calendar";
import { downloadLabelPng, downloadLabelSvg } from "@/lib/labelImage";
import {
  BUSINESS_CARD,
  CARD_SIZES,
  cardPixels,
  type CardSize,
} from "@/lib/labelSizes";
import { getTodayString } from "@/lib/schedule";

type PrintMode = "card" | "letter" | "sheet";

/**
 * Physical sizes, in one place. A 4x6 card is the fixed unit; the multi-card
 * sheet just has to be big enough to hold two of them side by side (8in wide)
 * plus cut guides.
 *
 * Landscape Letter is the default because it leaves 1.5in of slack per side.
 * Portrait Letter also fits two cards, but only with 0.25in to spare, which is
 * most printers' unprintable margin -- the guides would be clipped. Swap
 * SHEET_W/SHEET_H and PAGE_SIZE together if you print on a different stock.
 */
const SHEET_W = "11in";
const SHEET_H = "8.5in";
const PAGE_SIZE = "letter landscape";

/**
 * Business-card stock (Avery 5371 style: ten 3.5x2 blanks per Letter sheet),
 * fed landscape so the cards read portrait: 5 across, 2 down, 2x3.5 each, with
 * no gutters. 10in x 7in of cards on 11in x 8.5in leaves 0.5in left/right and
 * 0.75in top/bottom.
 */
const SHEET_COLS = 5;
const SHEET_CARDS = 10;
const SHEET_PAD = "0.75in 0.5in";

const EMPTY_FIELDS: LabelFields = {
  name: "",
  style: "",
  abv: "",
  brewedDate: "",
  tappedDate: "",
  batch: "",
  notes: "",
};

const PAPER_OPTIONS = [
  {
    name: "Waterproof synthetic",
    detail: "Vinyl or polypropylene label stock",
    verdict: "Best",
    tone: "best" as const,
    body:
      "Shrugs off condensation completely — it will not pulp, curl, or wrinkle even sitting against a cold, sweating keg. Sold pre-cut at 4x6 and in full sheets.",
  },
  {
    name: "Matte photo paper",
    detail: "Resin-coated, 120gsm and up",
    verdict: "Great",
    tone: "great" as const,
    body:
      "The resin coating keeps moisture out of the fibres, and matte means you can still write on it with a pen. Sold in 4x6 packs for photo trays, with or without adhesive backing.",
  },
  {
    name: "Cardstock",
    detail: "65lb to 110lb cover",
    verdict: "Good",
    tone: "good" as const,
    body:
      "Stiff, cheap, and easy to write on. It will soften and curl if it gets properly damp, so it is happiest tucked into a door shelf rather than taped to a cold keg.",
  },
  {
    name: "Plain printer paper",
    detail: "Standard 20lb / 80gsm",
    verdict: "Works",
    tone: "works" as const,
    body:
      "Genuinely fine, just limp — expect it to go wrinkly within a few days in a humid fridge. A strip of clear packing tape over the front fixes that for about a cent.",
  },
];

const VERDICT_STYLES: Record<(typeof PAPER_OPTIONS)[number]["tone"], string> = {
  best: "bg-stage-brew-soft text-stage-brew",
  great: "bg-stage-condition-soft text-stage-condition",
  good: "bg-accent-soft text-accent",
  works: "bg-stage-crash-soft text-stage-crash",
};

const PRINT_MODES: { value: PrintMode; title: string; blurb: string }[] = [
  {
    value: "card",
    title: "4×6 index card",
    blurb:
      "One label. For photo trays, 4×6 sticker sheets, and thermal label printers.",
  },
  {
    value: "letter",
    title: "Letter paper — 2 labels",
    blurb:
      "Standard 8.5×11 paper, printed sideways. Two labels with cut guides, and they can be different beers.",
  },
  {
    value: "sheet",
    title: "Business cards — 10 per sheet",
    blurb:
      "Avery-style 2×3.5 perforated stock. Up to ten different beers; empty cards stay blank so you can reuse a part sheet.",
  },
];

export default function LabelsPage() {
  // Both slots are always held in state, even in single-card mode, so
  // switching paper size back and forth never discards what was typed.
  const [labels, setLabels] = useState<LabelFields[]>(() =>
    Array.from({ length: SHEET_CARDS }, () => EMPTY_FIELDS),
  );
  const [selectedIds, setSelectedIds] = useState(() =>
    Array.from({ length: SHEET_CARDS }, () => ""),
  );
  const [activeSlot, setActiveSlot] = useState(0);
  const [printMode, setPrintMode] = useState<PrintMode>("card");

  // Export reads the card straight out of the preview rather than re-rendering
  // it, so the file can never disagree with what is on screen.
  const previews = useRef<(HTMLElement | null)[]>([]);
  const [exportError, setExportError] = useState("");
  const [cardSizeId, setCardSizeId] = useState<string>(CARD_SIZES[0].id);

  // The business-card sheet only makes sense at 2x3.5, so it overrides the
  // picker rather than letting the two disagree.
  const cardSize: CardSize =
    printMode === "sheet"
      ? BUSINESS_CARD
      : (CARD_SIZES.find((s) => s.id === cardSizeId) ?? CARD_SIZES[0]);
  const cardW = `${cardSize.widthIn}in`;
  const cardH = `${cardSize.heightIn}in`;
  const px = cardPixels(cardSize);

  const slotCount =
    printMode === "card" ? 1 : printMode === "letter" ? 2 : SHEET_CARDS;
  const slot = Math.min(activeSlot, slotCount - 1);
  const fields = labels[slot];

  const activeBrewPacks = useMemo(
    () =>
      brewPacks
        .filter((pack) => !pack.discontinued)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  function update<K extends keyof LabelFields>(key: K, value: LabelFields[K]) {
    setLabels((current) =>
      current.map((label, index) =>
        index === slot ? { ...label, [key]: value } : label,
      ),
    );
  }

  function handleSelect(pack: BrewPack) {
    setSelectedIds((current) =>
      current.map((id, index) => (index === slot ? pack.id : id)),
    );
    setLabels((current) =>
      current.map((label, index) =>
        index === slot
          ? {
              ...label,
              name: pack.name,
              style: pack.style,
              abv: String(pack.abv),
              image: getBrewPackImage(pack.id) ?? undefined,
            }
          : label,
      ),
    );
  }

  /** Identical cards is still a common case: one for the fridge, one for
      the Pinter. Without this the only way to get it is typing it twice. */
  function copyToAllSlots() {
    setLabels((current) => current.map(() => current[slot]));
    setSelectedIds((current) => current.map(() => current[slot]));
  }

  async function download(format: "png" | "svg") {
    const card = previews.current[slot]?.querySelector("svg");

    if (!card) {
      setExportError("The preview is not ready yet. Try again in a moment.");
      return;
    }

    const fileName = `${safeFileName(fields.name.trim() || "Untitled Brew")}-label.${format}`;

    setExportError("");

    try {
      if (format === "png") {
        await downloadLabelPng(card, fileName, cardSize);
      } else {
        await downloadLabelSvg(card, fileName);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? `Download failed: ${error.message}.`
          : "Download failed.",
      );
    }
  }

  // `@page` size has to be a real stylesheet rule, so it is injected rather
  // than set inline.
  const pageRule =
    printMode === "card"
      ? `@page { size: ${cardW} ${cardH}; margin: 0; }`
      : `@page { size: ${PAGE_SIZE}; margin: 0; }`;

  const fieldClass =
    "w-full rounded-xl border border-border bg-field px-3.5 py-2.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25";
  const labelClass =
    "block text-xs font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <>
      <style>{`
        ${pageRule}

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            background-image: none !important;
          }
          .label-screen { display: none !important; }
          .label-sheet { display: block !important; }
        }
      `}</style>

      <main className="label-screen min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
        <div className="mx-auto max-w-2xl">
          <header className="mb-9 border-b border-border pb-7">
            <div className="relative z-30 mb-6">
              <div className="relative min-h-[180px] overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero">
                <Image
                  src="/tap-handles.jpg"
                  alt="A row of beer taps behind a bar"
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-cover object-[center_42%]"
                />
              </div>

              {/* Rendered outside the hero: the hero clips its overflow for
                  the rounded corners, which would cut off the open menu. */}
              <div className="absolute inset-x-0 top-0 flex justify-end p-5 sm:p-6">
                <SiteNav current="/labels" />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Print your own
            </p>

            <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
              Brew Labels
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-muted">
              Pick a BrewPack, add your dates, and print a card on whatever
              paper you have &mdash; index cards, business cards, or a full
              sheet.
            </p>
          </header>

          <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
            <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Build your label
              </p>
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-6">
              {slotCount > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="tablist"
                    aria-label="Which card to edit"
                    className="flex flex-wrap gap-2"
                  >
                    {labels.map((label, index) => (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={slot === index}
                        onClick={() => setActiveSlot(index)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          slot === index
                            ? "border-accent bg-accent text-white"
                            : "border-border bg-field text-muted hover:border-border-strong"
                        }`}
                      >
                        Card {index + 1}
                        {slotCount <= 2 && label.name.trim() !== "" && (
                          <span className="ml-1.5 font-normal opacity-80">
                            {label.name.trim()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={copyToAllSlots}
                    className="rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-border-strong hover:text-foreground"
                  >
                    Make all the same
                  </button>
                </div>
              )}

              {/* No heading here: BrewPackPicker renders its own "BrewPack"
                  label, and in two-card mode the tabs above already say which
                  card is being edited. */}
              <div>
                <div>
                  <BrewPackPicker
                    key={slot}
                    brewPacks={activeBrewPacks}
                    selectedId={selectedIds[slot]}
                    onSelect={handleSelect}
                    onClear={() =>
                      setSelectedIds((current) =>
                        current.map((id, index) => (index === slot ? "" : id)),
                      )
                    }
                    hint="Optional. Fills in the name, style, and ABV; you can edit everything afterwards."
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="label-name">
                  Beer name
                </label>
                <input
                  id="label-name"
                  className={`${fieldClass} mt-2`}
                  value={fields.name}
                  maxLength={60}
                  placeholder="Dark Matter"
                  onChange={(event) => update("name", event.target.value)}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="label-style">
                    Style
                  </label>
                  <input
                    id="label-style"
                    className={`${fieldClass} mt-2`}
                    value={fields.style}
                    maxLength={40}
                    placeholder="Hazy IPA"
                    onChange={(event) => update("style", event.target.value)}
                  />
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    Sets the artwork colour and motif.
                  </p>
                </div>

                <div>
                  <label className={labelClass} htmlFor="label-abv">
                    ABV %
                  </label>
                  <input
                    id="label-abv"
                    className={`${fieldClass} mt-2`}
                    value={fields.abv}
                    inputMode="decimal"
                    maxLength={5}
                    placeholder="5.8"
                    onChange={(event) => update("abv", event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="label-brewed">
                    Brew date
                  </label>
                  <div className="tap-date-wrapper mt-2">
                    <input
                      id="label-brewed"
                      type="date"
                      className={`${fieldClass} tap-date-input`}
                      value={fields.brewedDate}
                      onChange={(event) =>
                        update("brewedDate", event.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="label-tapped">
                    Tap date
                  </label>
                  <div className="tap-date-wrapper mt-2">
                    <input
                      id="label-tapped"
                      type="date"
                      className={`${fieldClass} tap-date-input`}
                      value={fields.tappedDate}
                      min={getTodayString()}
                      onChange={(event) =>
                        update("tappedDate", event.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="label-batch">
                  ID (batch, tap #, color…)
                </label>
                <input
                  id="label-batch"
                  className={`${fieldClass} mt-2`}
                  value={fields.batch}
                  maxLength={20}
                  placeholder="Tap 3"
                  onChange={(event) => update("batch", event.target.value)}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="label-notes">
                  Tasting notes
                </label>
                <textarea
                  id="label-notes"
                  className={`${fieldClass} mt-2 resize-y`}
                  rows={2}
                  value={fields.notes}
                  maxLength={160}
                  placeholder="Big citrus nose, soft bitterness, best served cold."
                  onChange={(event) => update("notes", event.target.value)}
                />
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  Up to three lines are printed.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
            <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Preview
              </p>
            </div>

            <div className="px-5 py-6 sm:px-6">
              <div className="flex flex-wrap items-start justify-center gap-4">
                {labels.slice(0, slotCount).map((label, index) => {
                  const blank = printMode === "sheet" && label.name.trim() === "";

                  return (
                    <button
                      key={index}
                      type="button"
                      ref={(node) => {
                        previews.current[index] = node;
                      }}
                      onClick={() => setActiveSlot(index)}
                      aria-label={`Edit card ${index + 1}`}
                      style={{ aspectRatio: `${cardSize.widthIn} / ${cardSize.heightIn}` }}
                      className={`w-full overflow-hidden border-2 shadow-card transition ${
                        printMode === "sheet"
                          ? "min-w-[88px] max-w-[calc(20%-0.8rem)] rounded-lg"
                          : "max-w-[260px] rounded-2xl"
                      } ${
                        slotCount > 1 && slot === index
                          ? "border-accent"
                          : "border-border-strong hover:border-accent/50"
                      } ${blank ? "border-dashed bg-field" : ""}`}
                    >
                      {blank ? (
                        <span className="flex h-full items-center justify-center text-xs text-muted">
                          {index + 1}
                        </span>
                      ) : (
                        <LabelCard
                          fields={label}
                          size={cardSize}
                          gradientId={`label-preview-${index}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <label className="mt-7 block" htmlFor="card-size">
                <span className={labelClass}>Card size</span>
                <select
                  id="card-size"
                  className={`${fieldClass} mt-2 disabled:opacity-60`}
                  value={cardSize.id}
                  disabled={printMode === "sheet"}
                  onChange={(event) => setCardSizeId(event.target.value)}
                >
                  {CARD_SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {printMode === "sheet" && (
                  <span className="mt-1.5 block text-xs leading-5 text-muted">
                    Business-card sheets are always 2&#215;3.5.
                  </span>
                )}
              </label>

              <fieldset className="mt-6">
                <legend className={labelClass}>Paper size</legend>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {PRINT_MODES.map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-2xl border px-4 py-3.5 transition ${
                        printMode === option.value
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-field hover:border-border-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="print-mode"
                        className="sr-only"
                        checked={printMode === option.value}
                        onChange={() => setPrintMode(option.value)}
                      />
                      <span className="block text-sm font-semibold text-foreground">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {option.blurb}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={() => window.print()}
                className="mt-6 w-full rounded-xl bg-accent px-5 py-3.5 text-base font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2"
              >
                Print label
              </button>

              <p className="mt-3 text-center text-xs leading-5 text-muted">
                In the print dialog set scale to <strong>100%</strong>{" "}
                rather than &ldquo;fit to page&rdquo;, so the card comes out at
                a true {cardSize.widthIn}&#215;{cardSize.heightIn}.
              </p>

              {/* Saving the card as a file is the way out of 4x6: any photo
                  app or print shop can scale an image to whatever size the
                  fridge, keg, or bottle actually needs. */}
              <div className="mt-6 border-t border-border pt-5">
                <p className={labelClass}>
                  Save as an image
                  {slotCount > 1 && ` — card ${slot + 1}`}
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => download("png")}
                    className="rounded-xl border border-border-strong bg-field px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Download PNG
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {px.width}&#215;{px.height} — 300 dpi
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => download("svg")}
                    className="rounded-xl border border-border-strong bg-field px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Download SVG
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      Vector — sharp at any size
                    </span>
                  </button>
                </div>

                <p className="mt-3 text-center text-xs leading-5 text-muted">
                  Print either one at whatever size you like. The PNG opens
                  anywhere; the SVG stays perfectly crisp if you scale it up
                  past 6&#215;9.
                </p>

                {exportError !== "" && (
                  <p
                    role="status"
                    className="mt-3 text-center text-xs leading-5 text-error"
                  >
                    {exportError}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Reference reading rather than part of building a label, so it
              starts closed and gives the page back to the preview. A native
              <details> keeps the keyboard and screen-reader behaviour for
              free, and there is no open state to hold. */}
          <details className="group mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-transparent px-5 py-4 transition hover:bg-field group-open:border-border sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Which paper for a fridge?
              </span>

              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
                className="shrink-0 text-muted transition-transform group-open:rotate-180"
              >
                <path
                  d="m7 10 5 5 5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>

            <div className="px-5 py-6 sm:px-6">
              <p className="text-sm leading-6 text-muted">
                Any paper works. But a fridge is cold, humid, and prone to
                condensation, so some hold up far better than others.
              </p>

              <div className="mt-5 space-y-3">
                {PAPER_OPTIONS.map((option) => (
                  <div
                    key={option.name}
                    className="rounded-2xl border border-border bg-field px-4 py-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {option.name}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${VERDICT_STYLES[option.tone]}`}
                      >
                        {option.verdict}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-muted">
                      {option.detail}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {option.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-4 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Your ink matters more than your paper
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    Laser toner is fused plastic, so it is waterproof on
                    anything &mdash; including plain copy paper. Consumer inkjet
                    dye ink runs the moment condensation touches it. A laser
                    print on cheap paper outlasts an inkjet print on good paper.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Stick labels on at room temperature
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    Standard label adhesive barely grabs a surface that is
                    already cold. Apply the label first, then chill &mdash; this
                    is the most common reason fridge labels fall off.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Packing tape is a free laminate
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    A strip of clear packing tape across the face of any card
                    makes it fridge-proof. Overlap the edges onto the back so
                    moisture cannot creep in.
                  </p>
                </div>
              </div>
            </div>
          </details>

          <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
            <p>
              Labels are generated in your browser and are not stored. Packs
              without a product image fall back to artwork generated from the
              beer style.
            </p>

            <PinterNotice />
          </footer>
        </div>
      </main>

      {/* Print-only sheet, revealed by the print stylesheet above. Card art is
          SVG fill rather than a CSS background, so it prints even when the
          browser's "background graphics" option is left off. */}
      <div className="label-sheet hidden">
        {printMode === "card" ? (
          <div style={{ width: cardW, height: cardH }}>
            <LabelCard fields={labels[0]} size={cardSize} gradientId="label-print-0" />
          </div>
        ) : printMode === "letter" ? (
          <div
            style={{
              width: SHEET_W,
              height: SHEET_H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.6in",
            }}
          >
            {labels.slice(0, 2).map((label, index) => (
              <div
                key={index}
                style={{
                  width: cardW,
                  height: cardH,
                  outline: "1px dashed #9a9a9a",
                  outlineOffset: "0.1in",
                }}
              >
                <LabelCard
                  fields={label}
                  size={cardSize}
                  gradientId={`label-print-${index}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              width: SHEET_W,
              height: SHEET_H,
              boxSizing: "border-box",
              padding: SHEET_PAD,
              display: "grid",
              gridTemplateColumns: `repeat(${SHEET_COLS}, ${cardW})`,
              gridAutoRows: cardH,
            }}
          >
            {/* Empty cards are skipped but keep their cell, so a part-used
                sheet can go back through the printer. */}
            {labels.slice(0, SHEET_CARDS).map((label, index) => (
              <div key={index}>
                {label.name.trim() !== "" && (
                  <LabelCard
                    fields={label}
                    size={cardSize}
                    gradientId={`label-print-${index}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
