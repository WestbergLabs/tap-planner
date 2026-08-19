import type { Metadata } from "next";

import Image from "next/image";
import Link from "next/link";

import { releases, type BrewPackRelease } from "@/data/releases.generated";
import {
  formatReissueDate,
  formatReleaseChip,
  formatReleaseDate,
  groupByYear,
  reissuedReleases,
  statusLabel,
  undatedReleases,
} from "@/lib/releases";

export const metadata: Metadata = {
  title: "BrewPack Release Timeline",
  description:
    "An unofficial, best-guess timeline of every Pinter BrewPack, when it first appeared, and which ones have come back around.",
  alternates: {
    canonical: "/releases",
  },
};

const years = groupByYear(releases);
const undated = undatedReleases(releases);
const reissued = reissuedReleases(releases);

const statusChipClass: Record<BrewPackRelease["status"], string> = {
  available: "border-stage-brew/30 bg-stage-brew-soft text-stage-brew",
  unavailable: "border-stage-crash/30 bg-stage-crash-soft text-stage-crash",
  discontinued: "border-stage-tap/30 bg-stage-tap-soft text-stage-tap",
};

function ReleaseCard({ release }: { release: BrewPackRelease }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="flex w-14 shrink-0 flex-col items-center justify-start rounded-xl border border-border bg-field py-2 text-center">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            {release.precision === "day"
              ? "released"
              : release.precision === "month"
                ? "approx"
                : "no date"}
          </span>
          <span className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
            {formatReleaseChip(release)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-xl uppercase leading-tight">
              {release.name}
            </h3>
            <p className="text-sm text-muted">
              {release.style} &middot; {release.abv}%
            </p>
          </div>

          <p className="mt-1 text-sm text-muted">
            {formatReleaseDate(release)}
          </p>

          {release.blurb && (
            <p className="mt-2 text-sm leading-6 text-foreground/80">
              {release.blurb}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${statusChipClass[release.status]}`}
            >
              {statusLabel(release)}
            </span>

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

          {release.reissuedOn && (
            <p className="mt-3 rounded-lg border border-border bg-field px-3 py-2 text-xs leading-5 text-muted">
              Came back around {formatReissueDate(release.reissuedOn)}, which
              resets the store&rsquo;s date and is why the release above is a
              month rather than a day.
            </p>
          )}
        </div>

        {release.imageUrl && (
          <div className="relative hidden h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-field sm:block">
            <Image
              src={release.imageUrl}
              alt={release.name}
              fill
              sizes="96px"
              className="object-contain p-1"
            />
          </div>
        )}
      </div>
    </li>
  );
}

export default function ReleasesPage() {
  const datedCount = releases.length - undated.length;

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-9 border-b border-border pb-7">
          <div className="relative mb-6 min-h-[180px] overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero">
            <Image
              src="/tap-handles.jpg"
              alt="A row of beer taps behind a bar"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 672px"
              className="object-cover object-[center_42%]"
            />
            <div className="absolute inset-x-0 top-0 p-5 sm:p-6">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/40"
              >
                &larr; Back to BrewPack planner
              </Link>
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Unofficial and approximate
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
            Release Timeline
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Every BrewPack we know about, roughly in the order it showed up.
            {" "}
            {datedCount} packs with a date, {undated.length} without, and{" "}
            {reissued.length} that have come back around at least once.
          </p>
        </header>

        <section
          aria-labelledby="guesswork-heading"
          className="mb-9 rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-6"
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
              official. Every date here is worked out from timestamps on the
              online store, and it is entirely possible for a pack to have been
              announced, teased, or sold somewhere else before the date shown.
            </p>

            <p>
              Dates marked <strong>approx</strong> are month-only on purpose. A
              pack that goes away and comes back gets its store date overwritten
              by the return, so the original launch is only known to within a
              few weeks. Rather than invent a day, we show the month and say so.
            </p>

            <p>
              Treat this as a fun bit of trivia and a rough guide to when
              seasonals tend to reappear, not as a source of truth. Corrections
              very welcome.
            </p>
          </div>
        </section>

        <nav aria-label="Jump to year" className="mb-9">
          <ul className="flex flex-wrap gap-2">
            {years.map(({ year, releases: yearReleases }) => (
              <li key={year}>
                <a
                  href={`#year-${year}`}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
                >
                  {year}
                  <span className="text-xs font-normal text-muted">
                    {yearReleases.length}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {years.map(({ year, releases: yearReleases }) => (
          <section
            key={year}
            id={`year-${year}`}
            aria-labelledby={`year-${year}-heading`}
            className="mb-10 scroll-mt-6"
          >
            <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border pb-2">
              <h2
                id={`year-${year}-heading`}
                className="font-display text-3xl font-semibold uppercase tracking-tight"
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

        {undated.length > 0 && (
          <section
            aria-labelledby="undated-heading"
            className="mb-10 scroll-mt-6"
          >
            <div className="mb-4 border-b border-border pb-2">
              <h2
                id="undated-heading"
                className="font-display text-3xl font-semibold uppercase tracking-tight"
              >
                No date found
              </h2>
            </div>

            <p className="mb-4 text-sm leading-6 text-muted">
              These packs are in the official pack list but have left no trace
              on the store, so there is nothing to date them by. If you remember
              when one of these dropped, we would genuinely like to know.
            </p>

            <ul className="space-y-3">
              {undated.map((release) => (
                <ReleaseCard key={release.id} release={release} />
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Unofficial fan project. Dates are estimated from public store data
            and are not endorsed by or affiliated with Pinter.
          </p>

          <p>Header photo by Karl Joshua Bernal on Unsplash.</p>
        </footer>
      </div>
    </main>
  );
}
