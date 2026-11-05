// Share links for the official and custom planners. A link is just the
// planner's URL with the choices in the query string, so nothing is stored or
// sent anywhere: the person who opens it gets the same choices filled in, and
// still presses Calculate themselves.

import { parseLocalDate, toDateInputValue } from "@/lib/schedule";

export type ShareChoices = {
  packId: string;
  schedule: "recommended" | "minimum";
  coldCrashDays: number;
  /** `YYYY-MM-DD` */
  tapDate: string;
};

/** Origin plus `/?pack=…&schedule=…&crash=…&tap=…` for the official planner. */
export function buildShareHref(origin: string, choices: ShareChoices): string {
  const query = new URLSearchParams({
    pack: choices.packId,
    schedule: choices.schedule,
    crash: String(choices.coldCrashDays),
    tap: choices.tapDate,
  });

  return `${origin}/?${query.toString()}`;
}

/**
 * A `tap` parameter worth prefilling, or "". It must be a real calendar date
 * (so `2026-02-31` is rejected rather than rolling into March) and not in the
 * past, because a link opened weeks later should not start on a dead date.
 */
export function parseTapParam(value: string | null, today: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  if (toDateInputValue(parseLocalDate(value)) !== value) {
    return "";
  }

  return value >= today ? value : "";
}

export type CustomShareChoices = {
  name: string;
  style: string;
  /** Empty string when no ABV was entered. */
  abv: string;
  fermentationDays: number;
  coldCrashDays: number;
  conditioningDays: number;
  /** `YYYY-MM-DD` */
  tapDate: string;
};

/**
 * Origin plus `/custom?prefill=repeat&…&tap=…`. It reuses the same parameters
 * as Brew again, which fill the custom planner from scratch with the exact
 * name and every duration, so it works for any recipe (a Mr. Beer kit, say),
 * not only ones that began as a BrewPack.
 */
export function buildCustomShareHref(origin: string, choices: CustomShareChoices): string {
  const query = new URLSearchParams({
    prefill: "repeat",
    name: choices.name,
    style: choices.style,
    abv: choices.abv,
    fermentation: String(choices.fermentationDays),
    coldCrash: String(choices.coldCrashDays),
    conditioning: String(choices.conditioningDays),
    tap: choices.tapDate,
  });

  return `${origin}/custom?${query.toString()}`;
}

/**
 * Hand a link to the person: the phone share sheet where there is one,
 * otherwise the clipboard. Returns the message to show, or null when there is
 * nothing to say (the share sheet was used, or closed without sending).
 */
export async function shareOrCopy(url: string, title: string): Promise<string | null> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return null;
    }

    await navigator.clipboard.writeText(url);

    return "Link copied. Anyone who opens it gets this schedule filled in.";
  } catch (error) {
    // Closing the share sheet is not a failure.
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    return `Could not copy automatically. Copy this link: ${url}`;
  }
}
