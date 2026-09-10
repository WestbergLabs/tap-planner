import type { BrewPackRelease } from "@/data/releases.generated";

/**
 * A density strip: one mark per release *event*, stacked by the month it
 * happened in. A filled tick is a launch; an open ring is a pack coming back.
 *
 * Year bars answer "how many in 2024". This answers "when in the year do packs
 * actually drop", which is the question a timeline should be able to answer and
 * a scrolling list of cards never can -- seasonal waves and quiet stretches are
 * visible as shape rather than something you infer by reading 39 dates.
 *
 * Months, not days, on purpose: at day resolution 39 releases over four years
 * are a flat row of single ticks with no clusters to see. Bucketing by month
 * turns it into a histogram where a launch wave stacks up.
 *
 * The line joining a launch to its comeback is drawn ONLY while that pack is
 * hovered. Drawing all nine at once turned the strip into spaghetti: the rules
 * crossed unrelated marks and made the thing harder to read than the list it
 * was meant to summarise.
 *
 * Every year occupies exactly the same width, so the strip lines up with an
 * evenly spaced row of year buttons underneath. The SVG itself is decorative
 * and `aria-hidden`; filtering lives in those real buttons, so nothing here is
 * keyboard- or screen-reader-only content.
 */

const MONTHS_PER_YEAR = 12;
const VIEW_W = 600;
const TICK_H = 7;
const TICK_GAP = 2;
const ROW = TICK_H + TICK_GAP;
const TOP_PAD = 12;
const AXIS_PAD = 12;

/** Status drives mark colour, reusing the stage palette from globals.css. */
const STATUS_FILL: Record<BrewPackRelease["status"], string> = {
  available: "var(--stage-brew)",
  unavailable: "var(--stage-crash)",
  discontinued: "var(--stage-tap)",
};

const STATUS_LABEL: Record<BrewPackRelease["status"], string> = {
  available: "On sale",
  unavailable: "Between seasons",
  discontinued: "Discontinued",
};

export type StripYear = { year: number; count: number };

type StripEvent = {
  release: BrewPackRelease;
  kind: "launch" | "reissue";
  monthIndex: number;
};

/** Month offset from the first year, or null when outside the domain. */
function monthIndexOf(
  date: string | null,
  firstYear: number,
  totalMonths: number,
): number | null {
  if (!date) {
    return null;
  }

  const [year, month] = date.split("-").map(Number);

  if (!year || !month) {
    return null;
  }

  const index = (year - firstYear) * MONTHS_PER_YEAR + (month - 1);

  return index < 0 || index >= totalMonths ? null : index;
}

export default function ReleaseStrip({
  releases: allReleases,
  years,
  selectedYear,
  hoveredId,
  onHover,
  onPick,
}: {
  releases: BrewPackRelease[];
  /** Years present in the data, ascending. Defines the strip's domain. */
  years: StripYear[];
  selectedYear: number | null;
  /** Release currently hovered, in the strip or in the list. */
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
  /** Called when a mark is clicked, to jump to that release's card. */
  onPick?: (release: BrewPackRelease) => void;
}) {
  if (years.length === 0) {
    return null;
  }

  const firstYear = years[0].year;
  const totalMonths = years.length * MONTHS_PER_YEAR;
  const monthWidth = VIEW_W / totalMonths;

  // A comeback is a second event in its own month, not an annotation hanging
  // off the launch: it belongs to the month it happened, and counting it there
  // lets the strip show comeback activity as density too.
  const events: StripEvent[] = [];

  for (const release of allReleases) {
    const launch = monthIndexOf(release.releaseDate, firstYear, totalMonths);

    if (launch !== null) {
      events.push({ release, kind: "launch", monthIndex: launch });
    }

    const reissue = monthIndexOf(release.reissuedOn, firstYear, totalMonths);

    if (reissue !== null) {
      events.push({ release, kind: "reissue", monthIndex: reissue });
    }
  }

  const columns = new Map<number, StripEvent[]>();

  for (const event of events) {
    columns.set(event.monthIndex, [
      ...(columns.get(event.monthIndex) ?? []),
      event,
    ]);
  }

  const tallest = Math.max(...[...columns.values()].map((c) => c.length), 1);
  const baseline = TOP_PAD + tallest * ROW;
  const viewH = baseline + AXIS_PAD;

  // Laid out once so the hover connector can find both ends of a pair.
  const placed: (StripEvent & { x: number; y: number })[] = [];

  for (const [monthIndex, columnEvents] of columns) {
    columnEvents.forEach((event, stackIndex) => {
      placed.push({
        ...event,
        x: monthIndex * monthWidth + monthWidth / 2,
        y: baseline - (stackIndex + 1) * ROW,
      });
    });
  }

  const yearOf = (monthIndex: number) =>
    firstYear + Math.floor(monthIndex / MONTHS_PER_YEAR);

  const dimmed = (monthIndex: number) =>
    selectedYear !== null && selectedYear !== yearOf(monthIndex);

  const hoveredPair = hoveredId
    ? placed.filter((event) => event.release.id === hoveredId)
    : [];

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        width="100%"
        aria-hidden="true"
        className="block"
        style={{ height: "auto" }}
      >
        {/* Year bands: alternating tint so the spans read apart without hard
            rules competing with the marks. */}
        {years.map((entry, index) => (
          <rect
            key={entry.year}
            x={index * MONTHS_PER_YEAR * monthWidth}
            y="2"
            width={MONTHS_PER_YEAR * monthWidth}
            height={baseline}
            rx="6"
            fill={
              selectedYear === entry.year
                ? "var(--accent-soft)"
                : index % 2 === 0
                  ? "var(--field)"
                  : "transparent"
            }
          />
        ))}

        <line
          x1="0"
          y1={baseline + 4}
          x2={VIEW_W}
          y2={baseline + 4}
          stroke="var(--border)"
          strokeWidth="1.5"
        />

        {/* Connector, on hover only: joins a launch to its comeback. */}
        {hoveredPair.length === 2 && (
          <line
            x1={hoveredPair[0].x}
            y1={hoveredPair[0].y + TICK_H / 2}
            x2={hoveredPair[1].x}
            y2={hoveredPair[1].y + TICK_H / 2}
            stroke="var(--foreground)"
            strokeWidth="1.5"
            opacity="0.55"
          />
        )}

        {placed.map((event) => {
          const isHovered = hoveredId === event.release.id;
          const colour = STATUS_FILL[event.release.status];

          return (
            <g
              key={`${event.release.id}-${event.kind}`}
              opacity={dimmed(event.monthIndex) ? 0.25 : 1}
              onMouseEnter={() => onHover?.(event.release.id)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onPick?.(event.release)}
              style={{ cursor: onPick ? "pointer" : undefined }}
            >
              {event.kind === "launch" ? (
                <rect
                  x={event.x - 3.5}
                  y={event.y}
                  width="7"
                  height={TICK_H}
                  rx="2"
                  fill={colour}
                  stroke={isHovered ? "var(--foreground)" : "none"}
                  strokeWidth="1.5"
                />
              ) : (
                <circle
                  cx={event.x}
                  cy={event.y + TICK_H / 2}
                  r="3.4"
                  fill="var(--surface)"
                  stroke={isHovered ? "var(--foreground)" : colour}
                  strokeWidth={isHovered ? 2 : 1.75}
                />
              )}

              {/* Widens the pointer target without changing the drawing. */}
              <rect
                x={event.x - monthWidth / 2}
                y={event.y - TICK_GAP}
                width={monthWidth}
                height={ROW + TICK_GAP}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>

      <p className="sr-only">
        {events.length} release events plotted by month across {years.length}{" "}
        years, busiest month {tallest}.
      </p>
    </div>
  );
}

/** Small key for the mark shapes and colours, shown under the strip. */
export function ReleaseStripLegend() {
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {(Object.keys(STATUS_FILL) as (keyof typeof STATUS_FILL)[]).map(
        (status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="block h-2.5 w-2.5 rounded-sm"
              style={{ background: STATUS_FILL[status] }}
            />
            <span className="text-xs text-muted">{STATUS_LABEL[status]}</span>
          </li>
        ),
      )}

      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="block h-2.5 w-2.5 rounded-full border-[1.5px] border-muted bg-surface"
        />
        <span className="text-xs text-muted">Came back</span>
      </li>
    </ul>
  );
}
