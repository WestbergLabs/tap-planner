"use client";

// The release timeline. Two views over the same data: what you can buy right
// now (the default, since that is what most people arrive wanting) and the full
// history grouped by year.
//
// Layout is mobile-first throughout. Cards stack rather than using fixed-width
// columns, so a long label like "Approx. September 2023" can never be clipped
// on a narrow screen.

import { useMemo, useState } from "react";

import Image from "next/image";

import PackThumb from "@/components/PackThumb";
import ReleaseStrip, {
  ReleaseStripLegend,
  type StripYear,
} from "@/components/ReleaseStrip";
import PinterNotice from "@/components/PinterNotice";
import SiteNav, { ISSUES_URL } from "@/components/SiteNav";
import { releases, type BrewPackRelease } from "@/data/releases.generated";
import {
  availableReleases,
  formatReissueDate,
  formatReleaseLabel,
  groupByYear,
  reissuedReleases,
  statusLabel,
  undatedReleases,
} from "@/lib/releases";

type View = "available" | "history";

const statusChipClass: Record<BrewPackRelease["status"], string> = {
  available: "border-stage-brew/30 bg-stage-brew-soft text-stage-brew",
  unavailable: "border-stage-crash/30 bg-stage-crash-soft text-stage-crash",
  discontinued: "border-stage-tap/30 bg-stage-tap-soft text-stage-tap",
};

/**
 * The timeline overview: a density strip of every dated release, with an
 * aligned row of year buttons that filter the list below.
 *
 * The strip is decorative (`aria-hidden`); the buttons carry the same
 * information as text and do the actual filtering, so nothing is visual-only.
 * Both share the same equal-width-per-year geometry, which is why the columns
 * line up with the labels.
 */
function TimelineOverview({
  releases: allReleases,
  years,
  selected,
  onSelect,
}: {
  releases: BrewPackRelease[];
  years: StripYear[];
  selected: number | null;
  onSelect: (year: number | null) => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <ReleaseStrip
        releases={allReleases}
        years={years}
        selectedYear={selected}
      />

      <div className="mt-1 flex">
        {years.map(({ year, count }) => {
          const isSelected = selected === year;

          return (
            <button
              key={year}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : year)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
                isSelected ? "bg-accent-soft" : "hover:bg-field"
              }`}
            >
              <span
                className={`text-sm font-semibold tabular-nums ${
                  isSelected ? "text-accent" : "text-foreground"
                }`}
              >
                {year}
              </span>
              <span className="text-xs tabular-nums text-muted">
                {count} {count === 1 ? "pack" : "packs"}
              </span>
            </button>
          );
        })}
      </div>

      <ReleaseStripLegend />

      <p className="mt-3 text-center text-xs leading-5 text-muted">
        {selected === null
          ? "Each tick is one pack, stacked by the month it landed. Tap a year to filter."
          : `Showing ${selected} only — tap it again to show everything.`}
      </p>
    </div>
  );
}

function ReleaseCard({ release }: { release: BrewPackRelease }) {
  const isEstimate = release.precision !== "day";

  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <PackThumb packId={release.id} style={release.style} size={64} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isEstimate
                ? "border-border-strong bg-field text-muted"
                : "border-border bg-field text-foreground"
            }`}
          >
            {formatReleaseLabel(release)}
          </span>

          <span
            className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${statusChipClass[release.status]}`}
          >
            {statusLabel(release)}
          </span>
        </div>

        <h3 className="mt-2.5 font-display text-lg uppercase leading-tight sm:text-xl">
          {release.name}
        </h3>

        <p className="mt-0.5 text-sm text-muted">
          {release.style} &middot; {release.abv}%
        </p>

        {(release.flavors.length > 0 || release.badges.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {release.flavors.map((flavor) => (
              <span
                key={flavor}
                className="rounded-full border border-border bg-field px-2.5 py-1 text-[0.7rem] capitalize text-muted"
              >
                {flavor}
              </span>
            ))}

            {release.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[0.7rem] font-semibold text-accent"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {release.reissuedOn && (
          <p className="mt-3 rounded-lg border border-border bg-field px-3 py-2 text-xs leading-5 text-muted">
            Came back around {formatReissueDate(release.reissuedOn)}, which resets
            the store&rsquo;s date. That is why the release above is a month
            rather than a day.
          </p>
        )}
      </div>
    </li>
  );
}

export default function ReleasesPage() {
  const [view, setView] = useState<View>("available");
  // null means "all years". Filtering rather than anchor-jumping: a jump left
  // every other year still sitting below you, so the list never got shorter.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const available = useMemo(() => availableReleases(releases), []);
  const years = useMemo(() => groupByYear(releases), []);
  const undated = useMemo(() => undatedReleases(releases), []);
  const reissued = useMemo(() => reissuedReleases(releases), []);

  // Ascending for the strip and the button row; the card list stays
  // newest-first below, because a chart of time reads left to right but a
  // "what is new" list reads top down.
  const stripYears = useMemo<StripYear[]>(
    () =>
      [...years]
        .map(({ year, releases: yearReleases }) => ({
          year,
          count: yearReleases.length,
        }))
        .sort((a, b) => a.year - b.year),
    [years],
  );

  const visibleYears = useMemo(
    () =>
      selectedYear === null
        ? years
        : years.filter((entry) => entry.year === selectedYear),
    [years, selectedYear],
  );

  const tabClass = (isActive: boolean): string =>
    `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background ${
      isActive
        ? "bg-accent text-white shadow-card"
        : "bg-surface text-muted hover:text-foreground"
    }`;

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 border-b border-border pb-6">
          <div className="relative z-30 mb-6">
            <div className="relative min-h-[150px] overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero sm:min-h-[180px]">
              <Image
                src="/tap-handles.jpg"
                alt="A row of beer taps behind a bar"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover object-[center_42%]"
              />
            </div>

            {/* Rendered outside the hero: the hero clips its overflow for
                the rounded corners, which would cut off the open menu. */}
            <div className="absolute inset-x-0 top-0 flex justify-end p-4 sm:p-6">
              <SiteNav current="/releases" />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Unofficial and approximate
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
            Release Timeline
          </h1>
          <p className="mt-3 text-base leading-7 text-muted">
            {available.length} packs on sale right now, {releases.length} known
            in total, and {reissued.length} that have come back around at least
            once.
          </p>
        </header>

        <section
          aria-labelledby="guesswork-heading"
          className="mb-8 rounded-2xl border border-accent/30 bg-accent-soft p-4 sm:p-6"
        >
          <h2
            id="guesswork-heading"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
          >
            Read this first: these dates are guesses
          </h2>

          <div className="mt-3 space-y-3 text-sm leading-6 text-foreground/85">
            <p>
              Pinter does not publish release dates anywhere, so none of this is
              official. Every date is worked out from timestamps on the online
              store, and a pack may well have been announced or sold elsewhere
              before the date shown.
            </p>

            <p>
              Anything marked <strong>Approx.</strong> is month-only on purpose.
              A pack that goes away and comes back has its store date
              overwritten by the return, so the original launch is only known to
              within a few weeks. Rather than invent a day, we show the month.
            </p>

            <p>
              Treat this as trivia and a rough guide to when seasonals reappear,
              not a source of truth.{" "}
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-hover hover:decoration-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-accent-soft"
              >
                Spotted a wrong date? Tell us
              </a>
              .
            </p>
          </div>
        </section>

        <div
          role="tablist"
          aria-label="Release views"
          className="mb-6 flex gap-2 rounded-2xl border border-border bg-field p-1.5"
        >
          <button
            type="button"
            role="tab"
            id="tab-available"
            aria-selected={view === "available"}
            aria-controls="panel-available"
            onClick={() => setView("available")}
            className={tabClass(view === "available")}
          >
            Available now
            <span className="ml-1.5 text-xs font-normal opacity-70">
              {available.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-history"
            aria-selected={view === "history"}
            aria-controls="panel-history"
            onClick={() => setView("history")}
            className={tabClass(view === "history")}
          >
            Full history
            <span className="ml-1.5 text-xs font-normal opacity-70">
              {releases.length}
            </span>
          </button>
        </div>

        {view === "available" ? (
          <section
            id="panel-available"
            role="tabpanel"
            aria-labelledby="tab-available"
          >
            <p className="mb-4 text-sm leading-6 text-muted">
              Every pack currently on sale, newest first. Switch to{" "}
              <strong>Full history</strong> for the packs that have been retired
              or are between seasons.
            </p>

            <ul className="space-y-3">
              {available.map((release) => (
                <ReleaseCard key={release.id} release={release} />
              ))}
            </ul>
          </section>
        ) : (
          <section
            id="panel-history"
            role="tabpanel"
            aria-labelledby="tab-history"
          >
            <TimelineOverview
              releases={releases}
              years={stripYears}
              selected={selectedYear}
              onSelect={setSelectedYear}
            />

            {visibleYears.map(({ year, releases: yearReleases }) => (
              <section
                key={year}
                id={`year-${year}`}
                aria-labelledby={`year-${year}-heading`}
                className="mb-8 scroll-mt-6"
              >
                <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                  <h2
                    id={`year-${year}-heading`}
                    className="font-display text-2xl font-semibold uppercase tracking-tight sm:text-3xl"
                  >
                    {year}
                  </h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    {yearReleases.length}{" "}
                    {yearReleases.length === 1 ? "pack" : "packs"}
                  </p>
                </div>

                <ul className="space-y-3">
                  {yearReleases.map((release) => (
                    <ReleaseCard key={release.id} release={release} />
                  ))}
                </ul>
              </section>
            ))}

            {undated.length > 0 && selectedYear === null && (
              <section aria-labelledby="undated-heading" className="mb-8">
                <div className="mb-3 border-b border-border pb-2">
                  <h2
                    id="undated-heading"
                    className="font-display text-2xl font-semibold uppercase tracking-tight sm:text-3xl"
                  >
                    No date found
                  </h2>
                </div>

                <p className="mb-4 text-sm leading-6 text-muted">
                  These packs are in the official pack list but have left no
                  trace on the store, so there is nothing to date them by. If
                  you remember when one of these dropped,{" "}
                  <a
                    href={ISSUES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-hover hover:decoration-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
                  >
                    we would genuinely like to know
                  </a>
                  .
                </p>

                <ul className="space-y-3">
                  {undated.map((release) => (
                    <ReleaseCard key={release.id} release={release} />
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Dates are estimated from public store data, not published by Pinter.
          </p>

          <PinterNotice />

          <p>Header photo by Karl Joshua Bernal on Unsplash.</p>
        </footer>
      </div>
    </main>
  );
}
