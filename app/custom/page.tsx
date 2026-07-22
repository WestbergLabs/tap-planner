"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import BrewPackPicker from "@/components/BrewPackPicker";
import { brewPacks, type BrewPack } from "@/data/brewpacks.generated";
import {
  calculateSchedule,
  formatDate,
  getTodayString,
  parseLocalDate,
} from "@/lib/schedule";
import { downloadSchedule, type CalendarStage } from "@/lib/calendar";

type StartMode = "brewpack" | "scratch";

type CustomResult = {
  scheduleName: string;
  style: string;
  abv: string;
  fermentationDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
  tapDate: Date;
  fermentationDays: number;
  coldCrashDays: number;
  conditioningDays: number;
  totalLeadTime: number;
};

type FieldErrors = {
  scheduleName?: string;
  abv?: string;
  fermentationDays?: string;
  coldCrashDays?: string;
  conditioningDays?: string;
  tapDate?: string;
};

const ABV_MAX = 30;

function CustomPlanner() {
  const searchParams = useSearchParams();
  const resultRef = useRef<HTMLElement>(null);

  // Prefill from URL query params only (no localStorage, cookies, or storage).
  const wasPrefilled = searchParams.get("prefill") === "brewpack";
  const prefilledName = searchParams.get("name") ?? "";

  const activeBrewPacks = useMemo(
    () =>
      brewPacks
        .filter((pack) => !pack.discontinued)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Default to starting from an official BrewPack.
  const [startMode, setStartMode] = useState<StartMode>("brewpack");
  const [selectedBrewPackId, setSelectedBrewPackId] = useState(
    () => searchParams.get("id") ?? "",
  );

  const [scheduleName, setScheduleName] = useState(() =>
    wasPrefilled && prefilledName ? `${prefilledName} - Custom` : "",
  );
  const [style, setStyle] = useState(() => searchParams.get("style") ?? "");
  const [abv, setAbv] = useState(() => searchParams.get("abv") ?? "");
  const [fermentationDays, setFermentationDays] = useState(
    () => searchParams.get("fermentation") ?? "",
  );
  const [coldCrashDays, setColdCrashDays] = useState(
    () => searchParams.get("coldCrash") ?? "0",
  );
  const [conditioningDays, setConditioningDays] = useState(
    () => searchParams.get("conditioning") ?? "",
  );
  const [tapDate, setTapDate] = useState(() => searchParams.get("tap") ?? "");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<CustomResult | null>(null);

  // Confirmation shown after a calendar file is downloaded. Cleared with the
  // result so it never lingers over a freshly calculated schedule.
  const [downloadMessage, setDownloadMessage] = useState("");

  // Move focus to the result region once a schedule has been calculated.
  useEffect(() => {
    if (!result) {
      return;
    }

    requestAnimationFrame(() => {
      resultRef.current?.focus();
    });
  }, [result]);

  // Any edit invalidates the previous result so stale schedules never linger.
  function clearResult() {
    setResult(null);
    setDownloadMessage("");
  }

  // Build the calendar events from the calculated result and download one .ics
  // file. Cold crash is included only when it is part of the schedule.
  function handleExportCalendar() {
    if (!result) {
      return;
    }

    const stages: CalendarStage[] = [
      { name: "Start fermentation", date: result.fermentationDate },
    ];

    if (result.coldCrashDate) {
      stages.push({ name: "Begin cold crash", date: result.coldCrashDate });
    }

    stages.push({ name: "Begin conditioning", date: result.conditioningDate });
    stages.push({ name: "Tap day", date: result.tapDate });

    downloadSchedule({
      name: result.scheduleName,
      style: result.style || undefined,
      abv: result.abv || undefined,
      totalLeadTime: result.totalLeadTime,
      stages,
    });

    setDownloadMessage(
      "Calendar file downloaded. Open it to add the schedule to your calendar.",
    );
  }

  // Selecting a BrewPack seeds the form with its official timing. Every field
  // stays editable afterwards.
  function handleSelectBrewPack(pack: BrewPack) {
    setSelectedBrewPackId(pack.id);
    setScheduleName(`${pack.name} - Custom`);
    setStyle(pack.style);
    setAbv(String(pack.abv));
    setFermentationDays(String(pack.recommendedBrewDays));
    setConditioningDays(String(pack.recommendedConditioningDays));
    setColdCrashDays("0");
    setErrors({});
    clearResult();
  }

  function handleClearBrewPack() {
    setSelectedBrewPackId("");
    clearResult();
  }

  function handleModeChange(mode: StartMode) {
    setStartMode(mode);
    setErrors({});
    clearResult();

    // Start from scratch clears everything except a tap date the user has
    // already chosen on this page.
    if (mode === "scratch") {
      setSelectedBrewPackId("");
      setScheduleName("");
      setStyle("");
      setAbv("");
      setFermentationDays("");
      setConditioningDays("");
      setColdCrashDays("0");
    }
  }

  function validate(): FieldErrors {
    const nextErrors: FieldErrors = {};

    if (!scheduleName.trim()) {
      nextErrors.scheduleName = "Enter a schedule name.";
    }

    if (abv.trim() !== "") {
      const abvValue = Number(abv);

      if (
        Number.isNaN(abvValue) ||
        abvValue < 0 ||
        abvValue > ABV_MAX
      ) {
        nextErrors.abv = `Enter an ABV between 0 and ${ABV_MAX}.`;
      }
    }

    if (fermentationDays.trim() === "") {
      nextErrors.fermentationDays = "Enter fermentation days.";
    } else {
      const value = Number(fermentationDays);

      if (!Number.isInteger(value) || value < 1) {
        nextErrors.fermentationDays =
          "Use a whole number of 1 or more.";
      }
    }

    if (coldCrashDays.trim() === "") {
      nextErrors.coldCrashDays = "Enter cold-crash days (0 for none).";
    } else {
      const value = Number(coldCrashDays);

      if (!Number.isInteger(value) || value < 0) {
        nextErrors.coldCrashDays = "Use a whole number of 0 or more.";
      }
    }

    if (conditioningDays.trim() === "") {
      nextErrors.conditioningDays = "Enter conditioning days.";
    } else {
      const value = Number(conditioningDays);

      if (!Number.isInteger(value) || value < 1) {
        nextErrors.conditioningDays =
          "Use a whole number of 1 or more.";
      }
    }

    if (!tapDate) {
      nextErrors.tapDate = "Select a desired tap date.";
    }

    return nextErrors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);

    // Do not calculate until every required value is valid.
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    const fermentation = Number(fermentationDays);
    const crash = Number(coldCrashDays);
    const conditioning = Number(conditioningDays);
    const selectedTapDate = parseLocalDate(tapDate);

    const {
      fermentationDate,
      coldCrashDate,
      conditioningDate,
      totalLeadTime,
    } = calculateSchedule(selectedTapDate, {
      fermentationDays: fermentation,
      coldCrashDays: crash,
      conditioningDays: conditioning,
    });

    setResult({
      scheduleName: scheduleName.trim(),
      style: style.trim(),
      abv: abv.trim(),
      fermentationDate,
      coldCrashDate,
      conditioningDate,
      tapDate: selectedTapDate,
      fermentationDays: fermentation,
      coldCrashDays: crash,
      conditioningDays: conditioning,
      totalLeadTime,
    });
  }

  const metaParts = result
    ? [
        result.style,
        result.abv ? `${result.abv}% ABV` : "",
      ].filter(Boolean)
    : [];

  const showBrewPackNotice =
    startMode === "brewpack" && selectedBrewPackId !== "";

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-foreground sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-9 border-b border-border pb-7">
          {/* Decorative hero banner. The title and supporting text sit below
              the image rather than over it, so no dark overlay is needed --
              only the back button stays on the image. Kept compact so the
              form remains near the top. */}
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
            Brew schedule calculator
          </p>

          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
            Custom Schedule
          </h1>

          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Start from an official BrewPack or enter your own recipe timing.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Build your schedule
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-6 p-5 sm:p-6"
          >
            <fieldset>
              <legend className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Starting point
              </legend>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    startMode === "brewpack"
                      ? "border-accent bg-accent-soft"
                      : "border-border-strong bg-field hover:border-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="start-mode"
                    value="brewpack"
                    checked={startMode === "brewpack"}
                    onChange={() => handleModeChange("brewpack")}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm font-medium">
                    Start from an official BrewPack
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    startMode === "scratch"
                      ? "border-accent bg-accent-soft"
                      : "border-border-strong bg-field hover:border-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="start-mode"
                    value="scratch"
                    checked={startMode === "scratch"}
                    onChange={() => handleModeChange("scratch")}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm font-medium">
                    Start from scratch
                  </span>
                </label>
              </div>
            </fieldset>

            {startMode === "brewpack" && (
              <BrewPackPicker
                brewPacks={activeBrewPacks}
                selectedId={selectedBrewPackId}
                onSelect={handleSelectBrewPack}
                onClear={handleClearBrewPack}
                onEdit={clearResult}
                hint="Search for a BrewPack to start from its official timing."
              />
            )}

            {showBrewPackNotice && (
              <div
                role="status"
                className="rounded-2xl border border-stage-brew/40 bg-stage-brew-soft px-5 py-4 text-sm leading-6 text-foreground"
              >
                Starting with official BrewPack timing. Adjust any value below.
              </div>
            )}

            <div>
              <label
                htmlFor="schedule-name"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                Schedule name
              </label>

              <input
                id="schedule-name"
                type="text"
                value={scheduleName}
                autoComplete="off"
                placeholder="My house pale ale"
                aria-required="true"
                aria-invalid={errors.scheduleName ? true : undefined}
                aria-describedby={
                  errors.scheduleName ? "schedule-name-error" : undefined
                }
                onChange={(event) => {
                  setScheduleName(event.target.value);
                  clearResult();
                }}
                className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
              />

              {errors.scheduleName && (
                <p
                  id="schedule-name-error"
                  className="mt-2 text-sm text-error"
                >
                  {errors.scheduleName}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="recipe-style"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  Style{" "}
                  <span className="font-normal text-muted">(optional)</span>
                </label>

                <input
                  id="recipe-style"
                  type="text"
                  value={style}
                  autoComplete="off"
                  placeholder="Pale Ale"
                  onChange={(event) => {
                    setStyle(event.target.value);
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div>
                <label
                  htmlFor="recipe-abv"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  ABV{" "}
                  <span className="font-normal text-muted">(optional)</span>
                </label>

                <input
                  id="recipe-abv"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={ABV_MAX}
                  step="0.1"
                  value={abv}
                  placeholder="4.5"
                  aria-invalid={errors.abv ? true : undefined}
                  aria-describedby={errors.abv ? "recipe-abv-error" : undefined}
                  onChange={(event) => {
                    setAbv(event.target.value);
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {errors.abv && (
                  <p id="recipe-abv-error" className="mt-2 text-sm text-error">
                    {errors.abv}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="fermentation-days"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  Fermentation days
                </label>

                <input
                  id="fermentation-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={fermentationDays}
                  placeholder="8"
                  aria-required="true"
                  aria-invalid={errors.fermentationDays ? true : undefined}
                  aria-describedby={
                    errors.fermentationDays
                      ? "fermentation-days-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setFermentationDays(event.target.value);
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {errors.fermentationDays && (
                  <p
                    id="fermentation-days-error"
                    className="mt-2 text-sm text-error"
                  >
                    {errors.fermentationDays}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="cold-crash-days"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  Cold-crash days
                </label>

                <input
                  id="cold-crash-days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={coldCrashDays}
                  placeholder="0"
                  aria-required="true"
                  aria-invalid={errors.coldCrashDays ? true : undefined}
                  aria-describedby={
                    errors.coldCrashDays ? "cold-crash-days-error" : undefined
                  }
                  onChange={(event) => {
                    setColdCrashDays(event.target.value);
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {errors.coldCrashDays && (
                  <p
                    id="cold-crash-days-error"
                    className="mt-2 text-sm text-error"
                  >
                    {errors.coldCrashDays}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="conditioning-days"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
                >
                  Conditioning days
                </label>

                <input
                  id="conditioning-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={conditioningDays}
                  placeholder="5"
                  aria-required="true"
                  aria-invalid={errors.conditioningDays ? true : undefined}
                  aria-describedby={
                    errors.conditioningDays
                      ? "conditioning-days-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setConditioningDays(event.target.value);
                    clearResult();
                  }}
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {errors.conditioningDays && (
                  <p
                    id="conditioning-days-error"
                    className="mt-2 text-sm text-error"
                  >
                    {errors.conditioningDays}
                  </p>
                )}
              </div>
            </div>

            <p className="-mt-3 text-xs leading-5 text-muted">
              Cold crashing is added between fermentation and conditioning. Set
              it to 0 to skip it.
            </p>

            <div className="min-w-0 max-w-full">
              <label
                htmlFor="custom-tap-date"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                Desired tap date
              </label>

              <div className="tap-date-wrapper">
                <input
                  id="custom-tap-date"
                  type="date"
                  min={getTodayString()}
                  value={tapDate}
                  aria-required="true"
                  aria-invalid={errors.tapDate ? true : undefined}
                  aria-describedby={
                    errors.tapDate ? "custom-tap-date-error" : undefined
                  }
                  onChange={(event) => {
                    setTapDate(event.target.value);
                    clearResult();
                  }}
                  className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>

              {errors.tapDate && (
                <p
                  id="custom-tap-date-error"
                  className="mt-2 text-sm text-error"
                >
                  {errors.tapDate}
                </p>
              )}
            </div>

            <p className="rounded-xl border border-border bg-field px-4 py-3 text-xs leading-5 text-muted">
              Custom recipe details are used only to calculate this schedule and
              are not automatically saved.
            </p>

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Build custom schedule
            </button>
          </form>
        </section>

        {result && (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            aria-labelledby="custom-result-heading"
            className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-result outline-none focus:ring-2 focus:ring-accent/30"
          >
            <div className="grid gap-5 border-b border-border p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stage-brew">
                  Start fermentation
                </p>

                <h2
                  id="custom-result-heading"
                  className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl"
                >
                  {formatDate(result.fermentationDate)}
                </h2>

                <p className="mt-2 text-sm text-muted">
                  {[result.scheduleName, ...metaParts].join(" \u00B7 ")}
                </p>
              </div>

              <div className="border-t border-border pt-4 text-left sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-right">
                <p className="font-display text-4xl leading-none text-accent">
                  {result.totalLeadTime}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Days total
                </p>
              </div>
            </div>

            <div className="divide-y divide-border">
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-brew px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-brew-soft font-display text-lg text-stage-brew">
                  01
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-brew">
                    Start fermentation
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDate(result.fermentationDate)}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {result.fermentationDays} days
                </p>
              </div>

              {result.coldCrashDate && (
                <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-l-4 border-stage-crash px-5 py-4 sm:px-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stage-crash-soft font-display text-lg text-stage-crash">
                    02
                  </span>
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
            Planning only. Custom schedules are calculated in your browser and
            are not stored.
          </p>
        </footer>
      </div>
    </main>
  );
}

export default function CustomPage() {
  return (
    <Suspense fallback={null}>
      <CustomPlanner />
    </Suspense>
  );
}
