"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Image from "next/image";

import BeerPicker, { CUSTOM_BEER } from "@/components/BeerPicker";
import PackThumb from "@/components/PackThumb";
import SiteNav from "@/components/SiteNav";
import PinterNotice from "@/components/PinterNotice";
import { brewPacks } from "@/data/brewpacks.generated";
import {
  addDays,
  calculateSchedule,
  formatShortDate,
  getToday,
  getTodayString,
  parseLocalDate,
  toDateInputValue,
} from "@/lib/schedule";
import {
  downloadSchedules,
  exclusiveEndDate,
  type CalendarSchedule,
  type CalendarStage,
} from "@/lib/calendar";

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
  // The day this Pinter's beer should be ready to pour.
  tapDate: string;
  // True while the date is the auto-filled earliest one, so a timing change
  // can move it; false once the user has picked a date themselves.
  tapDateAuto: boolean;
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
  tapDate: "",
  tapDateAuto: true,
};

type Batch = {
  index: number;
  name: string;
  style: string;
  abv: string;
  timingMode?: "Recommended" | "Minimum";
  firstStageLabel: "Start brewing" | "Start fermentation";
  totalLeadTime: number;
  startDate: Date;
  coldCrashDate: Date | null;
  conditioningDate: Date;
  readyDate: Date;
};

type ResolvedSlot = {
  name: string;
  style: string;
  abv: string;
  timingMode?: "Recommended" | "Minimum";
  firstStageLabel: "Start brewing" | "Start fermentation";
  brewDays: number;
  coldCrashDays: number;
  conditioningDays: number;
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
  const [slots, setSlots] = useState<Slot[]>([]);

  const [countError, setCountError] = useState("");
  const [formError, setFormError] = useState("");
  const [slotErrors, setSlotErrors] = useState<Record<number, string>>({});
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [downloadMessage, setDownloadMessage] = useState("");

  const count = Number(pinterCount);
  const validCount =
    pinterCount.trim() !== "" &&
    Number.isInteger(count) &&
    count >= MIN_PINTERS &&
    count <= MAX_PINTERS;
  const rowCount = validCount ? count : 0;

  useEffect(() => {
    if (!batches) {
      return;
    }
    requestAnimationFrame(() => {
      resultRef.current?.focus();
    });
  }, [batches]);

  function clearPlan() {
    setBatches(null);
    setDownloadMessage("");
  }

  function slotAt(index: number): Slot {
    return slots[index] ?? DEFAULT_SLOT;
  }

  // Soonest day this beer can be ready if brewing starts today: the full
  // lead time, including a day per cold-crash day. Empty until the beer's
  // timing is known.
  function earliestReady(slot: Slot): string {
    const item = resolveSlot(slot);
    if ("error" in item) {
      return "";
    }
    return toDateInputValue(
      addDays(getToday(), item.brewDays + item.coldCrashDays + item.conditioningDays),
    );
  }

  // Whenever the beer or its timing changes, refill an auto-filled ready date
  // with the earliest workable one, and push a picked date that is now too
  // soon forward.
  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((current) => {
      const next = current.slice();
      while (next.length <= index) {
        next.push(DEFAULT_SLOT);
      }
      const merged = { ...(next[index] ?? DEFAULT_SLOT), ...patch };
      if ("tapDate" in patch) {
        merged.tapDateAuto = false;
      } else {
        const earliest = earliestReady(merged);
        if (
          earliest &&
          (merged.tapDateAuto || !merged.tapDate || merged.tapDate < earliest)
        ) {
          merged.tapDate = earliest;
        }
      }
      next[index] = merged;
      return next;
    });
    clearPlan();
  }

  function resolveSlot(slot: Slot): ResolvedSlot | { error: string } {
    if (slot.kind === "brewpack") {
      const pack = activeBrewPacks.find((candidate) => candidate.id === slot.brewPackId);
      if (!pack) {
        return { error: "Choose a beer for this Pinter." };
      }
      return {
        name: pack.name,
        style: pack.style,
        abv: String(pack.abv),
        timingMode: slot.useMinimum ? "Minimum" : "Recommended",
        firstStageLabel: "Start brewing",
        brewDays: slot.useMinimum ? pack.minimumBrewDays : pack.recommendedBrewDays,
        coldCrashDays: Number(slot.coldCrashDays) || 0,
        conditioningDays: slot.useMinimum
          ? pack.minimumConditioningDays
          : pack.recommendedConditioningDays,
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
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCountError("");
    setFormError("");
    setSlotErrors({});

    if (!validCount) {
      setCountError(`Enter a whole number from ${MIN_PINTERS} to ${MAX_PINTERS}.`);
      setBatches(null);
      return;
    }

    const next: Batch[] = [];
    const nextErrors: Record<number, string> = {};

    for (let index = 0; index < count; index += 1) {
      const slot = slotAt(index);

      // A Pinter with no beer and no date is simply left out of the plan.
      if (slot.kind === "brewpack" && !slot.brewPackId && !slot.tapDate) {
        continue;
      }

      const item = resolveSlot(slot);
      if ("error" in item) {
        nextErrors[index] = item.error;
        continue;
      }
      if (!slot.tapDate) {
        nextErrors[index] = "Choose the date this beer should be ready.";
        continue;
      }

      const readyDate = parseLocalDate(slot.tapDate);
      const stages = calculateSchedule(readyDate, {
        fermentationDays: item.brewDays,
        coldCrashDays: item.coldCrashDays,
        conditioningDays: item.conditioningDays,
      });

      next.push({
        index: index + 1,
        name: item.name,
        style: item.style,
        abv: item.abv,
        timingMode: item.timingMode,
        firstStageLabel: item.firstStageLabel,
        totalLeadTime: stages.totalLeadTime,
        startDate: stages.fermentationDate,
        coldCrashDate: stages.coldCrashDate,
        conditioningDate: stages.conditioningDate,
        readyDate,
      });
    }

    if (Object.keys(nextErrors).length > 0) {
      setSlotErrors(nextErrors);
      setBatches(null);
      return;
    }
    if (next.length === 0) {
      setFormError("Pick a beer and a ready date for at least one Pinter.");
      setBatches(null);
      return;
    }

    setBatches(next);
  }

  const today = getToday();
  const isBehind = (batch: Batch) => batch.startDate.getTime() < today.getTime();
  const behind = batches?.filter(isBehind) ?? [];

  function handleExportCalendar() {
    if (!batches) {
      return;
    }

    const schedules: CalendarSchedule[] = batches.map((batch) => {
      const stages: CalendarStage[] = [
        {
          name: batch.firstStageLabel,
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
        name: `${batch.name} (Pinter ${batch.index})`,
        style: batch.style || undefined,
        abv: batch.abv || undefined,
        timingMode: batch.timingMode,
        totalLeadTime: batch.totalLeadTime,
        stages,
      };
    });

    downloadSchedules(schedules, "pinter-brews");
    setDownloadMessage(
      `Calendar file with ${schedules.length} brew${schedules.length === 1 ? "" : "s"} downloaded. Open it to add them to your calendar.`,
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
          <div className="relative z-30 mb-6">
            <div className="relative min-h-[180px] overflow-hidden rounded-[28px] border border-border bg-foreground shadow-hero">
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
            <div className="absolute inset-x-0 top-0 flex justify-end p-5 sm:p-6">
              <SiteNav current="/rotation" />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Several Pinters at once
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight sm:text-6xl">
            Multi-Pinter Planner
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Give each Pinter a beer and the day you want it ready. We&rsquo;ll
            work out every start date, and you can add them all to your calendar
            in one go.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Build your lineup
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6 p-5 sm:p-6">
            <div className="sm:w-1/2">
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
                      <div className="flex items-end gap-3">
                        <PackThumb
                          packId={
                            slot.kind === "brewpack" ? slot.brewPackId : null
                          }
                          style={
                            activeBrewPacks.find(
                              (pack) =>
                                slot.kind === "brewpack" &&
                                pack.id === slot.brewPackId,
                            )?.style ?? ""
                          }
                          size={48}
                          className="mb-1"
                        />

                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`beer-${index}-input`}
                            className={labelClass}
                          >
                            Beer
                          </label>
                          <BeerPicker
                            instanceId={`beer-${index}`}
                            brewPacks={activeBrewPacks}
                            value={
                              slot.kind === "custom"
                                ? CUSTOM_BEER
                                : slot.brewPackId
                            }
                            onChange={(value) => {
                              if (value === CUSTOM_BEER) {
                                updateSlot(index, { kind: "custom" });
                              } else {
                                updateSlot(index, {
                                  kind: "brewpack",
                                  brewPackId: value,
                                });
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 max-w-full">
                        <label htmlFor={`tap-date-${index}`} className={labelClass}>
                          Ready on
                        </label>
                        <div className="tap-date-wrapper">
                          <input
                            id={`tap-date-${index}`}
                            type="date"
                            min={earliestReady(slot) || getTodayString()}
                            value={slot.tapDate}
                            onChange={(event) =>
                              updateSlot(index, { tapDate: event.target.value })
                            }
                            className="tap-date-input cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                          />
                        </div>
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

                    {error && <p className="mt-3 text-sm text-error">{error}</p>}
                  </fieldset>
                );
              })}
            </div>

            <p className="-mt-2 text-xs leading-5 text-muted">
              Leave a Pinter empty to skip it.
            </p>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm text-error"
              >
                {formError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Calculate start dates
            </button>
          </form>
        </section>

        {batches && (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            aria-labelledby="rotation-result-heading"
            className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-result outline-none focus:ring-2 focus:ring-accent/30"
          >
            <div className="border-b border-border p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                {batches.length} brew{batches.length === 1 ? "" : "s"}
              </p>
              <h2
                id="rotation-result-heading"
                className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl"
              >
                Your start dates
              </h2>
            </div>

            {behind.length > 0 && (
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <p
                  role="status"
                  className="rounded-xl border border-stage-condition/40 bg-stage-condition-soft px-4 py-3 text-sm leading-6 text-foreground"
                >
                  <span className="font-bold">Not enough time.</span>{" "}
                  Pinter {behind.map((batch) => batch.index).join(", ")} would need
                  to have started before today. Pick a later ready date or use
                  minimum timing.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    <th className="px-5 py-3 sm:px-6">Pinter</th>
                    <th className="px-3 py-3">Beer</th>
                    <th className="px-3 py-3 text-stage-brew">Start</th>
                    <th className="px-5 py-3 text-stage-tap sm:px-6">Ready</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((batch) => (
                    <tr key={batch.index}>
                      <td className="px-5 py-3 font-display text-lg sm:px-6">
                        {batch.index}
                      </td>
                      <td className="px-3 py-3 font-medium">{batch.name}</td>
                      <td
                        className={`px-3 py-3 font-semibold ${
                          isBehind(batch) ? "text-error" : "text-stage-brew"
                        }`}
                      >
                        {formatShortDate(batch.startDate)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-stage-tap sm:px-6">
                        {formatShortDate(batch.readyDate)}
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
                Downloads one calendar file with every brew&rsquo;s stages for
                Apple Calendar, Google Calendar, Outlook, and most calendar apps.
              </p>
              <p aria-live="polite" className="mt-3 text-xs leading-5 text-stage-brew">
                {downloadMessage}
              </p>
            </div>
          </section>
        )}

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-muted">
          <p>
            Planning only. Everything is calculated in your browser and nothing
            is stored.
          </p>

          <PinterNotice />
        </footer>
      </div>
    </main>
  );
}
