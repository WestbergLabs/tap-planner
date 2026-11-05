// Share links for the official planner. A link is just the planner's URL with
// the choices in the query string, so nothing is stored or sent anywhere: the
// person who opens it gets the same pack, timing and tap date filled in, and
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
