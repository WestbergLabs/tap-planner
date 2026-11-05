// Derived facts about saved brews. Nothing here touches storage: a brew's stage
// is always worked out from its dates and today, never stored, so it can never
// go stale or disagree with the calendar.

import { exclusiveEndDate, type CalendarSchedule } from "@/lib/calendar";
import { addDays, parseLocalDate, toDateInputValue } from "@/lib/schedule";
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

export type MilestoneKind = "brew" | "cold-crash" | "condition" | "tap" | "ready";

export type Milestone = {
  /** `YYYY-MM-DD` the milestone falls on. */
  date: string;
  kind: MilestoneKind;
  label: string;
  brew: SavedBrew;
};

const MILESTONE_LABEL: Record<Exclude<MilestoneKind, "ready">, string> = {
  brew: "Start brewing",
  "cold-crash": "Begin cold crash",
  condition: "Begin conditioning",
  tap: "Tap day",
};

/**
 * Everything coming up in the next `windowDays` days (today included), soonest
 * first, from brews that are not tasted yet. A brew that has reached its tap
 * date without tasting notes appears once, today, as "Ready to pour", so it
 * does not silently drop off the list.
 */
export function getUpcomingMilestones(
  brews: SavedBrew[],
  today: string,
  windowDays = 14,
): Milestone[] {
  const last = toDateInputValue(addDays(parseLocalDate(today), windowDays));
  const found: Milestone[] = [];

  for (const brew of brews) {
    if (brew.tasting) {
      continue;
    }

    if (brew.tapDate < today) {
      found.push({ date: today, kind: "ready", label: "Ready to pour", brew });
      continue;
    }

    const dates: [MilestoneKind, string | null][] = [
      ["brew", brew.brewDate],
      ["cold-crash", brew.coldCrashDate],
      ["condition", brew.conditioningDate],
      ["tap", brew.tapDate],
    ];

    for (const [kind, date] of dates) {
      if (date && date >= today && date <= last && kind !== "ready") {
        found.push({ date, kind, label: MILESTONE_LABEL[kind], brew });
      }
    }
  }

  return found.sort(
    (a, b) => a.date.localeCompare(b.date) || a.brew.name.localeCompare(b.brew.name),
  );
}

/**
 * Where "Brew again" sends you. Official packs reopen the BrewPack planner with
 * the same pack, timing mode and cold crash; custom recipes reopen the custom
 * planner with every duration filled in. The tap date is never carried over,
 * because a repeat brew is for a new date.
 */
export function brewAgainHref(brew: SavedBrew): string {
  if (brew.source !== "custom" && brew.packId) {
    const query = new URLSearchParams({
      pack: brew.packId,
      schedule: brew.timingMode ?? "recommended",
      crash: String(brew.coldCrashDays),
    });

    return `/?${query.toString()}`;
  }

  const query = new URLSearchParams({
    prefill: "repeat",
    name: brew.name,
    style: brew.style,
    abv: brew.abv === null ? "" : String(brew.abv),
    fermentation: String(brew.brewDays),
    coldCrash: String(brew.coldCrashDays),
    conditioning: String(brew.conditioningDays),
  });

  if (brew.recipe?.system) {
    query.set("system", brew.recipe.system);
  }

  // The recipe text can be long, so the link carries only the brew's id and the
  // custom planner reads the recipe back from this browser's saved brews.
  if (brew.recipe && (brew.recipe.ingredients || brew.recipe.method)) {
    query.set("from", brew.id);
  }

  return `/custom?${query.toString()}`;
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
