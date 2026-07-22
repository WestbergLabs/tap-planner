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

/** Today's date as a `YYYY-MM-DD` string, suitable for a date input `min`. */
export function getTodayString(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
 * fermentation start = tap date − total lead time
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
