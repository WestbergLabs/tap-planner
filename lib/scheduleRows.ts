// One row per BrewPack for the schedule page and the exported schedule files.
// Shared so the page and the PDF/CSV can never disagree about status or totals.

import { brewPacks } from "@/data/brewpacks.generated";
import { releases } from "@/data/releases.generated";

export type ScheduleStatus = "available" | "unavailable" | "discontinued";

const statusById = new Map<string, ScheduleStatus>(
  releases.map((r) => [r.id, r.status]),
);

export const scheduleRows = brewPacks.map((p) => ({
  ...p,
  // A pack the catalog flags discontinued wins over the release feed's status.
  status: (p.discontinued
    ? "discontinued"
    : (statusById.get(p.id) ?? "available")) as ScheduleStatus,
  // The optional 1-day cold crash counts toward conditioning, so it adds nothing.
  totalDays: p.recommendedBrewDays + p.recommendedConditioningDays,
}));

export type ScheduleRow = (typeof scheduleRows)[number];
