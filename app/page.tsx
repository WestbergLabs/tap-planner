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
  addDays,
  calculateSchedule,
  formatDate,
  formatShortDate,
  getAvailableLeadDays,
  getOfficialTimingAvailability,
  getToday,
  getTodayString,
  isScheduleFeasible,
  parseLocalDate,
  subtractDays,
  toDateInputValue,
} from "@/lib/schedule";
import {
  downloadSchedule,
  exclusiveEndDate,
  type CalendarStage,
} from "@/lib/calendar";

type ScheduleType = "recommended" | "minimum";
type ColdCrashDays = 0 | 1 | 2 | 3;

// The date the user enters can mean either the day they want to tap, or the day
// the Pinter currently on tap runs out. In "finish" mode the tap date is simply
// the day before the finish date, so the whole planner runs on the tap date and
// only the date field's labelling and one result line differ.
type DateMode = "tap" | "finish";

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
  // The current Pinter's finish date when calculated in finish mode; null when
  // the user planned by a target tap date.
  finishDate: Date | null;
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
  // `tapDate` always holds the tap date (YYYY-MM-DD). In finish mode the date
  // field shows the finish date (tap + 1) but stores the tap date here.
  const [tapDate, setTapDate] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("tap");

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

  // Feasibility of both official timing modes for the current tap date, pack,
  // and cold crash. Recomputed whenever any of those change; the timing mode
  // itself does not affect which modes fit, so it is intentionally not a
  // dependency. Null until both a tap date and a BrewPack are chosen.
  const availability = useMemo(() => {
    if (!selectedPack || !tapDate) {
      return null;
    }

    return getOfficialTimingAvailability(
      parseLocalDate(tapDate),
      {
        recommendedBrewDays: selectedPack.recommendedBrewDays,
        recommendedConditioningDays: selectedPack.recommendedConditioningDays,
        minimumBrewDays: selectedPack.minimumBrewDays,
        minimumConditioningDays: selectedPack.minimumConditioningDays,
        coldCrashDays,
      },
      getToday(),
    );
  }, [selectedPack, tapDate, coldCrashDays]);

  // Derived feasibility states. With no availability yet (missing tap date or
  // BrewPack) nothing is disabled so the defaults remain usable.
  const recommendedDisabled = availability ? !availability.recommendedFits : false;
  const minimumDisabled = availability ? !availability.minimumFits : false;
  const neitherFits = availability
    ? !availability.recommendedFits && !availability.minimumFits
    : false;

  // Recommended can never be the effective choice while it does not fit. Derive
  // the effective mode during render instead of mutating state in an effect, so
  // a disabled recommended option can't survive via stale state or submission.
  // The selection state is only ever changed by an explicit user click.
  const effectiveSchedule: ScheduleType =
    recommendedDisabled && schedule === "recommended" ? "minimum" : schedule;

  const finishMode = dateMode === "finish";

  // A tap date, shown the way the current mode expects: itself in tap mode, or
  // the finish date (one day later) in finish mode. Used for the date field's
  // value, feasibility-message dates, and recovery-button labels.
  const cycleDate = (tap: Date): Date => (finishMode ? addDays(tap, 1) : tap);
  const cycleDateString = (tap: Date): string => toDateInputValue(cycleDate(tap));
  const cycleNoun = finishMode ? "finish date" : "tap date";

  // The value shown in the date field for the stored tap date.
  const dateFieldValue = tapDate ? cycleDateString(parseLocalDate(tapDate)) : "";

  // Store the field's date back as a tap date (subtracting a day in finish mode).
  function handleDateFieldChange(value: string) {
    if (!value) {
      setTapDate("");
    } else {
      setTapDate(
        finishMode
          ? toDateInputValue(subtractDays(parseLocalDate(value), 1))
          : value,
      );
    }
    clearResult();
  }

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

  // Feasibility-panel recovery actions: jump the tap date to the earliest date
  // that supports a given timing mode and select that mode. This behaves
  // exactly like a manual date + mode change -- feasibility recomputes from the
  // shared availability, the stale result is cleared, and the tap-date input
  // updates -- but it never auto-calculates the final schedule.
  function handleUseDate(date: Date, mode: ScheduleType) {
    setTapDate(toDateInputValue(date));
    setSchedule(mode);
    clearResult();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Guardrails: validate independently of the UI's disabled state. A stale or
    // manipulated form must never produce or export a schedule that begins
    // brewing before today.
    if (!tapDate) {
      setResult(null);
      setError(
        finishMode
          ? "Enter when the current Pinter is expected to finish."
          : "Select a desired tap date.",
      );
      return;
    }

    if (!selectedPack) {
      setResult(null);
      setError("Select a BrewPack from the search results.");
      return;
    }

    const selectedTapDate = parseLocalDate(tapDate);
    const today = getToday();

    // Reject a tap date before today even if the browser's min attribute was
    // bypassed. In finish mode the tap date is the day before the finish date.
    if (getAvailableLeadDays(selectedTapDate, today) < 0) {
      setResult(null);
      setError(
        finishMode
          ? "That finish date is too soon — the next brew can't be ready in time."
          : "The tap date must be today or later.",
      );
      return;
    }

    // Recompute availability here rather than trusting the memo, then confirm
    // the chosen timing mode actually fits.
    const currentAvailability = getOfficialTimingAvailability(
      selectedTapDate,
      {
        recommendedBrewDays: selectedPack.recommendedBrewDays,
        recommendedConditioningDays: selectedPack.recommendedConditioningDays,
        minimumBrewDays: selectedPack.minimumBrewDays,
        minimumConditioningDays: selectedPack.minimumConditioningDays,
        coldCrashDays,
      },
      today,
    );

    const chosenFits =
      effectiveSchedule === "recommended"
        ? currentAvailability.recommendedFits
        : currentAvailability.minimumFits;

    if (!chosenFits) {
      setResult(null);
      setDownloadMessage("");

      if (!currentAvailability.minimumFits) {
        setError(
          `${selectedPack.name} cannot be ready by ${formatShortDate(selectedTapDate)}. The earliest possible ${cycleNoun} using minimum timing is ${formatShortDate(cycleDate(currentAvailability.earliestTapDateWithMinimum))}.`,
        );
      } else {
        setError(
          `There is not enough time for the recommended schedule. This BrewPack can still be ready by ${formatShortDate(selectedTapDate)} using minimum timing.`,
        );
      }

      return;
    }

    const brewDays =
      effectiveSchedule === "recommended"
        ? selectedPack.recommendedBrewDays
        : selectedPack.minimumBrewDays;

    const conditioningDays =
      effectiveSchedule === "recommended"
        ? selectedPack.recommendedConditioningDays
        : selectedPack.minimumConditioningDays;

    const chosenDurations = {
      fermentationDays: brewDays,
      coldCrashDays,
      conditioningDays,
    };

    // Final backstop: the calculated brew start date must be today or later.
    if (!isScheduleFeasible(selectedTapDate, chosenDurations, today)) {
      setResult(null);
      setError("This schedule would require brewing before today.");
      return;
    }

    const {
      fermentationDate,
      coldCrashDate,
      conditioningDate,
      totalLeadTime,
    } = calculateSchedule(selectedTapDate, chosenDurations);

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
      schedule: effectiveSchedule,
      finishDate: finishMode ? addDays(selectedTapDate, 1) : null,
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
            <fieldset>
              <legend className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Plan by
              </legend>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["tap", "Desired tap date"],
                    ["finish", "Current Pinter finish date"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      dateMode === value
                        ? "border-accent bg-accent-soft"
                        : "border-border-strong bg-field hover:border-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="date-mode"
                      value={value}
                      checked={dateMode === value}
                      onChange={() => {
                        setDateMode(value);
                        clearResult();
                      }}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>

              {finishMode && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  We&rsquo;ll time the next brew to be ready the day before this
                  Pinter runs out.
                </p>
              )}
            </fieldset>

            <div className="min-w-0 max-w-full">
              <label
                htmlFor="tap-date"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                {finishMode
                  ? "Current Pinter expected to finish"
                  : "Desired tap date"}
              </label>

              <div className="tap-date-wrapper">
                <input
                  id="tap-date"
                  type="date"
                  min={getTodayString()}
                  value={dateFieldValue}
                  onChange={(event) => handleDateFieldChange(event.target.value)}
                  aria-describedby={
                    availability ? "timing-availability" : undefined
                  }
                  className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>

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

              </div>
            )}

            <div id="timing-availability" aria-live="polite">
              {availability && tapDate && selectedPack && (
                <>
                  {availability.recommendedFits && availability.minimumFits && (
                    <div className="rounded-xl border border-stage-brew/40 bg-stage-brew-soft px-4 py-3 text-sm leading-6 text-foreground">
                      <span className="font-bold">Available.</span>{" "}
                      This BrewPack can be ready by{" "}
                      {formatShortDate(parseLocalDate(tapDate))} using either
                      recommended or minimum timing.
                    </div>
                  )}

                  {!availability.recommendedFits && availability.minimumFits && (
                    <div className="rounded-xl border border-stage-condition/40 bg-stage-condition-soft px-4 py-3 text-sm leading-6 text-foreground">
                      <span className="font-bold">Minimum only.</span>{" "}
                      There is not enough time for the recommended schedule.
                      This BrewPack can still be ready by{" "}
                      {formatShortDate(parseLocalDate(tapDate))} using minimum
                      timing.
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            handleUseDate(
                              availability.earliestTapDateWithRecommended,
                              "recommended",
                            )
                          }
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-field px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                        >
                          {finishMode
                            ? "Use recommended finish date: "
                            : "Use recommended date: "}
                          {formatShortDate(
                            cycleDate(availability.earliestTapDateWithRecommended),
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {neitherFits && (
                    <div className="rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm leading-6 text-error">
                      <span className="font-bold">Not enough time.</span>{" "}
                      {selectedPack.name} cannot be ready by{" "}
                      {formatShortDate(parseLocalDate(tapDate))}. The earliest
                      possible {cycleNoun} using minimum timing is{" "}
                      {formatShortDate(
                        cycleDate(availability.earliestTapDateWithMinimum),
                      )}
                      .
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            handleUseDate(
                              availability.earliestTapDateWithMinimum,
                              "minimum",
                            )
                          }
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-field px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                        >
                          {finishMode
                            ? "Use earliest minimum finish date: "
                            : "Use earliest minimum date: "}
                          {formatShortDate(
                            cycleDate(availability.earliestTapDateWithMinimum),
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset
                aria-describedby={
                  availability ? "timing-availability" : undefined
                }
              >
                <legend className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                  Schedule
                </legend>

                <div className="space-y-3">
                  <label
                    className={`flex items-center gap-3 ${
                      recommendedDisabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedule"
                      value="recommended"
                      checked={effectiveSchedule === "recommended"}
                      disabled={recommendedDisabled}
                      onChange={() => {
                        setSchedule("recommended");
                        clearResult();
                      }}
                      className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-medium">
                      Recommended
                    </span>
                  </label>

                  <label
                    className={`flex items-center gap-3 ${
                      minimumDisabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedule"
                      value="minimum"
                      checked={effectiveSchedule === "minimum"}
                      disabled={minimumDisabled}
                      onChange={() => {
                        setSchedule("minimum");
                        clearResult();
                      }}
                      className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
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
              disabled={neitherFits}
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
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
                  DAYS BEFORE TAP
                </p>
              </div>
            </div>

            {result.finishDate && (
              <dl className="grid grid-cols-2 divide-x divide-border border-b border-border text-sm">
                <div className="px-5 py-3 sm:px-6">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Current Pinter finishes
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatShortDate(result.finishDate)}
                  </dd>
                </div>
                <div className="px-5 py-3 sm:px-6">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Next one ready
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatShortDate(result.tapDate)}
                  </dd>
                </div>
              </dl>
            )}

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