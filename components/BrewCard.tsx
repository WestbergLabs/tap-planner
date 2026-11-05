"use client";

// One saved brew on /brews: where it stands today, its dates, and the actions
// that make a diary worth keeping (tasting notes, calendar file, delete).
//
// The stage chip and "next up" line are derived from the dates and today, never
// stored, so they are always right.

import { useState, type FormEvent } from "react";

import Link from "next/link";

import PackThumb from "@/components/PackThumb";
import { downloadSchedule } from "@/lib/calendar";
import {
  brewAgainHref,
  getBrewStage,
  nextMilestone,
  STAGE_LABEL,
  toCalendarSchedule,
  type BrewStage,
} from "@/lib/brews";
import { formatShortDate, parseLocalDate } from "@/lib/schedule";
import { removeBrew, updateBrew, type SavedBrew, type Tasting } from "@/lib/storage";

const STAGE_CHIP: Record<BrewStage, string> = {
  planned: "border-border bg-field text-muted",
  brewing: "border-stage-brew/40 bg-stage-brew-soft text-stage-brew",
  "cold-crash": "border-stage-crash/40 bg-stage-crash-soft text-stage-crash",
  conditioning: "border-stage-condition/40 bg-stage-condition-soft text-stage-condition",
  ready: "border-stage-tap/40 bg-stage-tap-soft text-stage-tap",
  tasted: "border-accent/40 bg-accent-soft text-accent",
};

const RATING_LABEL: Record<number, string> = {
  5: "5 - Outstanding",
  4: "4 - Very good",
  3: "3 - Good",
  2: "2 - Could improve",
  1: "1 - Not for me",
};

const CARBONATION_LABEL: Record<Tasting["carbonation"], string> = {
  right: "Just right",
  low: "Too low",
  high: "Too high",
  unsure: "Not sure",
};

const AGAIN_LABEL: Record<Tasting["wouldBrewAgain"], string> = {
  yes: "Yes, absolutely",
  maybe: "Maybe, with changes",
  no: "No",
};

const fieldClass =
  "w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground";

const secondaryButton =
  "rounded-lg border border-border-strong bg-field px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface";

function DateCell({
  label,
  date,
  tone,
}: {
  label: string;
  date: string;
  tone: string;
}) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{formatShortDate(parseLocalDate(date))}</p>
    </div>
  );
}

export default function BrewCard({ brew, today }: { brew: SavedBrew; today: string }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const stage = getBrewStage(brew, today);
  const milestone = nextMilestone(brew, today);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    const rating = Number(data.get("rating") ?? 0);

    // Tasting is optional: with no rating chosen, only the batch note is saved.
    const tasting: Tasting | undefined =
      rating >= 1 && rating <= 5
        ? {
            rating,
            carbonation: String(data.get("carbonation")) as Tasting["carbonation"],
            wouldBrewAgain: String(data.get("again")) as Tasting["wouldBrewAgain"],
            notes: String(data.get("tasting-notes") ?? "").trim(),
            tastedOn: String(data.get("tasted-on") || today),
          }
        : undefined;

    const ok = updateBrew(brew.id, { note, tasting });

    setSaveError(!ok);

    if (ok) {
      setEditing(false);
    }
  }

  return (
    <li className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {brew.packId && (
            <PackThumb packId={brew.packId} style={brew.style} size={64} />
          )}

          <div className="min-w-0">
            <h3 className="font-display text-2xl uppercase leading-tight">
              {brew.name}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {[brew.style, brew.abv === null ? "" : `${brew.abv}% ABV`, brew.pinter ? `Pinter ${brew.pinter}` : "", brew.recipe?.system ?? ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${STAGE_CHIP[stage]}`}
        >
          {STAGE_LABEL[stage]}
        </span>
      </div>

      {milestone && (
        <p className="mt-3 text-sm font-semibold text-foreground">{milestone}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <DateCell label="Brew" date={brew.brewDate} tone="text-stage-brew" />
        {brew.coldCrashDate && (
          <DateCell label="Cold crash" date={brew.coldCrashDate} tone="text-stage-crash" />
        )}
        <DateCell label="Condition" date={brew.conditioningDate} tone="text-stage-condition" />
        <DateCell label="Tap" date={brew.tapDate} tone="text-stage-tap" />
      </div>

      {brew.recipe && (brew.recipe.ingredients || brew.recipe.method) && !editing && (
        <details className="mt-4 rounded-xl border border-border bg-field px-4 py-3 text-sm leading-6">
          <summary className="cursor-pointer font-semibold">Recipe</summary>

          {brew.recipe.ingredients && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Ingredients
              </p>
              <p className="mt-1 whitespace-pre-wrap">{brew.recipe.ingredients}</p>
            </div>
          )}

          {brew.recipe.method && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Method and notes
              </p>
              <p className="mt-1 whitespace-pre-wrap">{brew.recipe.method}</p>
            </div>
          )}
        </details>
      )}

      {brew.note && !editing && (
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-field px-4 py-3 text-sm leading-6">
          {brew.note}
        </p>
      )}

      {brew.tasting && !editing && (
        <div className="mt-4 rounded-xl border border-border bg-field px-4 py-3 text-sm leading-6">
          <p className="font-semibold">
            <span aria-hidden="true">{"★".repeat(brew.tasting.rating)}{"☆".repeat(5 - brew.tasting.rating)}</span>{" "}
            <span className="sr-only">{brew.tasting.rating} out of 5. </span>
            {RATING_LABEL[brew.tasting.rating].slice(4)}
          </p>
          <p className="text-muted">
            Carbonation: {CARBONATION_LABEL[brew.tasting.carbonation]} &middot; Brew again:{" "}
            {AGAIN_LABEL[brew.tasting.wouldBrewAgain]}
          </p>
          {brew.tasting.notes && (
            <p className="mt-2 whitespace-pre-wrap">{brew.tasting.notes}</p>
          )}
        </div>
      )}

      {editing && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 space-y-5 border-t border-border pt-5"
        >
          <div>
            <label htmlFor={`note-${brew.id}`} className={labelClass}>
              Batch note
            </label>
            <textarea
              id={`note-${brew.id}`}
              name="note"
              rows={2}
              maxLength={2000}
              defaultValue={brew.note}
              placeholder="Water, fridge shelf, anything you want to remember"
              className={fieldClass}
            />
          </div>

          <fieldset className="space-y-5">
            <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Tasting (optional)
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor={`rating-${brew.id}`} className={labelClass}>
                  Overall rating
                </label>
                <select
                  id={`rating-${brew.id}`}
                  name="rating"
                  defaultValue={brew.tasting?.rating ?? ""}
                  className={fieldClass}
                >
                  <option value="">Not rated yet</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {RATING_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`tasted-${brew.id}`} className={labelClass}>
                  Tasted on
                </label>
                <input
                  id={`tasted-${brew.id}`}
                  name="tasted-on"
                  type="date"
                  defaultValue={brew.tasting?.tastedOn ?? today}
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor={`carb-${brew.id}`} className={labelClass}>
                  Carbonation
                </label>
                <select
                  id={`carb-${brew.id}`}
                  name="carbonation"
                  defaultValue={brew.tasting?.carbonation ?? "right"}
                  className={fieldClass}
                >
                  {(Object.keys(CARBONATION_LABEL) as Tasting["carbonation"][]).map((key) => (
                    <option key={key} value={key}>
                      {CARBONATION_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`again-${brew.id}`} className={labelClass}>
                  Brew it again?
                </label>
                <select
                  id={`again-${brew.id}`}
                  name="again"
                  defaultValue={brew.tasting?.wouldBrewAgain ?? "yes"}
                  className={fieldClass}
                >
                  {(Object.keys(AGAIN_LABEL) as Tasting["wouldBrewAgain"][]).map((key) => (
                    <option key={key} value={key}>
                      {AGAIN_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor={`tnotes-${brew.id}`} className={labelClass}>
                Tasting notes
              </label>
              <textarea
                id={`tnotes-${brew.id}`}
                name="tasting-notes"
                rows={3}
                maxLength={2000}
                defaultValue={brew.tasting?.notes ?? ""}
                placeholder="Aroma, flavour, bitterness, what you would change"
                className={fieldClass}
              />
            </div>
          </fieldset>

          {saveError && (
            <p role="alert" className="text-sm text-error">
              Could not save. Your browser may be out of space or blocking site data.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            {brew.tasting ? "Edit notes" : "Notes & tasting"}
          </button>

          <button
            type="button"
            onClick={() => downloadSchedule(toCalendarSchedule(brew))}
            className={secondaryButton}
          >
            Calendar file
          </button>

          {/* globals.css gives every <button> `font: inherit`, which beats the size and
          weight in secondaryButton, so a link needs them forced to look the same. */}
          <Link href={brewAgainHref(brew)} className={`${secondaryButton} text-base! font-normal!`}>
            Brew again
          </Link>

          {confirmingDelete ? (
            <span className="ml-auto flex items-center gap-3 text-xs">
              <span className="font-semibold text-error">Delete this brew?</span>
              <button
                type="button"
                onClick={() => removeBrew(brew.id)}
                className="rounded-lg border border-error-border bg-error-bg px-3 py-2 font-bold uppercase tracking-[0.14em] text-error focus:outline-none focus:ring-2 focus:ring-error"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="font-semibold uppercase tracking-[0.14em] underline underline-offset-2"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="ml-auto text-xs font-semibold uppercase tracking-[0.14em] text-muted underline underline-offset-2 hover:text-error focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}
