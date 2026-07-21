"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Image from "next/image";

import { brewPacks } from "@/data/brewpacks.generated";

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

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day, 12, 0, 0);
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);

  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);

  return result;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getTodayString(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function Home() {
  const pickerRef = useRef<HTMLDivElement>(null);

  const activeBrewPacks = useMemo(
    () =>
      brewPacks
        .filter((pack) => !pack.discontinued)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [brewPackId, setBrewPackId] = useState("");
  const [brewPackSearch, setBrewPackSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tapDate, setTapDate] = useState("");

  const [schedule, setSchedule] =
    useState<ScheduleType>("recommended");

  const [coldCrashDays, setColdCrashDays] =
    useState<ColdCrashDays>(0);

  const [result, setResult] =
    useState<CalculationResult | null>(null);

  const [error, setError] = useState("");

  const selectedPack = useMemo(
    () =>
      activeBrewPacks.find(
        (pack) => pack.id === brewPackId,
      ) ?? null,
    [activeBrewPacks, brewPackId],
  );

  const filteredBrewPacks = useMemo(() => {
    const search = brewPackSearch.trim().toLowerCase();

    if (!search) {
      return activeBrewPacks.slice(0, 8);
    }

    return activeBrewPacks
      .filter((pack) => {
        const searchableText =
          `${pack.name} ${pack.style}`.toLowerCase();

        return searchableText.includes(search);
      })
      .slice(0, 10);
  }, [activeBrewPacks, brewPackSearch]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setPickerOpen(false);

        if (selectedPack) {
          setBrewPackSearch(selectedPack.name);
        }
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );
    };
  }, [selectedPack]);

  function clearResult() {
    setResult(null);
    setError("");
  }

  function selectBrewPack(packId: string) {
    const pack = activeBrewPacks.find(
      (item) => item.id === packId,
    );

    if (!pack) {
      return;
    }

    setBrewPackId(pack.id);
    setBrewPackSearch(pack.name);
    setPickerOpen(false);
    clearResult();
  }

  function handleBrewPackSearch(value: string) {
    setBrewPackSearch(value);
    setPickerOpen(true);
    clearResult();

    if (selectedPack && value !== selectedPack.name) {
      setBrewPackId("");
    }
  }

  function clearBrewPack() {
    setBrewPackId("");
    setBrewPackSearch("");
    setPickerOpen(false);
    clearResult();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPack) {
      setResult(null);
      setError("Select a BrewPack from the search results.");
      setPickerOpen(true);
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

    const totalLeadTime =
      brewDays + coldCrashDays + conditioningDays;

    const calculatedBrewDate = subtractDays(
      selectedTapDate,
      totalLeadTime,
    );

    const coldCrashDate =
      coldCrashDays > 0
        ? addDays(calculatedBrewDate, brewDays)
        : null;

    const conditioningDate = addDays(
      calculatedBrewDate,
      brewDays + coldCrashDays,
    );

    setError("");

    setResult({
      packName: selectedPack.name,
      packStyle: selectedPack.style,
      abv: selectedPack.abv,
      brewDate: calculatedBrewDate,
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
            Pick the day you want to pour. We’ll work backward and
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
            <div ref={pickerRef} className="relative">
              <label
                htmlFor="brewpack-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                BrewPack
              </label>

              <div className="relative">
                <input
                  id="brewpack-search"
                  type="text"
                  value={brewPackSearch}
                  autoComplete="off"
                  placeholder="Search by name or style"
                  aria-expanded={pickerOpen}
                  aria-controls="brewpack-results"
                  onFocus={() => {
                    setPickerOpen(true);
                  }}
                  onChange={(event) =>
                    handleBrewPackSearch(event.target.value)
                  }
                  className="w-full rounded-xl border border-border-strong bg-field py-3 pl-3 pr-12 text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
                />

                {brewPackSearch && (
                  <button
                    type="button"
                    onClick={clearBrewPack}
                    aria-label="Clear selected BrewPack"
                    title="Clear BrewPack"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-xl leading-none text-muted transition hover:bg-accent-soft hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </div>

              <p className="mt-2 text-xs leading-5 text-muted">
                Try Dark Matter, stout, IPA, cider, or lager.
              </p>

              {pickerOpen && (
                <div
                  id="brewpack-results"
                  className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-dropdown"
                >
                  {filteredBrewPacks.length > 0 ? (
                    filteredBrewPacks.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() =>
                          selectBrewPack(pack.id)
                        }
                        className="grid w-full grid-cols-[1fr_auto] gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-background focus:bg-background focus:outline-none"
                      >
                        <span>
                          <span className="block font-medium">
                            {pack.name}
                          </span>

                          <span className="mt-1 block text-sm text-muted">
                            {pack.style}
                          </span>
                        </span>

                        <span className="self-center font-display text-lg text-accent">
                          {pack.abv}%
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-4 text-sm text-muted">
                      No active BrewPacks match your search.
                    </p>
                  )}
                </div>
              )}
            </div>

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

            <div className="min-w-0 max-w-full">
              <label
                htmlFor="tap-date"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
              >
                Desired tap date
              </label>

              <div className="w-full max-w-full overflow-hidden rounded-xl">
                <input
                  id="tap-date"
                  type="date"
                  min={getTodayString()}
                  value={tapDate}
                  onChange={(event) => {
                    setTapDate(event.target.value);
                    clearResult();
                  }}
                  className="tap-date-input block w-full min-w-0 max-w-full cursor-pointer rounded-xl border border-border-strong bg-field px-3 py-3 text-base text-foreground outline-none focus:border-accent"
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
                  className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none focus:border-accent"
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
          <section className="mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-result">
            <div className="grid gap-5 border-b border-border p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stage-brew">
                  Start brewing
                </p>

                <h2 className="mt-2 font-display text-3xl uppercase leading-tight sm:text-4xl">
                  {formatDate(result.brewDate)}
                </h2>

                <p className="mt-2 text-sm text-muted">
                  {result.packName} · {result.packStyle} · {result.abv}% ABV
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
