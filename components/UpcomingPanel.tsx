"use client";

// "Coming up" on /brews: the next two weeks of milestones across every saved
// brew, grouped by day. It is derived from the saved dates on every render (see
// getUpcomingMilestones), so it is never stored and never stale.

import { daysUntil, getUpcomingMilestones, type MilestoneKind } from "@/lib/brews";
import { formatShortDate, parseLocalDate } from "@/lib/schedule";
import type { SavedBrew } from "@/lib/storage";

const WINDOW_DAYS = 14;

const DOT: Record<MilestoneKind, string> = {
  brew: "bg-stage-brew",
  "cold-crash": "bg-stage-crash",
  condition: "bg-stage-condition",
  tap: "bg-stage-tap",
  ready: "bg-stage-tap",
};

const TEXT: Record<MilestoneKind, string> = {
  brew: "text-stage-brew",
  "cold-crash": "text-stage-crash",
  condition: "text-stage-condition",
  tap: "text-stage-tap",
  ready: "text-stage-tap",
};

function dayLabel(date: string, today: string): { main: string; sub: string } {
  const offset = daysUntil(date, today);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
    parseLocalDate(date),
  );

  if (offset === 0) {
    return { main: "Today", sub: formatShortDate(parseLocalDate(date)) };
  }

  if (offset === 1) {
    return { main: "Tomorrow", sub: formatShortDate(parseLocalDate(date)) };
  }

  return { main: weekday, sub: formatShortDate(parseLocalDate(date)) };
}

export default function UpcomingPanel({
  brews,
  today,
}: {
  brews: SavedBrew[];
  today: string;
}) {
  const milestones = getUpcomingMilestones(brews, today, WINDOW_DAYS);

  // Group consecutive milestones that share a date.
  const days: { date: string; items: typeof milestones }[] = [];

  for (const milestone of milestones) {
    const last = days[days.length - 1];

    if (last && last.date === milestone.date) {
      last.items.push(milestone);
    } else {
      days.push({ date: milestone.date, items: [milestone] });
    }
  }

  return (
    <section aria-labelledby="upcoming-heading" className="mt-6">
      <h2
        id="upcoming-heading"
        className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
      >
        Coming up &middot; next {WINDOW_DAYS} days
      </h2>

      {days.length === 0 ? (
        <div className="rounded-[28px] border border-border bg-surface p-5 text-sm leading-6 text-muted shadow-card sm:p-6">
          Nothing to start, move, or pour in the next {WINDOW_DAYS} days.
        </div>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          {days.map((day) => {
            const label = dayLabel(day.date, today);

            return (
              <li
                key={day.date}
                className="grid grid-cols-[5.5rem_1fr] gap-4 px-5 py-4 sm:px-6"
              >
                <div>
                  <p className="font-display text-lg uppercase leading-tight">
                    {label.main}
                  </p>
                  <p className="text-xs text-muted">{label.sub}</p>
                </div>

                <ul className="space-y-2">
                  {day.items.map((item) => (
                    <li
                      key={`${item.brew.id}-${item.kind}`}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.kind]}`}
                      />
                      <span>
                        <span className={`font-semibold ${TEXT[item.kind]}`}>
                          {item.label}
                        </span>
                        <span className="text-foreground">
                          {": "}
                          {item.brew.name}
                          {item.brew.pinter ? ` (Pinter ${item.brew.pinter})` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
