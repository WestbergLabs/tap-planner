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

import BeerPicker, { CUSTOM_BEER } from "@/components/BeerPicker";
import { brewPacks } from "@/data/brewpacks.generated";
import {
  addDays,
  calculateSchedule,
  formatShortDate,
  getToday,
  getTodayString,
  parseLocalDate,
  subtractDays,
} from "@/lib/schedule";
import {
  downloadSchedules,
  exclusiveEndDate,
  type CalendarSchedule,
  type CalendarStage,
} from "@/lib/calendar";

type TapDurationMode = "days" | "rate";
type AnchorMode = "today" | "date";
// Where a Pinter's beer is right now: not started, already brewing, or pouring.
type SlotStatus = "new" | "brewing" | "ontap";

const PINTS_PER_PINTER = 12;
const MIN_PINTERS = 2;
const MAX_PINTERS = 12;

type Slot = {
  kind: "brewpack" | "custom";
  brewPackId: string;
  useMinimum: boolean;
  coldCrashDays: string;
  customName: string;
  fermentationDays: string;
  customColdCrashDays: string;
  conditioningDays: string;
  onTap: string;
  status: SlotStatus;
  // For "brewing": the date brewing started. For "ontap": the date it empties.
  statusDate: string;
};

const DEFAULT_SLOT: Slot = {
  kind: "brewpack",
  brewPackId: "",
  useMinimum: false,
  coldCrashDays: "0",
  customName: "",
  fermentationDays: "",
  customColdCrashDays: "0",
  conditioningDays: "",
  onTap: "",
  status: "new",
  statusDate: "",
};

type Batch = {
  index: number;
  name: string;
  style: string;
  abv: string;
  timingMode?: "Recommended" | "Minimum";
  firstStageLabel: "Start brewing" | "Start fermentation";
  brewDays: number;
  coldCrashDays: number;
  conditioningDays: number;
  totalLeadTime: number;
  daysOnTap: number;
  status: SlotStatus;
  startDate: Date | null;
  readyDate: Date;
  emptiesDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
};

type RotationPlan = {
  count: number;
  firstPour: Date;
  lastEmpties: Date;
  behindIndexes: number[];
  batches: Batch[];
};

function deriveDaysOnTap(value: string, mode: TapDurationMode): number | null {
  if (value.trim() === "") {
    return null;
  }
  if (mode === "days") {
    const days = Number(value);
    return Number.isInteger(days) && days >= 2 ? days : null;
  }
  const rate = Number(value);
  if (!(rate > 0)) {
    return null;
  }
  const days = Math.round(PINTS_PER_PINTER / rate);
  return days >= 2 ? days : null;
}

type ResolvedSlot = {
  name: string;
  style: string;
  abv: string;
  timingMode?: "Recommended" | "Minimum";
  firstStageLabel: "Start brewing" | "Start fermentation";
  brewDays: number;
  coldCrashDays: number;
  conditioningDays: number;
  leadTime: number;
  daysOnTap: number;
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
  const [tapDurationMode, setTapDurationMode] = useState<TapDurationMode>("days");
  const [anchorMode, setAnchorMode] = useState<AnchorMode>("today");
  const [firstReadyDate, setFirstReadyDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);

  const [countError, setCountError] = useState("");
  const [slotErrors, setSlotErrors] = useState<Record<number, string>>({});
  const [firstReadyError, setFirstReadyError] = useState("");
  const [plan, setPlan] = useState<RotationPlan | null>(null);
  const [downloadMessage, setDownloadMessage] = useState("");

  const count = Number(pinterCount);
  const validCount =
    pinterCount.trim() !== "" &&
    Number.isInteger(count) &&
    count >= MIN_PINTERS &&
    count <= MAX_PINTERS;
  const rowCount = validCount ? count : 0;

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

  function slotAt(index: number): Slot {
    return slots[index] ?? DEFAULT_SLOT;
  }

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((current) => {
      const next = current.slice();
      while (next.length <= index) {
        next.push(DEFAULT_SLOT);
      }
      next[index] = { ...(next[index] ?? DEFAULT_SLOT), ...patch };
      return next;
    });
    clearPlan();
  }

  // Only the very first beer, when nothing precedes it, uses the global anchor.
  const firstRowIsNew = slotAt(0).status === "new";

  function resolveSlot(slot: Slot): ResolvedSlot | { error: string } {
    const daysOnTap = deriveDaysOnTap(slot.onTap, tapDurationMode);
    if (daysOnTap === null) {
      return {
        error:
          tapDurationMode === "days"
            ? "Enter how many days it lasts on tap (2 or more)."
            : "Enter pints per day (it must last at least 2 days).",
      };
    }

    if (slot.kind === "brewpack") {
      const pack = activeBrewPacks.find((candidate) => candidate.id === slot.brewPackId);
      if (!pack) {
        return { error: "Choose a beer for this Pinter." };
      }
      const brewDays = slot.useMinimum ? pack.minimumBrewDays : pack.recommendedBrewDays;
      const conditioningDays = slot.useMinimum
        ? pack.minimumConditioningDays
        : pack.recommendedConditioningDays;
      const coldCrashDays = Number(slot.coldCrashDays) || 0;
      return {
        name: pack.name,
        style: pack.style,
        abv: String(pack.abv),
        timingMode: slot.useMinimum ? "Minimum" : "Recommended",
        firstStageLabel: "Start brewing",
        brewDays,
        coldCrashDays,
        conditioningDays,
        leadTime: brewDays + coldCrashDays + conditioningDays,
        daysOnTap,
      };
    }

    const ferment = Number(slot.fermentationDays);
    const crash = Number(slot.customColdCrashDays);
    const condition = Number(slot.conditioningDays);
    if (
      slot.fermentationDays.trim() === "" || !Number.isInteger(ferment) || ferment < 1 ||
      slot.customColdCrashDays.trim() === "" || !Number.isInteger(crash) || crash < 0 ||
      slot.conditioningDays.trim() === "" || !Number.isInteger(condition) || condition < 1
    ) {
      return { error: "Enter valid fermentation / cold-crash / conditioning days." };
    }
    return {
      name: slot.customName.trim() || "Custom brew",
      style: "",
      abv: "",
      firstStageLabel: "Start fermentation",
      brewDays: ferment,
      coldCrashDays: crash,
      conditioningDays: condition,
      leadTime: ferment + crash + condition,
      daysOnTap,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCountError("");
    setSlotErrors({});
    setFirstReadyError("");

    if (!validCount) {
      setCountError(`Enter a whole number from ${MIN_PINTERS} to ${MAX_PINTERS}.`);
      setPlan(null);
      return;
    }

    const resolved: ResolvedSlot[] = [];
    const nextSlotErrors: Record<number, string> = {};

    for (let index = 0; index < count; index += 1) {
      const slot = slotAt(index);
      const result = resolveSlot(slot);
      if ("error" in result) {
        nextSlotErrors[index] = result.error;
        continue;
      }
      if (slot.status !== "new" && !slot.statusDate) {
        nextSlotErrors[index] =
          slot.status === "brewing"
            ? "Enter the date you started brewing."
            : "Enter the date it empties.";
        continue;
      }
      resolved[index] = result;
    }

    let hasError = Object.keys(nextSlotErrors).length > 0;

    if (firstRowIsNew && anchorMode === "date" && !firstReadyDate) {
      setFirstReadyError("Choose when the first beer should be ready.");
      hasError = true;
    }

    if (hasError) {
      setSlotErrors(nextSlotErrors);
      setPlan(null);
      return;
    }

    const today = getToday();
    const batches: Batch[] = [];
    let previousEmpties: Date | null = null;

    for (let index = 0; index < count; index += 1) {
      const slot = slotAt(index);
      const item = resolved[index];

      let startDate: Date | null;
      let readyDate: Date;
      let emptiesDate: Date;

      if (slot.status === "brewing") {
        startDate = parseLocalDate(slot.statusDate);
        readyDate = addDays(startDate, item.leadTime);
        emptiesDate = addDays(readyDate, item.daysOnTap);
      } else if (slot.status === "ontap") {
        emptiesDate = parseLocalDate(slot.statusDate);
        readyDate = subtractDays(emptiesDate, item.daysOnTap);
        startDate = null;
      } else {
        readyDate =
          previousEmpties !== null
            ? subtractDays(previousEmpties, 1)
            : anchorMode === "today"
              ? addDays(today, item.leadTime)
              : parseLocalDate(firstReadyDate);
        startDate = subtractDays(readyDate, item.leadTime);
        emptiesDate = addDays(readyDate, item.daysOnTap);
      }

      const stages = calculateSchedule(readyDate, {
        fermentationDays: item.brewDays,
        coldCrashDays: item.coldCrashDays,
        conditioningDays: item.conditioningDays,
      });

      batches.push({
        index: index + 1,
        name: item.name,
        style: item.style,
        abv: item.abv,
        timingMode: item.timingMode,
        firstStageLabel: item.firstStageLabel,
        brewDays: item.brewDays,
        coldCrashDays: item.coldCrashDays,
        conditioningDays: item.conditioningDays,
        totalLeadTime: item.leadTime,
        daysOnTap: item.daysOnTap,
        status: slot.status,
        startDate,
        readyDate,
        emptiesDate,
        coldCrashDate: stages.coldCrashDate,
        conditioningDate: stages.conditioningDate,
      });

      previousEmpties = emptiesDate;
    }

    // A not-yet-started beer whose start date is already in the past means the
    // previous beer empties too soon to brew this one in time.
    const behindIndexes = batches
      .filter(
        (batch) =>
          batch.status === "new" &&
          batch.startDate !== null &&
          batch.startDate.getTime() < today.getTime(),
      )
      .map((batch) => batch.index);

    const pourDates = batches.map((batch) => batch.readyDate.getTime());
    const emptyDates = batches.map((batch) => batch.emptiesDate.getTime());

    setPlan({
      count,
      firstPour: new Date(Math.min(...pourDates)),
      lastEmpties: new Date(Math.max(...emptyDates)),
      behindIndexes,
      batches,
    });
  }

  function handleExportCalendar() {
    if (!plan) {
      return;
    }

    // Skip beers already on tap — their brew is done, nothing to schedule.
    const schedules: CalendarSchedule[] = plan.batches
      .filter((batch) => batch.status !== "ontap")
      .map((batch) => {
        const stages: CalendarStage[] = [
          {
            name: batch.firstStageLabel,
            start: batch.startDate as Date,
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
          name: `${batch.name} (Pinter ${batch.index})`,
          style: batch.style || undefined,
          abv: batch.abv || undefined,
          timingMode: batch.timingMode,
          totalLeadTime: batch.totalLeadTime,
          stages,
        };
      });

    if (schedules.length === 0) {
      setDownloadMessage("Nothing to export yet — every beer is already on tap.");
      return;
    }

    downloadSchedules(schedules, "pinter-rotation");
    setDownloadMessage(
      `Calendar file with ${schedules.length} brew${schedules.length === 1 ? "" : "s"} downloaded. Open it to add the rotation to your calendar.`,
    );
  }

  const fieldClass =
    "w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30";
  const labelClass =
    "mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground";
  const onTapLabel = tapDurationMode === "days" ? "Days on tap" : "Pints / day";

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
            Line up a different beer in each of your Pinters. Mark what&rsquo;s
            already brewing or on tap, and we&rsquo;ll tell you what day to start
            the rest so a fresh one is always ready as the last runs dry.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Build your lineup
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
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
                  aria-invalid={countError ? true : undefined}
                  onChange={(event) => {
                    setPinterCount(event.target.value);
                    clearPlan();
                  }}
                  className={fieldClass}
                />
                {countError && <p className="mt-2 text-sm text-error">{countError}</p>}
              </div>

              <div>
                <span className={labelClass}>Measure &ldquo;on tap&rdquo; by</span>
                <div className="inline-flex w-full rounded-xl border border-border-strong bg-field p-0.5 text-xs font-semibold uppercase tracking-[0.12em]">
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
                      className={`flex-1 rounded-lg px-3 py-2.5 transition focus:outline-none focus:ring-2 focus:ring-accent ${
                        tapDurationMode === value
                          ? "bg-accent text-white"
                          : "text-muted hover:text-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tapDurationMode === "rate" && (
                  <p className="mt-2 text-xs leading-5 text-muted">
                    A Pinter holds about {PINTS_PER_PINTER} pints.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {Array.from({ length: rowCount }, (_, index) => {
                const slot = slotAt(index);
                const error = slotErrors[index];
                return (
                  <fieldset
                    key={index}
                    className="rounded-2xl border border-border-strong bg-field/40 p-4"
                  >
                    <legend className="px-1 font-display text-lg uppercase tracking-tight text-accent">
                      Pinter {index + 1}
                    </legend>

                    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                      <div>
                        <label
                          htmlFor={`beer-${index}-input`}
                          className={labelClass}
                        >
                          Beer
                        </label>
                        <BeerPicker
                          instanceId={`beer-${index}`}
                          brewPacks={activeBrewPacks}
                          value={slot.kind === "custom" ? CUSTOM_BEER : slot.brewPackId}
                          onChange={(value) => {
                            if (value === CUSTOM_BEER) {
                              updateSlot(index, { kind: "custom" });
                            } else {
                              updateSlot(index, { kind: "brewpack", brewPackId: value });
                            }
                          }}
                        />
                      </div>

                      <div className="sm:w-32">
                        <label htmlFor={`ontap-${index}`} className={labelClass}>
                          {onTapLabel}
                        </label>
                        <input
                          id={`ontap-${index}`}
                          type="number"
                          inputMode={tapDurationMode === "days" ? "numeric" : "decimal"}
                          min={tapDurationMode === "days" ? 2 : 0}
                          step={tapDurationMode === "days" ? 1 : "0.5"}
                          value={slot.onTap}
                          placeholder={tapDurationMode === "days" ? "6" : "2"}
                          onChange={(event) => updateSlot(index, { onTap: event.target.value })}
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    {slot.kind === "brewpack" ? (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={slot.useMinimum}
                            onChange={(event) =>
                              updateSlot(index, { useMinimum: event.target.checked })
                            }
                            className="h-4 w-4 accent-accent"
                          />
                          <span className="text-sm font-medium">Use minimum timing</span>
                        </label>
                        <div>
                          <label htmlFor={`crash-${index}`} className="sr-only">
                            Cold crash for Pinter {index + 1}
                          </label>
                          <select
                            id={`crash-${index}`}
                            value={slot.coldCrashDays}
                            onChange={(event) =>
                              updateSlot(index, { coldCrashDays: event.target.value })
                            }
                            className={fieldClass}
                          >
                            <option value="0">No cold crash</option>
                            <option value="1">1 day cold crash</option>
                            <option value="2">2 days cold crash</option>
                            <option value="3">3 days cold crash</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <input
                          type="text"
                          value={slot.customName}
                          autoComplete="off"
                          placeholder="Recipe name (optional)"
                          onChange={(event) =>
                            updateSlot(index, { customName: event.target.value })
                          }
                          className={fieldClass}
                          aria-label={`Recipe name for Pinter ${index + 1}`}
                        />
                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={slot.fermentationDays}
                            placeholder="Ferment"
                            aria-label={`Fermentation days for Pinter ${index + 1}`}
                            onChange={(event) =>
                              updateSlot(index, { fermentationDays: event.target.value })
                            }
                            className={fieldClass}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={slot.customColdCrashDays}
                            placeholder="Crash"
                            aria-label={`Cold-crash days for Pinter ${index + 1}`}
                            onChange={(event) =>
                              updateSlot(index, { customColdCrashDays: event.target.value })
                            }
                            className={fieldClass}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={slot.conditioningDays}
                            placeholder="Condition"
                            aria-label={`Conditioning days for Pinter ${index + 1}`}
                            onChange={(event) =>
                              updateSlot(index, { conditioningDays: event.target.value })
                            }
                            className={fieldClass}
                          />
                        </div>
                      </div>
                    )}

                    {/* Backfill: where this beer is right now */}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`status-${index}`} className={labelClass}>
                          Right now it&rsquo;s
                        </label>
                        <select
                          id={`status-${index}`}
                          value={slot.status}
                          onChange={(event) =>
                            updateSlot(index, { status: event.target.value as SlotStatus })
                          }
                          className={fieldClass}
                        >
                          <option value="new">Not started yet</option>
                          <option value="brewing">Already brewing</option>
                          <option value="ontap">Already on tap</option>
                        </select>
                      </div>

                      {slot.status !== "new" && (
                        <div className="min-w-0 max-w-full">
                          <label htmlFor={`status-date-${index}`} className={labelClass}>
                            {slot.status === "brewing" ? "Started brewing on" : "Empties on"}
                          </label>
                          <div className="tap-date-wrapper">
                            <input
                              id={`status-date-${index}`}
                              type="date"
                              value={slot.statusDate}
                              onChange={(event) =>
                                updateSlot(index, { statusDate: event.target.value })
                              }
                              className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {error && <p className="mt-3 text-sm text-error">{error}</p>}
                  </fieldset>
                );
              })}
            </div>

            {/* Anchor only matters when the first beer hasn't been started */}
            {firstRowIsNew && (
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
                        aria-label="First beer ready date"
                        aria-invalid={firstReadyError ? true : undefined}
                        onChange={(event) => {
                          setFirstReadyDate(event.target.value);
                          clearPlan();
                        }}
                        className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    {firstReadyError && (
                      <p className="mt-2 text-sm text-error">{firstReadyError}</p>
                    )}
                  </div>
                )}
              </fieldset>
            )}

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
                {plan.count}-beer rotation
              </p>
              <h2
                id="rotation-result-heading"
                className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl"
              >
                Pouring {formatShortDate(plan.firstPour)} through{" "}
                {formatShortDate(plan.lastEmpties)}
              </h2>
              <p className="mt-2 text-sm text-muted">
                Start each not-yet-brewed beer on its date below and a fresh one
                is always ready as the last runs dry.
              </p>
            </div>

            {plan.behindIndexes.length > 0 && (
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <p
                  role="status"
                  className="rounded-xl border border-stage-condition/40 bg-stage-condition-soft px-4 py-3 text-sm leading-6 text-foreground"
                >
                  <span className="font-bold">You&rsquo;re a little behind.</span>{" "}
                  Pinter {plan.behindIndexes.join(", ")} would need to have started
                  before today to pour in time. Start it as soon as you can (expect
                  a short gap), brew the minimum schedule, or shift a later beer.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    <th className="px-5 py-3 sm:px-6">Pinter</th>
                    <th className="px-3 py-3">Beer</th>
                    <th className="px-3 py-3 text-stage-brew">Start</th>
                    <th className="px-3 py-3 text-stage-tap">Ready</th>
                    <th className="px-3 py-3">On tap</th>
                    <th className="px-5 py-3 sm:px-6">Empties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.batches.map((batch) => (
                    <tr key={batch.index}>
                      <td className="px-5 py-3 font-display text-lg sm:px-6">
                        {batch.index}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium">{batch.name}</span>
                        {batch.status === "brewing" && (
                          <span className="ml-1 text-xs text-stage-brew">· brewing</span>
                        )}
                        {batch.status === "ontap" && (
                          <span className="ml-1 text-xs text-stage-tap">· on tap</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {batch.startDate === null ? (
                          <span className="text-muted">—</span>
                        ) : batch.status === "new" ? (
                          <span
                            className={`font-semibold ${
                              plan.behindIndexes.includes(batch.index)
                                ? "text-error"
                                : "text-stage-brew"
                            }`}
                          >
                            {formatShortDate(batch.startDate)}
                          </span>
                        ) : (
                          <span className="text-muted">
                            {formatShortDate(batch.startDate)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold text-stage-tap">
                        {formatShortDate(batch.readyDate)}
                      </td>
                      <td className="px-3 py-3 text-muted">{batch.daysOnTap}d</td>
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
                Add brews to calendar
              </button>
              <p className="mt-3 text-xs leading-5 text-muted">
                Downloads one calendar file with every not-yet-finished
                brew&rsquo;s stages — beers already on tap are left out.
              </p>
              <p aria-live="polite" className="mt-3 text-xs leading-5 text-stage-brew">
                {downloadMessage}
              </p>
            </div>
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Planning only. How long each lasts on tap is your own estimate — the
            rotation is only as accurate as it. Everything is calculated in your
            browser and nothing is stored.
          </p>
        </footer>
      </div>
    </main>
  );
}
