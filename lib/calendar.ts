// Shared, browser-only iCalendar (.ics) generation.
//
// Both the official BrewPack planner (app/page.tsx) and the custom recipe
// planner (app/custom/page.tsx) export a calculated schedule as a single
// standards-compliant .ics file. All work happens in the browser: no database,
// storage, authentication, server API, or external calendar service is used.
//
// This module handles calendar-text escaping, all-day date formatting,
// exclusive end-date math, UID generation, safe filename generation, complete
// VCALENDAR assembly, and triggering the download. It intentionally contains no
// schedule-calculation logic -- lib/schedule.ts remains authoritative for the
// stage dates, which are passed in here already computed.

/** The live application URL embedded in every event description. */
const APP_URL = "https://tap-planner.vercel.app/";

/** Product identifier for the generated calendar. */
const PRODID = "-//Tap Planner//Brew Schedule//EN";

/**
 * A single all-day stage to turn into one calendar event. Each stage spans a
 * range: it begins on `start` and ends the day before `end`, because all-day
 * iCalendar end dates are exclusive. Multi-day stages therefore set `end` to
 * the following stage's start date; the single-day tap event sets `end` to the
 * day after `start`.
 */
export type CalendarStage = {
  /** Human-readable stage label, e.g. "Start brewing" or "Tap day". */
  name: string;
  /** The local calendar date the stage begins (inclusive DTSTART). */
  start: Date;
  /** The local calendar date the stage ends (exclusive DTEND). */
  end: Date;
};

/**
 * Everything the calendar module needs to build a schedule's .ics file. The
 * caller (each planner page) supplies already-calculated stage dates plus the
 * descriptive fields available on that page.
 */
export type CalendarSchedule = {
  /** Schedule or BrewPack name. Used in titles, descriptions, UIDs, filename. */
  name: string;
  /** Beverage style, when available. */
  style?: string;
  /** ABV as a display string, e.g. "4.5". Omitted when unavailable. */
  abv?: string;
  /**
   * Selected timing mode for official BrewPacks, e.g. "Recommended" or
   * "Minimum". Omitted on the custom planner where timing is user-defined.
   */
  timingMode?: string;
  /** Total schedule lead time in whole days. */
  totalLeadTime: number;
  /** Ordered stages. Callers omit cold crash when cold-crash days are 0. */
  stages: CalendarStage[];
};

/**
 * Escape a value for use in an iCalendar text field per RFC 5545: backslashes,
 * commas, semicolons, and newlines all require escaping. Backslashes must be
 * escaped first so the escape sequences added afterward are not double-escaped.
 */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Two-digit zero-padded string for date/time components. */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Format a Date as a local `YYYYMMDD` date value for an all-day event. Local
 * calendar fields are read deliberately (not UTC) so a stage never shifts to a
 * neighbouring day because of the viewer's time zone.
 */
export function formatICSDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  return `${year}${month}${day}`;
}

/**
 * All-day iCalendar end dates are exclusive, so a single-day event ends on the
 * following calendar day. Returns a new Date one day after the given date. Used
 * for the tap-day event; multi-day stages instead end on the next stage's start
 * date, so no extra day is added there.
 */
export function exclusiveEndDate(date: Date): Date {
  const end = new Date(date);
  end.setDate(end.getDate() + 1);

  return end;
}

/**
 * Whole-day span between an inclusive start and an exclusive end. Stage dates
 * are anchored at local noon, so a DST transition can make the raw difference
 * 23 or 25 hours; rounding keeps the day count exact.
 */
export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Format a Date as a UTC `YYYYMMDDTHHMMSSZ` timestamp for DTSTAMP. */
export function formatICSTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  const seconds = pad2(date.getUTCSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/** Lowercase, hyphenate, and strip a value down to UID/filename-safe tokens. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['‘’]/g, "") // drop straight and curly apostrophes
    .replace(/[^a-z0-9]+/g, "-") // any other unsupported char becomes a hyphen
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * Build a stable, unique event UID from values available in the browser:
 * stage name + schedule name + stage date, namespaced with `@tap-planner`. The
 * same schedule and stage always produce the same UID, with no database.
 */
export function buildEventUID(stageName: string, scheduleName: string, date: Date): string {
  const stagePart = slugify(stageName) || "stage";
  const namePart = slugify(scheduleName) || "schedule";

  return `${stagePart}-${namePart}-${formatICSDate(date)}@tap-planner`;
}

/**
 * Build a safe download filename base from a schedule name: lowercase,
 * apostrophes removed, unsupported characters replaced with hyphens, repeated
 * hyphens collapsed, and no leading or trailing hyphens. Falls back to
 * "schedule" when nothing usable remains.
 */
export function safeFileName(name: string): string {
  return slugify(name) || "schedule";
}

/** Fold a content line to 75 octets per RFC 5545 using CRLF + a leading space. */
function foldLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }

  const segments: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);

  // Continuation lines are prefixed with a single space, leaving 74 chars.
  while (rest.length > 74) {
    segments.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }

  segments.push(rest);

  return segments.join("\r\n ");
}

/** Assemble the multi-line, escaped DESCRIPTION for one event. */
function buildDescription(
  schedule: CalendarSchedule,
  stageName: string,
  durationDays: number,
): string {
  const lines = [schedule.name];

  if (schedule.style) {
    lines.push(`Style: ${schedule.style}`);
  }

  if (schedule.abv) {
    lines.push(`ABV: ${schedule.abv}%`);
  }

  lines.push(`Stage: ${stageName}`);
  lines.push(`Duration: ${durationDays} day${durationDays === 1 ? "" : "s"}`);

  if (schedule.timingMode) {
    lines.push(`Timing: ${schedule.timingMode}`);
  }

  lines.push(`Total lead time: ${schedule.totalLeadTime} days`);
  lines.push("Generated by Tap Planner");
  lines.push(APP_URL);

  // Escape each line individually, then join with an escaped newline so the
  // whole description is a single, correctly escaped iCalendar text value.
  return lines.map(escapeICSText).join("\\n");
}

/**
 * Build a complete VCALENDAR document for the schedule as a single string with
 * CRLF line endings. `now` is the DTSTAMP time and defaults to the current UTC
 * time; it is a parameter mainly so behaviour is deterministic in tests.
 */
export function buildCalendar(schedule: CalendarSchedule, now: Date = new Date()): string {
  const dtStamp = formatICSTimestamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const stage of schedule.stages) {
    const duration = daysBetween(stage.start, stage.end);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${buildEventUID(stage.name, schedule.name, stage.start)}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${formatICSDate(stage.start)}`,
      `DTEND;VALUE=DATE:${formatICSDate(stage.end)}`,
      `SUMMARY:${escapeICSText(`${schedule.name}: ${stage.name}`)}`,
      `DESCRIPTION:${buildDescription(schedule, stage.name, duration)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Generate the schedule's .ics file in the browser and trigger a normal
 * download. Uses a Blob and an object URL, revoking the URL afterward. Returns
 * the filename used so callers can surface it in a confirmation message.
 */
export function downloadSchedule(schedule: CalendarSchedule, now: Date = new Date()): string {
  const content = buildCalendar(schedule, now);
  const fileName = `${safeFileName(schedule.name)}-schedule.ics`;

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  return fileName;
}
