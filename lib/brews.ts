// Derived facts about saved brews. Nothing here touches storage: a brew's stage
// is always worked out from its dates and today, never stored, so it can never
// go stale or disagree with the calendar.

import { exclusiveEndDate, type CalendarSchedule } from "@/lib/calendar";
import { parseLocalDate, toDateInputValue } from "@/lib/schedule";
import type { SavedBrew } from "@/lib/storage";

export type BrewStage =
  | "planned"
  | "brewing"
  | "cold-crash"
  | "conditioning"
  | "ready"
  | "tasted";

export const STAGE_LABEL: Record<BrewStage, string> = {
  planned: "Planned",
  brewing: "Brewing",
  "cold-crash": "Cold crash",
  conditioning: "Conditioning",
  ready: "Ready to pour",
  tasted: "Tasted",
};

/**
 * Where a brew is on `today`. Dates are `YYYY-MM-DD`, which sort correctly as
 * plain strings, so there is no Date parsing (and no timezone drift) here.
 */
export function getBrewStage(brew: SavedBrew, today: string): BrewStage {
  if (brew.tasting) {
    return "tasted";
  }

  if (today < brew.brewDate) {
    return "planned";
  }

  if (brew.coldCrashDate && today >= brew.coldCrashDate && today < brew.conditioningDate) {
    return "cold-crash";
  }

  if (today < brew.conditioningDate) {
    return "brewing";
  }

  if (today < brew.tapDate) {
    return "conditioning";
  }

  return "ready";
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). Negative when `to` is earlier. */
export function daysUntil(to: string, from: string): number {
  return Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000,
  );
}

/** A short line for the brew's next milestone, or "" once it is tasted. */
export function nextMilestone(brew: SavedBrew, today: string): string {
  const stage = getBrewStage(brew, today);

  switch (stage) {
    case "planned":
      return `Start brewing in ${plural(daysUntil(brew.brewDate, today), "day")}`;
    case "brewing":
      return brew.coldCrashDate
        ? `Cold crash in ${plural(daysUntil(brew.coldCrashDate, today), "day")}`
        : `Conditioning in ${plural(daysUntil(brew.conditioningDate, today), "day")}`;
    case "cold-crash":
      return `Conditioning in ${plural(daysUntil(brew.conditioningDate, today), "day")}`;
    case "conditioning":
      return `Ready in ${plural(daysUntil(brew.tapDate, today), "day")}`;
    case "ready":
      return "Ready now. Log your tasting notes";
    default:
      return "";
  }
}

function plural(count: number, noun: string): string {
  if (count === 0) {
    return "today";
  }

  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Sort: still in progress first (soonest ready first), finished brews last. */
export function sortBrews(brews: SavedBrew[], today: string): SavedBrew[] {
  return [...brews].sort((a, b) => {
    const aDone = getBrewStage(a, today) === "tasted";
    const bDone = getBrewStage(b, today) === "tasted";

    if (aDone !== bDone) {
      return aDone ? 1 : -1;
    }

    return aDone ? b.tapDate.localeCompare(a.tapDate) : a.tapDate.localeCompare(b.tapDate);
  });
}

/** Rebuild the calendar-export shape from a saved brew. */
export function toCalendarSchedule(brew: SavedBrew): CalendarSchedule {
  const brewDate = parseLocalDate(brew.brewDate);
  const coldCrashDate = brew.coldCrashDate ? parseLocalDate(brew.coldCrashDate) : null;
  const conditioningDate = parseLocalDate(brew.conditioningDate);
  const tapDate = parseLocalDate(brew.tapDate);

  const stages: CalendarSchedule["stages"] = [
    {
      name: "Start brewing",
      start: brewDate,
      end: coldCrashDate ?? conditioningDate,
    },
  ];

  if (coldCrashDate) {
    stages.push({ name: "Begin cold crash", start: coldCrashDate, end: conditioningDate });
  }

  stages.push(
    { name: "Begin conditioning", start: conditioningDate, end: tapDate },
    { name: "Tap day", start: tapDate, end: exclusiveEndDate(tapDate) },
  );

  return {
    name: brew.name,
    style: brew.style || undefined,
    abv: brew.abv === null ? undefined : String(brew.abv),
    timingMode:
      brew.timingMode === undefined
        ? undefined
        : brew.timingMode === "recommended"
          ? "Recommended"
          : "Minimum",
    totalLeadTime: brew.brewDays + brew.coldCrashDays + brew.conditioningDays,
    stages,
  };
}

/** `YYYY-MM-DD` for a Date, re-exported so callers need one import for brew dates. */
export const toBrewDate = toDateInputValue;
