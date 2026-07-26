// Shared date and schedule utilities.
//
// Both the official BrewPack planner (app/page.tsx) and the custom recipe
// planner (app/custom/page.tsx) work backward from a desired tap date, so the
// date math lives here to avoid duplicating logic across the two pages.

/**
 * Parse a `YYYY-MM-DD` string (as produced by an `<input type="date">`) into a
 * local Date fixed at noon. Anchoring to noon avoids off-by-one errors caused
 * by daylight-saving transitions and timezone rounding.
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day, 12, 0, 0);
}

/** Return a new Date `days` after the given date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);

  return result;
}

/** Return a new Date `days` before the given date. */
export function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);

  return result;
}

/** Format a Date as a long, human-readable local date. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Format a Date as a short "Month D" local date, e.g. "August 8". */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(date);
}

/** Format a Date as a `YYYY-MM-DD` local string, e.g. for a date input value. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Today's date as a `YYYY-MM-DD` string, suitable for a date input `min`. */
export function getTodayString(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Today's date as a local Date fixed at noon, matching `parseLocalDate`'s
 * anchoring so day-difference math between today and a tap date is exact and
 * never shifts across daylight-saving boundaries or time zones.
 */
export function getToday(): Date {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

/**
 * Whole calendar days from `from` to `to`. Both dates are read as local,
 * noon-anchored values, so a DST transition (a 23- or 25-hour day) rounds back
 * to a clean day count. Positive when `to` is after `from`, negative otherwise.
 */
export function daysBetweenDates(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Days available to brew: the calendar days between today and the desired tap
 * date. A schedule fits when its required lead time is no greater than this.
 * Can be negative when the tap date is in the past.
 */
export function getAvailableLeadDays(tapDate: Date, today: Date = getToday()): number {
  return daysBetweenDates(today, tapDate);
}

/** Total lead time a set of stage durations requires, in whole days. */
export function getRequiredLeadDays({
  fermentationDays,
  coldCrashDays,
  conditioningDays,
}: StageDurations): number {
  return fermentationDays + coldCrashDays + conditioningDays;
}

/**
 * The earliest tap date these durations can achieve: today plus the required
 * lead time, so the brew starts no earlier than today.
 */
export function getEarliestTapDate(
  durations: StageDurations,
  today: Date = getToday(),
): Date {
  return addDays(today, getRequiredLeadDays(durations));
}

/**
 * Whether a schedule fits before the desired tap date. Feasible exactly when
 * the required lead time is no greater than the available lead time, which is
 * equivalent to the calculated brew start date being today or later.
 */
export function isScheduleFeasible(
  tapDate: Date,
  durations: StageDurations,
  today: Date = getToday(),
): boolean {
  return getRequiredLeadDays(durations) <= getAvailableLeadDays(tapDate, today);
}

/** The two official timing modes plus the shared cold-crash selection. */
export type OfficialTimingInput = {
  recommendedBrewDays: number;
  recommendedConditioningDays: number;
  minimumBrewDays: number;
  minimumConditioningDays: number;
  coldCrashDays: number;
};

/**
 * Feasibility of an official BrewPack's recommended and minimum timing for a
 * given tap date and cold-crash selection, plus the earliest tap date each
 * mode could reach with that cold crash.
 */
export type OfficialTimingAvailability = {
  recommendedFits: boolean;
  minimumFits: boolean;
  earliestTapDateWithRecommended: Date;
  earliestTapDateWithMinimum: Date;
};

/**
 * Evaluate both official timing modes at once. Each mode combines its own brew
 * and conditioning durations with the shared cold-crash days, so switching cold
 * crash re-derives availability for both.
 */
export function getOfficialTimingAvailability(
  tapDate: Date,
  input: OfficialTimingInput,
  today: Date = getToday(),
): OfficialTimingAvailability {
  const recommended: StageDurations = {
    fermentationDays: input.recommendedBrewDays,
    coldCrashDays: input.coldCrashDays,
    conditioningDays: input.recommendedConditioningDays,
  };

  const minimum: StageDurations = {
    fermentationDays: input.minimumBrewDays,
    coldCrashDays: input.coldCrashDays,
    conditioningDays: input.minimumConditioningDays,
  };

  return {
    recommendedFits: isScheduleFeasible(tapDate, recommended, today),
    minimumFits: isScheduleFeasible(tapDate, minimum, today),
    earliestTapDateWithRecommended: getEarliestTapDate(recommended, today),
    earliestTapDateWithMinimum: getEarliestTapDate(minimum, today),
  };
}

/**
 * Durations for the three schedule stages, in whole days.
 *
 * `fermentationDays` is the first (active) stage. On the official planner this
 * is the BrewPack's brew duration; on the custom planner it is the user's
 * fermentation time. Cold crash sits between fermentation and conditioning and
 * is omitted from the result when zero.
 */
export type StageDurations = {
  fermentationDays: number;
  coldCrashDays: number;
  conditioningDays: number;
};

/**
 * The concrete calendar dates each stage begins, derived by counting backward
 * from the tap date. `coldCrashDate` is null when no cold crash is scheduled.
 */
export type ScheduleStages = {
  fermentationDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
  tapDate: Date;
  totalLeadTime: number;
};

/**
 * Calculate stage start dates from a desired tap date and stage durations.
 *
 * total lead time = fermentation + cold crash + conditioning
 * fermentation start = tap date - total lead time
 */
export function calculateSchedule(
  tapDate: Date,
  { fermentationDays, coldCrashDays, conditioningDays }: StageDurations,
): ScheduleStages {
  const totalLeadTime = fermentationDays + coldCrashDays + conditioningDays;

  const fermentationDate = subtractDays(tapDate, totalLeadTime);

  const coldCrashDate =
    coldCrashDays > 0 ? addDays(fermentationDate, fermentationDays) : null;

  const conditioningDate = addDays(
    fermentationDate,
    fermentationDays + coldCrashDays,
  );

  return {
    fermentationDate,
    coldCrashDate,
    conditioningDate,
    tapDate,
    totalLeadTime,
  };
}
