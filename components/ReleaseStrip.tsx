import type { BrewPackRelease } from "@/data/releases.generated";

/**
 * A density strip: one tick per release, stacked by the month it landed in.
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
 * Every year occupies exactly the same width, so the strip lines up with an
 * evenly spaced row of year buttons underneath. The SVG itself is decorative
 * and `aria-hidden`; filtering lives in those real buttons, so nothing here is
 * keyboard- or screen-reader-only content.
 */

const MONTHS_PER_YEAR = 12;
const VIEW_W = 600;
const VIEW_H = 96;
const BASELINE = 74;
const TICK_H = 7;
const TICK_GAP = 2;

/** Status drives tick colour, reusing the stage palette from globals.css. */
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
  /** Called when a tick is clicked, to jump to that release's card. */
  onPick?: (release: BrewPackRelease) => void;
}) {
  if (years.length === 0) {
    return null;
  }

  const firstYear = years[0].year;
  const totalMonths = years.length * MONTHS_PER_YEAR;
  const monthWidth = VIEW_W / totalMonths;

  // Bucket every dated release into its month column.
  const columns = new Map<number, BrewPackRelease[]>();

  for (const release of allReleases) {
    if (!release.releaseDate) {
      continue;
    }

    const [year, month] = release.releaseDate.split("-").map(Number);

    if (!year || !month) {
      continue;
    }

    const index = (year - firstYear) * MONTHS_PER_YEAR + (month - 1);

    if (index < 0 || index >= totalMonths) {
      continue;
    }

    columns.set(index, [...(columns.get(index) ?? []), release]);
  }

  /** Centre x for a YYYY-MM-DD date, or null if outside the domain. */
  function monthX(date: string | null): number | null {
    if (!date) {
      return null;
    }

    const [year, month] = date.split("-").map(Number);

    if (!year || !month) {
      return null;
    }

    const index = (year - firstYear) * MONTHS_PER_YEAR + (month - 1);

    return index < 0 || index >= totalMonths
      ? null
      : index * monthWidth + monthWidth / 2;
  }

  const tallest = Math.max(...[...columns.values()].map((c) => c.length), 1);
  const dated = [...columns.values()].reduce((sum, c) => sum + c.length, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        aria-hidden="true"
        className="block"
        style={{ height: "auto" }}
      >
        {/* Year bands: alternating tint so the four spans read apart without
            drawing hard rules that would compete with the ticks. */}
        {years.map((entry, index) => (
          <rect
            key={entry.year}
            x={index * MONTHS_PER_YEAR * monthWidth}
            y="6"
            width={MONTHS_PER_YEAR * monthWidth}
            height={BASELINE - 2}
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

        {/* Baseline the ticks sit on. */}
        <line
          x1="0"
          y1={BASELINE + 4}
          x2={VIEW_W}
          y2={BASELINE + 4}
          stroke="var(--border)"
          strokeWidth="1.5"
        />

        {[...columns.entries()].map(([index, columnReleases]) => {
          const x = index * monthWidth + monthWidth / 2;

          return columnReleases.map((release, stackIndex) => {
            const y = BASELINE - (stackIndex + 1) * (TICK_H + TICK_GAP);
            const inSelectedYear =
              selectedYear === null ||
              selectedYear === firstYear + Math.floor(index / MONTHS_PER_YEAR);
            const reissueX = monthX(release.reissuedOn);

            return (
              <g
                key={release.id}
                opacity={inSelectedYear ? 1 : 0.25}
                onMouseEnter={() => onHover?.(release.id)}
                onMouseLeave={() => onHover?.(null)}
                onClick={() => onPick?.(release)}
                style={{ cursor: onPick ? "pointer" : undefined }}
              >
                {/* Reissue: a rule from the original launch to the month it
                    came back, ending in an open ring. Shows at a glance which
                    seasonals actually recur and how long the gap was. */}
                {reissueX !== null && (
                  <>
                    <line
                      x1={x}
                      y1={y + TICK_H / 2}
                      x2={reissueX}
                      y2={y + TICK_H / 2}
                      stroke={STATUS_FILL[release.status]}
                      strokeWidth="1.25"
                      strokeDasharray="2 2"
                      opacity="0.55"
                    />
                    <circle
                      cx={reissueX}
                      cy={y + TICK_H / 2}
                      r="3.25"
                      fill="var(--surface)"
                      stroke={STATUS_FILL[release.status]}
                      strokeWidth="1.5"
                    />
                  </>
                )}

                <rect
                  x={x - 3.5}
                  y={y}
                  width="7"
                  height={TICK_H}
                  rx="2"
                  fill={STATUS_FILL[release.status]}
                  stroke={
                    hoveredId === release.id ? "var(--foreground)" : "none"
                  }
                  strokeWidth="1.5"
                />

                {/* Widens the pointer target without changing the drawing. */}
                <rect
                  x={x - monthWidth / 2}
                  y={y - TICK_GAP}
                  width={monthWidth}
                  height={TICK_H + TICK_GAP * 2}
                  fill="transparent"
                />
              </g>
            );
          });
        })}
      </svg>

      <p className="sr-only">
        {dated} releases plotted by month across {years.length} years, tallest
        month {tallest}.
      </p>
    </div>
  );
}

/** Small key for the tick colours, shown under the strip. */
export function ReleaseStripLegend() {
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {(
        Object.keys(STATUS_FILL) as (keyof typeof STATUS_FILL)[]
      ).map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="block h-2.5 w-2.5 rounded-sm"
            style={{ background: STATUS_FILL[status] }}
          />
          <span className="text-xs text-muted">{STATUS_LABEL[status]}</span>
        </li>
      ))}

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
