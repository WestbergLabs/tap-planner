"use client";

import { useMemo } from "react";

import Image from "next/image";
import Link from "next/link";

import BackupPanel from "@/components/BackupPanel";
import BrewCard from "@/components/BrewCard";
import PinterNotice from "@/components/PinterNotice";
import SiteNav from "@/components/SiteNav";
import UpcomingPanel from "@/components/UpcomingPanel";
import { getBrewStage, sortBrews } from "@/lib/brews";
import { getTodayString } from "@/lib/schedule";
import type { SavedBrew } from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

type GroupKey = "inProgress" | "ready" | "tasted";

const GROUPS: { key: GroupKey; id: string; label: string; tone: string }[] = [
  { key: "inProgress", id: "in-progress", label: "In progress", tone: "text-stage-brew" },
  { key: "ready", id: "ready-to-pour", label: "Ready to pour", tone: "text-stage-tap" },
  { key: "tasted", id: "tasted", label: "Tasted", tone: "text-accent" },
];

function groupOf(brew: SavedBrew, today: string): GroupKey {
  const stage = getBrewStage(brew, today);

  if (stage === "tasted") return "tasted";
  if (stage === "ready") return "ready";
  return "inProgress";
}

export default function BrewsPage() {
  const { loaded, available, store } = useBrewStore();

  // Read once per render pass; the page is client-only so this never reaches
  // the server HTML (the list below waits for `loaded`).
  const today = getTodayString();

  const brews = useMemo(() => sortBrews(store.brews, today), [store.brews, today]);

  const counts = useMemo(() => {
    let inProgress = 0;
    let ready = 0;
    let tasted = 0;

    for (const brew of store.brews) {
      const stage = getBrewStage(brew, today);

      if (stage === "tasted") {
        tasted += 1;
      } else if (stage === "ready") {
        ready += 1;
      } else {
        inProgress += 1;
      }
    }

    return { inProgress, ready, tasted };
  }, [store.brews, today]);

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-9 border-b border-border pb-7">
          <div className="relative z-30 mb-7">
            <div className="relative isolate min-h-56 overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero">
              <Image
                src="/tap-handles.jpg"
                alt="A row of beer taps behind a bar"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover object-[center_42%]"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5" />

              <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">
                  Saved on this device
                </p>

                <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
                  My brews
                </h1>
              </div>
            </div>

            {/* Rendered outside the hero: the hero clips its overflow for
                the rounded corners, which would cut off the open menu. */}
            <div className="absolute inset-x-0 top-0 flex justify-end p-5 sm:p-6">
              <SiteNav current="/brews" />
            </div>
          </div>

          <p className="max-w-xl text-base leading-7 text-muted">
            Every schedule you save, with where it stands today. Log how each
            one turned out. Saved only in this browser, so back it up
            {" "}
            <Link
              href="#backup"
              className="font-semibold text-accent underline underline-offset-2"
            >
              below
            </Link>
            .
          </p>
        </header>

        {loaded && !available && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm leading-6 text-error"
          >
            <span className="font-bold">Saving is switched off.</span> This
            browser is blocking site data (private browsing, or storage turned
            off), so brews cannot be saved or backed up here. The planners still
            work, and you can still export a calendar file from each one.
          </div>
        )}

        <section aria-label="Summary" className="grid grid-cols-3 gap-3">
          {GROUPS.map((group) => {
            const value = counts[group.key];
            const jumpable = loaded && value > 0;
            const body = (
              <>
                <p className={`font-display text-4xl leading-none ${group.tone}`}>
                  {loaded ? value : " "}
                </p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {group.label}
                </p>
                <p
                  aria-hidden="true"
                  className={`mt-1 text-xs leading-none text-muted ${jumpable ? "" : "invisible"}`}
                >
                  &#8595;
                </p>
              </>
            );
            const base =
              "block rounded-2xl border border-border bg-surface px-3 py-4 text-center shadow-card";

            return jumpable ? (
              <a
                key={group.key}
                href={`#${group.id}`}
                aria-label={`${value} ${group.label.toLowerCase()}, jump to list`}
                className={`${base} transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
              >
                {body}
              </a>
            ) : (
              <div key={group.key} className={base}>
                {body}
              </div>
            );
          })}
        </section>

        {loaded && store.brews.length > 0 && (
          <UpcomingPanel brews={store.brews} today={today} />
        )}

        <section aria-labelledby="brews-heading" className="mt-6">
          <h2
            id="brews-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
          >
            Your brews
          </h2>

          {!loaded ? (
            <p className="text-sm text-muted">Loading your brews&hellip;</p>
          ) : brews.length === 0 ? (
            <div className="rounded-[28px] border border-border bg-surface p-6 text-sm leading-6 shadow-card">
              <p className="font-semibold">Nothing saved yet.</p>
              <p className="mt-1 text-muted">
                Work out a schedule in a planner, then choose{" "}
                <em>Save to My brews</em> under the result. Start with the{" "}
                <Link href="/" className="font-semibold text-accent underline underline-offset-2">
                  BrewPack planner
                </Link>
                , the{" "}
                <Link
                  href="/custom"
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  custom planner
                </Link>
                , or the{" "}
                <Link
                  href="/rotation"
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  multi-Pinter planner
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {GROUPS.map((group) => {
                const groupBrews = brews.filter((brew) => groupOf(brew, today) === group.key);

                if (groupBrews.length === 0) return null;

                return (
                  <div key={group.key}>
                    <h3
                      id={group.id}
                      tabIndex={-1}
                      className="mb-3 scroll-mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-muted outline-none"
                    >
                      {group.label} ({groupBrews.length})
                    </h3>
                    <ul className="space-y-5">
                      {groupBrews.map((brew) => (
                        <BrewCard key={brew.id} brew={brew} today={today} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <BackupPanel today={today} />

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Planning only. Follow the official Pinter app for brewing
            instructions and active brew guidance.
          </p>

          <PinterNotice />

          <p>Header photo by Karl Joshua Bernal on Unsplash.</p>
        </footer>
      </div>
    </main>
  );
}
