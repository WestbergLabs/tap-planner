// Presentation helpers for the release timeline at /releases.
//
// The data itself comes from data/releases.generated.ts (see
// scripts/release-scan.ts for how the dates are estimated). Everything here is
// about showing those estimates honestly: a month-precision date must never be
// rendered as though we know the exact day.

import type { BrewPackRelease } from "@/data/releases.generated";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Parse a YYYY-MM-DD day into its parts without going through Date, which
 * would shift the day backward for anyone west of UTC.
 */
function parseDay(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

/** The year a release belongs to, or null when the date is unknown. */
export function releaseYear(release: BrewPackRelease): number | null {
  if (!release.releaseDate) return null;
  return parseDay(release.releaseDate).year;
}

/**
 * Format a release date at the precision we actually have. Day precision gets
 * a full date; month precision deliberately omits the day rather than inventing
 * one, and is prefixed so it reads as an estimate at a glance.
 */
export function formatReleaseDate(release: BrewPackRelease): string {
  if (!release.releaseDate) return "Date unknown";

  const { year, month, date } = parseDay(release.releaseDate);
  const monthName = MONTHS[month - 1];

  if (release.precision === "month") {
    return `around ${monthName} ${year}`;
  }

  return `${monthName} ${date}, ${year}`;
}

/** Short form for the date chip on each card. */
export function formatReleaseChip(release: BrewPackRelease): string {
  if (!release.releaseDate) return "?";

  const { month, date } = parseDay(release.releaseDate);
  const monthName = MONTHS[month - 1].slice(0, 3);

  return release.precision === "month" ? monthName : `${monthName} ${date}`;
}

/** Format a re-release date for the "came back" note. */
export function formatReissueDate(day: string): string {
  const { year, month } = parseDay(day);
  return `${MONTHS[month - 1]} ${year}`;
}

export type ReleaseYearGroup = {
  year: number;
  releases: BrewPackRelease[];
};

/**
 * Group dated releases by year, newest first. Undated packs are excluded here
 * and shown in their own section, since dropping them entirely would quietly
 * misrepresent the catalog.
 */
export function groupByYear(
  releases: readonly BrewPackRelease[],
): ReleaseYearGroup[] {
  const groups = new Map<number, BrewPackRelease[]>();

  for (const release of releases) {
    const year = releaseYear(release);
    if (year === null) continue;

    const existing = groups.get(year);
    if (existing) {
      existing.push(release);
    } else {
      groups.set(year, [release]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearReleases]) => ({ year, releases: yearReleases }));
}

/** Packs with no recoverable date at all. */
export function undatedReleases(
  releases: readonly BrewPackRelease[],
): BrewPackRelease[] {
  return releases.filter((release) => !release.releaseDate);
}

/** Packs that have gone away and come back, newest return first. */
export function reissuedReleases(
  releases: readonly BrewPackRelease[],
): BrewPackRelease[] {
  return releases
    .filter((release) => release.reissuedOn)
    .sort((a, b) => (b.reissuedOn ?? "").localeCompare(a.reissuedOn ?? ""));
}

/** Human label for a pack's current availability. */
export function statusLabel(release: BrewPackRelease): string {
  switch (release.status) {
    case "available":
      return "On sale now";
    case "discontinued":
      return "Discontinued";
    default:
      return "Not currently listed";
  }
}
