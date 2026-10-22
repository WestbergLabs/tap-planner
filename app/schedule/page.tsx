"use client";

// The brewing schedule: every pack's recommended and minimum timing in one
// table. Reads the same generated catalog as the planners, so it is as current
// as the last catalog update and nobody has to maintain it by hand.
//
// "Download PDF" is the browser's print dialog with a print stylesheet (the
// controls and hero are `print:hidden`). That gives a PDF of exactly the
// filters on screen, with no PDF dependency to bundle or keep in sync.

import { useMemo, useState } from "react";

import Image from "next/image";

import PinterNotice from "@/components/PinterNotice";
import SiteNav from "@/components/SiteNav";
import { brewPacks } from "@/data/brewpacks.generated";
import { releases } from "@/data/releases.generated";

type Status = "available" | "unavailable" | "discontinued";
type Filter = "current" | "all" | "gone";
type Sort = "name" | "total" | "abv";

const statusById = new Map<string, Status>(releases.map((r) => [r.id, r.status]));

// A pack the catalog flags discontinued wins over the release feed's status.
const rows = brewPacks.map((p) => ({
  ...p,
  status: (p.discontinued ? "discontinued" : (statusById.get(p.id) ?? "available")) as Status,
  totalDays: p.recommendedBrewDays + p.recommendedConditioningDays,
}));

const FILTERS: { id: Filter; label: string; test: (s: Status) => boolean }[] = [
  { id: "current", label: "On sale", test: (s) => s === "available" },
  { id: "all", label: "All", test: () => true },
  { id: "gone", label: "Discontinued / unavailable", test: (s) => s !== "available" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "total", label: "Total days" },
  { id: "abv", label: "ABV" },
];

export default function SchedulePage() {
  const [filter, setFilter] = useState<Filter>("current");
  const [sort, setSort] = useState<Sort>("name");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => test(r.status))
      .filter((r) => words.every((w) => `${r.name} ${r.style}`.toLowerCase().includes(w)))
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "total"
            ? a.totalDays - b.totalDays || a.name.localeCompare(b.name)
            : b.abv - a.abv || a.name.localeCompare(b.name),
      );
  }, [filter, sort, query]);

  const chip = (active: boolean) =>
    `rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent ${
      active ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"
    }`;

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 border-b border-border pb-6 print:mb-4 print:pb-2">
          <div className="relative z-30 mb-6 print:hidden">
            <div className="relative min-h-[150px] overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero sm:min-h-[180px]">
              <Image
                src="/tap-handles.jpg"
                alt="A row of beer taps behind a bar"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 896px"
                className="object-cover object-[center_42%]"
              />
            </div>
            <div className="absolute inset-x-0 top-0 flex justify-end p-4 sm:p-6">
              <SiteNav current="/schedule" />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent print:hidden">
            Unofficial and approximate
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold uppercase leading-none tracking-tight sm:text-6xl print:text-3xl">
            Brewing Schedule
          </h1>
          <p className="mt-3 text-base leading-7 text-muted print:text-sm print:text-black">
            Recommended and minimum days for each BrewPack. Total days is
            recommended brewing plus conditioning; the optional 1-day cold crash
            counts toward conditioning and adds no time. Condition at 35 to
            40°F.
          </p>
        </header>

        <div className="mb-4 space-y-3 print:hidden">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or style"
            aria-label="Search packs"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show" className="flex flex-wrap gap-2 rounded-2xl border border-border bg-field p-1.5">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={chip(filter === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => window.print()} className="ml-auto rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2">
              Download PDF
            </button>
          </div>
          <p className="text-sm text-muted" aria-live="polite">
            {shown.length} {shown.length === 1 ? "pack" : "packs"}. In the print dialog, choose &ldquo;Save as PDF&rdquo;.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border print:overflow-visible print:border-0">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-foreground text-xs uppercase tracking-wide text-background print:bg-gray-800 print:text-white">
              <tr>
                <th scope="col" className="px-3 py-3">Beer</th>
                <th scope="col" className="px-3 py-3 text-right">ABV</th>
                <th scope="col" className="px-3 py-3 text-right">Brewing</th>
                <th scope="col" className="px-3 py-3 text-right">Conditioning</th>
                <th scope="col" className="px-3 py-3 text-right">Total</th>
                <th scope="col" className="px-3 py-3 text-right">Min. brew / cond.</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border odd:bg-surface/40 print:break-inside-avoid">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {r.name}
                    {r.status !== "available" && (
                      <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase text-muted">
                        {r.status}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{r.abv.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.recommendedBrewDays} days</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.recommendedConditioningDays} days</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.totalDays} days</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.minimumBrewDays} / {r.minimumConditioningDays} days</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">No packs match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 print:hidden">
          <PinterNotice />
        </div>
      </div>
    </main>
  );
}
