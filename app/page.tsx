"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Image from "next/image";
import Link from "next/link";

import BrewPackPicker from "@/components/BrewPackPicker";
import { brewPacks } from "@/data/brewpacks.generated";
import {
  calculateSchedule,
  formatDate,
  getTodayString,
  parseLocalDate,
} from "@/lib/schedule";
import {
  downloadSchedule,
  exclusiveEndDate,
  type CalendarStage,
} from "@/lib/calendar";

type ScheduleType = "recommended" | "minimum";
type ColdCrashDays = 0 | 1 | 2 | 3;

type CalculationResult = {
  packName: string;
  packStyle: string;
  abv: number;
  brewDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
  tapDate: Date;
  brewDays: number;
  coldCrashDays: ColdCrashDays;
  conditioningDays: number;
  totalLeadTime: number;
  schedule: ScheduleType;
};

export default function Home() {
  const resultRef = useRef<HTMLElement>(null);

  const activeBrewPacks = useMemo(
    () =>
      brewPacks
        .filter((pack) => !pack.discontinued)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [brewPackId, setBrewPackId] = useState("");
  const [tapDate, setTapDate] = useState("");

  const [schedule, setSchedule] =
    useState<ScheduleType>("recommended");

  const [coldCrashDays, setColdCrashDays] =
    useState<ColdCrashDays>(0);

  const [result, setResult] =
    useState<CalculationResult | null>(null);

  const [error, setError] = useState("");

  // Confirmation shown after a calendar file is downloaded. Reset whenever the
  // result is cleared so a stale message never lingers over a new schedule.
  const [downloadMessage, setDownloadMessage] = useState("");

  const selectedPack = useMemo(
    () =>
      activeBrewPacks.find(
        (pack) => pack.id === brewPackId,
      ) ?? null,
    [activeBrewPacks, brewPackId],
  );

  // Build a /custom link that prefills the custom planner with the selected
  // BrewPack's currently chosen timing. The BrewPack's brew duration is passed
  // as fermentation days. Prefill travels via URL query params only.
  const customizeHref = useMemo(() => {
    if (!selectedPack) {
      return null;
    }

    const brewDays =
      schedule === "recommended"
        ? selectedPack.recommendedBrewDays
        : selectedPack.minimumBrewDays;

    const conditioningDays =
      schedule === "recommended"
        ? selectedPack.recommendedConditioningDays
        : selectedPack.minimumConditioningDays;

    const params = new URLSearchParams({
      prefill: "brewpack",
      id: selectedPack.id,
      name: selectedPack.name,
      style: selectedPack.style,
      abv: String(selectedPack.abv),
      fermentation: String(brewDays),
      coldCrash: String(coldCrashDays),
      conditioning: String(conditioningDays),
    });

    if (tapDate) {
      params.set("tap", tapDate);
    }

    return `/custom?${params.toString()}`;
  }, [selectedPack, schedule, coldCrashDays, tapDate]);

  useEffect(() => {
    if (!result) {
      return;
    }

    requestAnimationFrame(() => {
      resultRef.current?.focus();
    });
  }, [result]);

  function clearResult() {
    setResult(null);
    setError("");
    setDownloadMessage("");
  }

  // Build the calendar events from the calculated result and download one .ics
  // file. Cold crash is included only when it is part of the schedule.
  function handleExportCalendar() {
    if (!result) {
      return;
    }

    // Each stage spans until the next stage begins (exclusive DTEND). Brewing
    // ends where cold crash starts, or at conditioning when no cold crash.
    const stages: CalendarStage[] = [
      {
        name: "Start brewing",
        start: result.brewDate,
        end: result.coldCrashDate ?? result.conditioningDate,
      },
    ];

    if (result.coldCrashDate) {
      stages.push({
        name: "Begin cold crash",
        start: result.coldCrashDate,
        end: result.conditioningDate,
      });
    }

    stages.push({
      name: "Begin conditioning",
      start: result.conditioningDate,
      end: result.tapDate,
    });

    stages.push({
      name: "Tap day",
      start: result.tapDate,
      end: exclusiveEndDate(result.tapDate),
    });

    downloadSchedule({
      name: result.packName,
      style: result.packStyle,
      abv: String(result.abv),
      timingMode: result.schedule === "recommended" ? "Recommended" : "Minimum",
      totalLeadTime: result.totalLeadTime,
      stages,
    });

    setDownloadMessage(
      "Calendar file downloaded. Open it to add the schedule to your calendar.",
    );
  }

  function handleSelectBrewPack(pack: (typeof activeBrewPacks)[number]) {
    setBrewPackId(pack.id);
    clearResult();
  }

  function clearBrewPack() {
    setBrewPackId("");
    clearResult();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPack) {
      setResult(null);
      setError("Select a BrewPack from the search results.");
      return;
    }

    if (!tapDate) {
      setResult(null);
      setError("Select a desired tap date.");
      return;
    }

    const brewDays =
      schedule === "recommended"
        ? selectedPack.recommendedBrewDays
        : selectedPack.minimumBrewDays;

    const conditioningDays =
      schedule === "recommended"
        ? selectedPack.recommendedConditioningDays
        : selectedPack.minimumConditioningDays;

    const selectedTapDate = parseLocalDate(tapDate);

    const {
      fermentationDate,
      coldCrashDate,
      conditioningDate,
      totalLeadTime,
    } = calculateSchedule(selectedTapDate, {
      fermentationDays: brewDays,
      coldCrashDays,
      conditioningDays,
    });

    setError("");

    setResult({
      packName: selectedPack.name,
      packStyle: selectedPack.style,
      abv: selectedPack.abv,
      brewDate: fermentationDate,
      coldCrashDate,
      conditioningDate,
      tapDate: selectedTapDate,
      brewDays,
      coldCrashDays,
      conditioningDays,
      totalLeadTime,
      schedule,
    });
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-9 border-b border-border pb-7">
          <div className="relative isolate mb-7 min-h-56 overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero">
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
                Brew schedule calculator
              </p>

              <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
                Tap Planner
              </h1>
            </div>
          </div>

          <p className="max-w-xl text-base leading-7 text-muted">
            Pick the day you want to pour. We&rsquo;ll work backward and
            build the schedule.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Build your schedule
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-6">
            <BrewPackPicker
              brewPacks={activeBrewPacks}
              selectedId={brewPackId}
              onSelect={handleSelectBrewPack}
              onClear={clearBrewPack}
              onEdit={clearResult}
              hint="Try Dark Matter, stout, IPA, cider, or lager."
            />

            <p className="-mt-2 text-sm leading-6 text-muted">
              Using your own recipe or need different timing?{" "}
              <Link
                href="/custom"
                className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-hover hover:decoration-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
              >
                Build a custom schedule &rarr;
              </Link>
            </p>

            {selectedPack && (
              <div className="border-y border-border py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      On tap
                    </p>
                    <h2 className="mt-1 font-display text-2xl uppercase leading-tight">
                      {selectedPack.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {selectedPack.style}
                    </p>
                  </div>

                  <div className="border-l border-border pl-4 text-right">
                    <p className="font-display text-3xl leading-none text-accent">
                      {selectedPack.abv}%
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      ABV
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 border-t border-border pt-4 text-sm">
                  <div className="pr-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Recommended
                    </p>
                    <p className="mt-1">
                      {selectedPack.recommendedBrewDays} brew /{" "}
                      {selectedPack.recommendedConditioningDays} condition
                    </p>
                  </div>

                  <div className="border-l border-border pl-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Minimum
                    </p>
                    <p className="mt-1">
                      {selectedPack.minimumBrewDays} brew /{" "}
                      {selectedPack.minimumConditioningDays} condition
                    </p>
                  </div>
                </div>

                {customizeHref && (
                  <div className="mt-4 border-t border-border pt-4">
                    <Link
                      href={customizeHref}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent transition hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                    >
                      Customize timing &rarr;
                    </Link>
                    <p className="mt-2 text-xs leading-5 text-muted">
                      Adjust this BrewPack&rsquo;s schedule on the custom planner.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="min-w-0 max-w-full">
              <label
                htmlFor="tap-date"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                Desired tap date
              </label>

              <div className="tap-date-wrapper">
                <input
                  id="tap-date"
                  type="date"
                  min={getTodayString()}
                  value={tapDate}
                  onChange={(event) => {
                    setTapDate(event.target.value);
                    clearResult();
                  }}
                  className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                  Schedule
                </legend>

                <div className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="schedule"
                      value="recommended"
                      checked={schedule === "recommended"}
                      onChange={() => {
                        setSchedule("recommended");
                        clearResult();
                      }}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm font-medium">
                      Recommended
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="schedule"
                      value="minimum"
                      checked={schedule === "minimum"}
                      onChange={() => {
                        setSchedule("minimum");
                        clearResult();
                      }}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm font-medium">
                      Minimum
                    </span>
                  </label>
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="cold-crash"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  Cold crash
                </label>

                <select
                  id="cold-crash"
                  value={coldCrashDays}
                  onChange={(event) => {
                    setColdCrashDays(
                      Number(
                        event.target.value,
                      ) as ColdCrashDays,
                    );
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  <option value={0}>None</option>
                  <option value={1}>1 day</option>
                  <option value={2}>2 days</option>
                  <option value={3}>3 days</option>
                </select>
              </div>
            </div>

            <p className="-mt-3 text-xs leading-5 text-muted">
              Cold crashing is added between brewing and conditioning.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm text-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Calculate start date
            </button>
          </form>
        </section>

        {result && (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            aria-labelledby="schedule-result-heading"
            className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-result outline-none focus:ring-2 focus:ring-accent/30"
          >
            <div className="grid gap-5 border-b border-border p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stage-brew">
                  Start brewing
                </p>

                <h2
                  id="schedule-result-heading"
                  className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl"
                >
                  {formatDate(result.brewDate)}
                </h2>

                <p className="mt-2 text-sm text-muted">
                  {result.packName} &middot; {result.packStyle} &middot; {result.abv}% ABV
                </p>
              </div>

              <div className="border-t border-border pt-4 text-left sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-right">
                <p className="font-display text-4xl leading-none text-accent">
                  {result.totalLeadTime}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  DAYS LEAD TIME 
                </p>
              </div>
            </div>

            <div className="divide-y divide-border">
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-brew px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-brew-soft font-display text-lg text-stage-brew">01</span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-brew">
                    Start brewing
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDate(result.brewDate)}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {result.brewDays} days
                </p>
              </div>

              {result.coldCrashDate && (
                <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-crash px-5 py-4 sm:px-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-crash-soft font-display text-lg text-stage-crash">02</span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-crash">
                      Begin cold crash
                    </p>
                    <p className="mt-1 font-medium">
                      {formatDate(result.coldCrashDate)}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {result.coldCrashDays} day
                    {result.coldCrashDays === 1 ? "" : "s"}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-condition px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-condition-soft font-display text-lg text-stage-condition">
                  {result.coldCrashDate ? "03" : "02"}
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-condition">
                    Begin conditioning
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDate(result.conditioningDate)}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {result.conditioningDays} days
                </p>
              </div>

              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-tap bg-stage-tap-soft px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-tap-soft font-display text-lg text-stage-tap">
                  {result.coldCrashDate ? "04" : "03"}
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-tap">
                    Tap day
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatDate(result.tapDate)}
                  </p>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-stage-tap">
                  Ready
                </p>
              </div>
            </div>

            <div className="border-t border-border p-5 sm:p-6">
              <button
                type="button"
                onClick={handleExportCalendar}
                className="w-full rounded-xl border border-border-strong bg-field px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface sm:w-auto"
              >
                Add schedule to calendar
              </button>

              <p className="mt-3 text-xs leading-5 text-muted">
                Downloads a calendar file that can be opened with Apple
                Calendar, Google Calendar, Outlook, and most calendar apps.
              </p>

              <p aria-live="polite" className="mt-3 text-xs leading-5 text-stage-brew">
                {downloadMessage}
              </p>
            </div>
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Planning only. Follow the official Pinter app for brewing
            instructions and active brew guidance.
          </p>

          <p>
            Header photo by Karl Joshua Bernal on Unsplash.
          </p>
        </footer>
      </div>
    </main>
  );
}