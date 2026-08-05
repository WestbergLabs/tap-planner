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
import { brewPacks, type BrewPack } from "@/data/brewpacks.generated";
import {
  addDays,
  calculateSchedule,
  formatShortDate,
  getToday,
  getTodayString,
  parseLocalDate,
} from "@/lib/schedule";
import {
  downloadSchedules,
  exclusiveEndDate,
  type CalendarSchedule,
  type CalendarStage,
} from "@/lib/calendar";

type TimingMode = "brewpack" | "custom";
type ScheduleType = "recommended" | "minimum";
type ColdCrashDays = 0 | 1 | 2 | 3;
type TapDurationMode = "days" | "rate";
type AnchorMode = "today" | "date";

// A Pinter holds a fixed fill each brew, so the pints/day helper divides this by
// the drinking rate to estimate how long each one lasts on tap.
const PINTS_PER_PINTER = 12;
const MIN_PINTERS = 2;
const MAX_PINTERS = 12;

type Batch = {
  index: number;
  startDate: Date;
  readyDate: Date;
  emptiesDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
};

type RotationPlan = {
  name: string;
  style: string;
  abv: string;
  timingMode?: "Recommended" | "Minimum";
  firstStageLabel: "Start brewing" | "Start fermentation";
  firstStageWord: "brewing" | "fermentation";
  brewDays: number;
  coldCrashDays: number;
  conditioningDays: number;
  totalLeadTime: number;
  daysOnTap: number;
  spacing: number;
  pinterCount: number;
  neededPinters: number;
  startsInPast: boolean;
  batches: Batch[];
};

type FieldErrors = {
  pinterCount?: string;
  brewPack?: string;
  fermentationDays?: string;
  coldCrashDays?: string;
  conditioningDays?: string;
  tapDuration?: string;
  firstReadyDate?: string;
};

export default function RotationPage() {
  const resultRef = useRef<HTMLElement>(null);

  const activeBrewPacks = useMemo(
    () =>
      brewPacks
        .filter((pack) => !pack.discontinued)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [pinterCount, setPinterCount] = useState("4");

  const [timingMode, setTimingMode] = useState<TimingMode>("brewpack");

  // BrewPack timing.
  const [brewPackId, setBrewPackId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleType>("recommended");
  const [coldCrashDays, setColdCrashDays] = useState<ColdCrashDays>(0);

  // Custom timing.
  const [batchName, setBatchName] = useState("");
  const [fermentationDays, setFermentationDays] = useState("");
  const [customColdCrashDays, setCustomColdCrashDays] = useState("0");
  const [conditioningDays, setConditioningDays] = useState("");

  // How long each Pinter lasts on tap: entered directly, or via a drinking rate.
  const [tapDurationMode, setTapDurationMode] = useState<TapDurationMode>("days");
  const [daysOnTapInput, setDaysOnTapInput] = useState("");
  const [pintsPerDayInput, setPintsPerDayInput] = useState("");

  // When the rotation is anchored.
  const [anchorMode, setAnchorMode] = useState<AnchorMode>("today");
  const [firstReadyDate, setFirstReadyDate] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [plan, setPlan] = useState<RotationPlan | null>(null);
  const [downloadMessage, setDownloadMessage] = useState("");

  const selectedPack = useMemo(
    () => activeBrewPacks.find((pack) => pack.id === brewPackId) ?? null,
    [activeBrewPacks, brewPackId],
  );

  useEffect(() => {
    if (!plan) {
      return;
    }

    requestAnimationFrame(() => {
      resultRef.current?.focus();
    });
  }, [plan]);

  function clearPlan() {
    setPlan(null);
    setDownloadMessage("");
  }

  function handleTimingModeChange(next: TimingMode) {
    setTimingMode(next);
    setErrors({});
    clearPlan();
  }

  function handleSelectBrewPack(pack: BrewPack) {
    setBrewPackId(pack.id);
    setErrors({});
    clearPlan();
  }

  function handleClearBrewPack() {
    setBrewPackId("");
    clearPlan();
  }

  // The derived days-on-tap for the current input mode, or null when the input
  // isn't a usable value yet.
  const derivedDaysOnTap = useMemo(() => {
    if (tapDurationMode === "days") {
      const days = Number(daysOnTapInput);
      return daysOnTapInput.trim() !== "" && Number.isInteger(days) && days >= 2
        ? days
        : null;
    }

    const rate = Number(pintsPerDayInput);
    if (pintsPerDayInput.trim() === "" || !(rate > 0)) {
      return null;
    }
    // Round to whole days; a Pinter that would last under 2 days is out of range.
    const days = Math.round(PINTS_PER_PINTER / rate);
    return days >= 2 ? days : null;
  }, [tapDurationMode, daysOnTapInput, pintsPerDayInput]);

  // Resolve the selected brew's stage durations, or the missing/invalid fields.
  function resolveTiming():
    | {
        brewDays: number;
        coldCrashDays: number;
        conditioningDays: number;
        name: string;
        style: string;
        abv: string;
        firstStageLabel: RotationPlan["firstStageLabel"];
        firstStageWord: RotationPlan["firstStageWord"];
        timingMode?: "Recommended" | "Minimum";
      }
    | { errors: FieldErrors } {
    if (timingMode === "brewpack") {
      if (!selectedPack) {
        return { errors: { brewPack: "Select a BrewPack from the search results." } };
      }

      const brewDays =
        schedule === "recommended"
          ? selectedPack.recommendedBrewDays
          : selectedPack.minimumBrewDays;
      const conditioning =
        schedule === "recommended"
          ? selectedPack.recommendedConditioningDays
          : selectedPack.minimumConditioningDays;

      return {
        brewDays,
        coldCrashDays,
        conditioningDays: conditioning,
        name: selectedPack.name,
        style: selectedPack.style,
        abv: String(selectedPack.abv),
        firstStageLabel: "Start brewing",
        firstStageWord: "brewing",
        timingMode: schedule === "recommended" ? "Recommended" : "Minimum",
      };
    }

    const nextErrors: FieldErrors = {};
    const ferment = Number(fermentationDays);
    const crash = Number(customColdCrashDays);
    const condition = Number(conditioningDays);

    if (fermentationDays.trim() === "" || !Number.isInteger(ferment) || ferment < 1) {
      nextErrors.fermentationDays = "Use a whole number of 1 or more.";
    }
    if (customColdCrashDays.trim() === "" || !Number.isInteger(crash) || crash < 0) {
      nextErrors.coldCrashDays = "Use a whole number of 0 or more.";
    }
    if (conditioningDays.trim() === "" || !Number.isInteger(condition) || condition < 1) {
      nextErrors.conditioningDays = "Use a whole number of 1 or more.";
    }

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors };
    }

    return {
      brewDays: ferment,
      coldCrashDays: crash,
      conditioningDays: condition,
      name: batchName.trim() || "Custom brew",
      style: "",
      abv: "",
      firstStageLabel: "Start fermentation",
      firstStageWord: "fermentation",
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FieldErrors = {};

    const count = Number(pinterCount);
    if (
      pinterCount.trim() === "" ||
      !Number.isInteger(count) ||
      count < MIN_PINTERS ||
      count > MAX_PINTERS
    ) {
      nextErrors.pinterCount = `Enter a whole number from ${MIN_PINTERS} to ${MAX_PINTERS}.`;
    }

    const timing = resolveTiming();
    if ("errors" in timing) {
      Object.assign(nextErrors, timing.errors);
    }

    if (derivedDaysOnTap === null) {
      nextErrors.tapDuration =
        tapDurationMode === "days"
          ? "Enter how many days a Pinter lasts (2 or more)."
          : "Enter your pints per day (a Pinter must last at least 2 days).";
    }

    if (anchorMode === "date" && !firstReadyDate) {
      nextErrors.firstReadyDate = "Choose when the first Pinter should be ready.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || "errors" in timing || derivedDaysOnTap === null) {
      setPlan(null);
      return;
    }

    const daysOnTap = derivedDaysOnTap;
    // A fresh Pinter is timed to be ready the day before the previous empties,
    // so taps are spaced one day less than a Pinter lasts (a 1-day overlap).
    const spacing = daysOnTap - 1;
    const leadTime = timing.brewDays + timing.coldCrashDays + timing.conditioningDays;
    const today = getToday();

    const firstReady =
      anchorMode === "today"
        ? addDays(today, leadTime)
        : parseLocalDate(firstReadyDate);

    const batches: Batch[] = [];
    for (let index = 0; index < count; index += 1) {
      const readyDate = addDays(firstReady, index * spacing);
      const stages = calculateSchedule(readyDate, {
        fermentationDays: timing.brewDays,
        coldCrashDays: timing.coldCrashDays,
        conditioningDays: timing.conditioningDays,
      });

      batches.push({
        index: index + 1,
        startDate: stages.fermentationDate,
        readyDate,
        emptiesDate: addDays(readyDate, daysOnTap),
        coldCrashDate: stages.coldCrashDate,
        conditioningDate: stages.conditioningDate,
      });
    }

    // Pinters needed to sustain the cadence: each is occupied from its start
    // through the day it empties (leadTime + daysOnTap), and a new brew begins
    // every `spacing` days.
    const neededPinters = Math.ceil((leadTime + daysOnTap) / spacing);

    setPlan({
      name: timing.name,
      style: timing.style,
      abv: timing.abv,
      timingMode: timing.timingMode,
      firstStageLabel: timing.firstStageLabel,
      firstStageWord: timing.firstStageWord,
      brewDays: timing.brewDays,
      coldCrashDays: timing.coldCrashDays,
      conditioningDays: timing.conditioningDays,
      totalLeadTime: leadTime,
      daysOnTap,
      spacing,
      pinterCount: count,
      neededPinters,
      startsInPast: batches[0].startDate.getTime() < today.getTime(),
      batches,
    });
  }

  function handleExportCalendar() {
    if (!plan) {
      return;
    }

    const schedules: CalendarSchedule[] = plan.batches.map((batch) => {
      const stages: CalendarStage[] = [
        {
          name: plan.firstStageLabel,
          start: batch.startDate,
          end: batch.coldCrashDate ?? batch.conditioningDate,
        },
      ];

      if (batch.coldCrashDate) {
        stages.push({
          name: "Begin cold crash",
          start: batch.coldCrashDate,
          end: batch.conditioningDate,
        });
      }

      stages.push({
        name: "Begin conditioning",
        start: batch.conditioningDate,
        end: batch.readyDate,
      });

      stages.push({
        name: "Tap day",
        start: batch.readyDate,
        end: exclusiveEndDate(batch.readyDate),
      });

      return {
        name: `${plan.name} — Pinter ${batch.index}`,
        style: plan.style || undefined,
        abv: plan.abv || undefined,
        timingMode: plan.timingMode,
        totalLeadTime: plan.totalLeadTime,
        stages,
      };
    });

    downloadSchedules(schedules, `${plan.name}-rotation`);
    setDownloadMessage(
      `Calendar file with all ${plan.batches.length} Pinters downloaded. Open it to add the rotation to your calendar.`,
    );
  }

  const fieldClass =
    "w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30";
  const labelClass =
    "mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground";

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
            Never run dry
          </p>

          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
            Rotation Planner
          </h1>

          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Running several Pinters? Plan the whole rotation at once. Tell us how
            many you have, your brew timing, and how long each lasts on tap, and
            we&rsquo;ll stagger the start dates so a fresh one is always ready as
            the last runs dry.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Plan your rotation
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6 p-5 sm:p-6">
            {/* Number of Pinters */}
            <div>
              <label htmlFor="pinter-count" className={labelClass}>
                How many Pinters
              </label>
              <input
                id="pinter-count"
                type="number"
                inputMode="numeric"
                min={MIN_PINTERS}
                max={MAX_PINTERS}
                step={1}
                value={pinterCount}
                aria-invalid={errors.pinterCount ? true : undefined}
                onChange={(event) => {
                  setPinterCount(event.target.value);
                  clearPlan();
                }}
                className={`${fieldClass} sm:max-w-[10rem]`}
              />
              {errors.pinterCount && (
                <p className="mt-2 text-sm text-error">{errors.pinterCount}</p>
              )}
            </div>

            {/* Timing source toggle */}
            <fieldset>
              <legend className={labelClass}>Brew timing</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["brewpack", "Use a BrewPack"],
                    ["custom", "Custom durations"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      timingMode === value
                        ? "border-accent bg-accent-soft"
                        : "border-border-strong bg-field hover:border-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="timing-mode"
                      value={value}
                      checked={timingMode === value}
                      onChange={() => handleTimingModeChange(value)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {timingMode === "brewpack" ? (
              <>
                <div>
                  <BrewPackPicker
                    brewPacks={activeBrewPacks}
                    selectedId={brewPackId}
                    onSelect={handleSelectBrewPack}
                    onClear={handleClearBrewPack}
                    onEdit={clearPlan}
                    hint="Search for the BrewPack you'll rotate through."
                  />
                  {errors.brewPack && (
                    <p className="mt-2 text-sm text-error">{errors.brewPack}</p>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <fieldset>
                    <legend className={labelClass}>Schedule</legend>
                    <div className="space-y-3">
                      {(
                        [
                          ["recommended", "Recommended"],
                          ["minimum", "Minimum"],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-3">
                          <input
                            type="radio"
                            name="schedule"
                            value={value}
                            checked={schedule === value}
                            onChange={() => {
                              setSchedule(value);
                              clearPlan();
                            }}
                            className="h-4 w-4 accent-accent"
                          />
                          <span className="text-sm font-medium">{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div>
                    <label htmlFor="rotation-cold-crash" className={labelClass}>
                      Cold crash
                    </label>
                    <select
                      id="rotation-cold-crash"
                      value={coldCrashDays}
                      onChange={(event) => {
                        setColdCrashDays(Number(event.target.value) as ColdCrashDays);
                        clearPlan();
                      }}
                      className={fieldClass}
                    >
                      <option value={0}>None</option>
                      <option value={1}>1 day</option>
                      <option value={2}>2 days</option>
                      <option value={3}>3 days</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="rotation-batch-name" className={labelClass}>
                    Batch name{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id="rotation-batch-name"
                    type="text"
                    value={batchName}
                    autoComplete="off"
                    placeholder="My house pale ale"
                    onChange={(event) => {
                      setBatchName(event.target.value);
                      clearPlan();
                    }}
                    className={fieldClass}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <label htmlFor="rotation-fermentation" className={labelClass}>
                      Fermentation days
                    </label>
                    <input
                      id="rotation-fermentation"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={fermentationDays}
                      placeholder="8"
                      aria-invalid={errors.fermentationDays ? true : undefined}
                      onChange={(event) => {
                        setFermentationDays(event.target.value);
                        clearPlan();
                      }}
                      className={fieldClass}
                    />
                    {errors.fermentationDays && (
                      <p className="mt-2 text-sm text-error">{errors.fermentationDays}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="rotation-custom-crash" className={labelClass}>
                      Cold-crash days
                    </label>
                    <input
                      id="rotation-custom-crash"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={customColdCrashDays}
                      placeholder="0"
                      aria-invalid={errors.coldCrashDays ? true : undefined}
                      onChange={(event) => {
                        setCustomColdCrashDays(event.target.value);
                        clearPlan();
                      }}
                      className={fieldClass}
                    />
                    {errors.coldCrashDays && (
                      <p className="mt-2 text-sm text-error">{errors.coldCrashDays}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="rotation-conditioning" className={labelClass}>
                      Conditioning days
                    </label>
                    <input
                      id="rotation-conditioning"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={conditioningDays}
                      placeholder="5"
                      aria-invalid={errors.conditioningDays ? true : undefined}
                      onChange={(event) => {
                        setConditioningDays(event.target.value);
                        clearPlan();
                      }}
                      className={fieldClass}
                    />
                    {errors.conditioningDays && (
                      <p className="mt-2 text-sm text-error">{errors.conditioningDays}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* How long each Pinter lasts on tap */}
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className={`${labelClass} mb-0`}>How long each lasts on tap</span>
                <div className="inline-flex rounded-lg border border-border-strong bg-field p-0.5 text-xs font-semibold uppercase tracking-[0.12em]">
                  {(
                    [
                      ["days", "Days on tap"],
                      ["rate", "Pints / day"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setTapDurationMode(value);
                        clearPlan();
                      }}
                      className={`rounded-md px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-accent ${
                        tapDurationMode === value
                          ? "bg-accent text-white"
                          : "text-muted hover:text-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {tapDurationMode === "days" ? (
                <input
                  id="days-on-tap"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  step={1}
                  value={daysOnTapInput}
                  placeholder="6"
                  aria-invalid={errors.tapDuration ? true : undefined}
                  onChange={(event) => {
                    setDaysOnTapInput(event.target.value);
                    clearPlan();
                  }}
                  className={`${fieldClass} sm:max-w-[10rem]`}
                />
              ) : (
                <input
                  id="pints-per-day"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={pintsPerDayInput}
                  placeholder="2"
                  aria-invalid={errors.tapDuration ? true : undefined}
                  onChange={(event) => {
                    setPintsPerDayInput(event.target.value);
                    clearPlan();
                  }}
                  className={`${fieldClass} sm:max-w-[10rem]`}
                />
              )}

              <p className="mt-2 text-xs leading-5 text-muted">
                {tapDurationMode === "rate"
                  ? `A Pinter holds about ${PINTS_PER_PINTER} pints${
                      derivedDaysOnTap ? ` — roughly ${derivedDaysOnTap} days on tap` : ""
                    }.`
                  : "How many days a full Pinter lasts you before it runs out."}
              </p>
              {errors.tapDuration && (
                <p className="mt-2 text-sm text-error">{errors.tapDuration}</p>
              )}
            </div>

            {/* Start anchor */}
            <fieldset>
              <legend className={labelClass}>Start the rotation</legend>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="anchor-mode"
                    value="today"
                    checked={anchorMode === "today"}
                    onChange={() => {
                      setAnchorMode("today");
                      clearPlan();
                    }}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm font-medium">Start the first brew today</span>
                </label>

                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="anchor-mode"
                    value="date"
                    checked={anchorMode === "date"}
                    onChange={() => {
                      setAnchorMode("date");
                      clearPlan();
                    }}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm font-medium">
                    Have the first one ready on a date
                  </span>
                </label>
              </div>

              {anchorMode === "date" && (
                <div className="mt-3 min-w-0 max-w-full">
                  <div className="tap-date-wrapper">
                    <input
                      id="first-ready-date"
                      type="date"
                      min={getTodayString()}
                      value={firstReadyDate}
                      aria-label="First Pinter ready date"
                      aria-invalid={errors.firstReadyDate ? true : undefined}
                      onChange={(event) => {
                        setFirstReadyDate(event.target.value);
                        clearPlan();
                      }}
                      className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  {errors.firstReadyDate && (
                    <p className="mt-2 text-sm text-error">{errors.firstReadyDate}</p>
                  )}
                </div>
              )}
            </fieldset>

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Build rotation
            </button>
          </form>
        </section>

        {plan && (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            aria-labelledby="rotation-result-heading"
            className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-result outline-none focus:ring-2 focus:ring-accent/30"
          >
            <div className="border-b border-border p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                {plan.pinterCount}-Pinter rotation
              </p>
              <h2
                id="rotation-result-heading"
                className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl"
              >
                A fresh pour every {plan.spacing}{" "}
                {plan.spacing === 1 ? "day" : "days"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {plan.name}
                {plan.style ? ` · ${plan.style}` : ""}
                {plan.abv ? ` · ${plan.abv}% ABV` : ""}
                {plan.timingMode ? ` · ${plan.timingMode}` : ""} ·{" "}
                {plan.totalLeadTime}-day brew · {plan.daysOnTap} days on tap
              </p>
            </div>

            {/* Pinter-count guidance */}
            <div className="border-b border-border px-5 py-4 sm:px-6">
              {plan.pinterCount >= plan.neededPinters ? (
                <p className="rounded-xl border border-stage-brew/40 bg-stage-brew-soft px-4 py-3 text-sm leading-6 text-foreground">
                  <span className="font-bold">You&rsquo;re covered.</span> This
                  cadence needs about {plan.neededPinters} Pinters to stay
                  continuous, and you have {plan.pinterCount}
                  {plan.pinterCount > plan.neededPinters
                    ? ` — ${plan.pinterCount - plan.neededPinters} to spare.`
                    : " — just right."}
                </p>
              ) : (
                <p className="rounded-xl border border-stage-condition/40 bg-stage-condition-soft px-4 py-3 text-sm leading-6 text-foreground">
                  <span className="font-bold">Heads up.</span> Keeping a fresh
                  pour every {plan.spacing} {plan.spacing === 1 ? "day" : "days"}{" "}
                  really needs about {plan.neededPinters} Pinters; with{" "}
                  {plan.pinterCount} you&rsquo;ll run dry between cycles. Brew the
                  minimum schedule, drink a little slower, or add a Pinter.
                </p>
              )}
            </div>

            {plan.startsInPast && (
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <p
                  role="status"
                  className="rounded-xl border border-stage-condition/40 bg-stage-condition-soft px-4 py-3 text-sm leading-6 text-foreground"
                >
                  <span className="font-bold">Check your first date.</span> The
                  first brew would need to have started on{" "}
                  {formatShortDate(plan.batches[0].startDate)}. If it&rsquo;s
                  already underway you can keep this plan; otherwise move the
                  first-ready date later.
                </p>
              </div>
            )}

            {/* Rotation table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    <th className="px-5 py-3 sm:px-6">Pinter</th>
                    <th className="px-3 py-3 text-stage-brew">Start brewing</th>
                    <th className="px-3 py-3 text-stage-tap">Ready to pour</th>
                    <th className="px-5 py-3 sm:px-6">Empties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.batches.map((batch) => (
                    <tr key={batch.index}>
                      <td className="px-5 py-3 font-display text-lg sm:px-6">
                        {batch.index}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {formatShortDate(batch.startDate)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-stage-tap">
                        {formatShortDate(batch.readyDate)}
                      </td>
                      <td className="px-5 py-3 text-muted sm:px-6">
                        {formatShortDate(batch.emptiesDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border p-5 sm:p-6">
              <button
                type="button"
                onClick={handleExportCalendar}
                className="w-full rounded-xl border border-border-strong bg-field px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface sm:w-auto"
              >
                Add whole rotation to calendar
              </button>
              <p className="mt-3 text-xs leading-5 text-muted">
                Downloads one calendar file with every Pinter&rsquo;s stages —
                opens in Apple Calendar, Google Calendar, Outlook, and most
                calendar apps.
              </p>
              <p aria-live="polite" className="mt-3 text-xs leading-5 text-stage-brew">
                {downloadMessage}
              </p>
            </div>
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Planning only. Days on tap is your own estimate — the rotation is
            only as accurate as it. Everything is calculated in your browser and
            nothing is stored.
          </p>
        </footer>
      </div>
    </main>
  );
}
