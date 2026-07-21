"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { brewPacks } from "@/data/brewpacks";

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
    useState<ColdCrashDays>(1);

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
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
            Plan your first pour
          </p>

          <h1 className="text-4xl font-bold tracking-tight">
            Tap Planner
          </h1>

          <p className="mt-3 text-slate-300">
            Choose a BrewPack and tap date. We’ll tell you when to
            start.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div ref={pickerRef} className="relative">
              <label
                htmlFor="brewpack-search"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                BrewPack
              </label>

              <input
                id="brewpack-search"
                type="text"
                value={brewPackSearch}
                autoComplete="off"
                placeholder="Search by BrewPack name or style"
                aria-expanded={pickerOpen}
                aria-controls="brewpack-results"
                onFocus={() => {
                  setPickerOpen(true);
                }}
                onChange={(event) =>
                  handleBrewPackSearch(event.target.value)
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none placeholder:text-slate-600 focus:border-amber-400"
              />

              <p className="mt-2 text-xs text-slate-500">
                Try a name or style such as Dark Matter, stout, IPA,
                cider, or lager.
              </p>

              {pickerOpen && (
                <div
                  id="brewpack-results"
                  className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
                >
                  {filteredBrewPacks.length > 0 ? (
                    filteredBrewPacks.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() =>
                          selectBrewPack(pack.id)
                        }
                        className="block w-full border-b border-slate-800 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                      >
                        <span className="block font-medium text-white">
                          {pack.name}
                        </span>

                        <span className="mt-1 block text-sm text-slate-400">
                          {pack.style} · {pack.abv}% ABV
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-4 text-sm text-slate-400">
                      No active BrewPacks match your search.
                    </p>
                  )}
                </div>
              )}
            </div>

            {selectedPack && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">
                    {selectedPack.style}
                  </p>

                  <p className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                    {selectedPack.abv}% ABV
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Recommended
                    </p>

                    <p className="mt-1 text-slate-300">
                      {selectedPack.recommendedBrewDays} brew +{" "}
                      {selectedPack.recommendedConditioningDays} condition
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Minimum
                    </p>

                    <p className="mt-1 text-slate-300">
                      {selectedPack.minimumBrewDays} brew +{" "}
                      {selectedPack.minimumConditioningDays} condition
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="tap-date"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Desired tap date
              </label>

              <input
                id="tap-date"
                type="date"
                min={getTodayString()}
                value={tapDate}
                onChange={(event) => {
                  setTapDate(event.target.value);
                  clearResult();
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none [color-scheme:dark] focus:border-amber-400"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="schedule"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Schedule
                </label>

                <select
                  id="schedule"
                  value={schedule}
                  onChange={(event) => {
                    setSchedule(
                      event.target.value as ScheduleType,
                    );
                    clearResult();
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-amber-400"
                >
                  <option value="recommended">
                    Recommended
                  </option>

                  <option value="minimum">
                    Minimum
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="cold-crash"
                  className="mb-2 block text-sm font-medium text-slate-200"
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-amber-400"
                >
                  <option value={0}>None</option>
                  <option value={1}>1 day</option>
                  <option value={2}>2 days</option>
                  <option value={3}>3 days</option>
                </select>
              </div>
            </div>

            <p className="-mt-2 text-xs text-slate-500">
              Cold crashing is added between brewing and conditioning.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              Calculate start date
            </button>
          </form>
        </section>

        {result && (
          <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
                Start brewing
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                {formatDate(result.brewDate)}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {result.totalLeadTime}-day {result.schedule} plan
              </p>

              <p className="mt-1 text-sm text-slate-300">
                {result.packName} · {result.packStyle} · {result.abv}% ABV
              </p>
            </div>

            <div className="mt-6 space-y-5 border-t border-amber-400/20 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Start brewing
                  </p>

                  <p className="mt-1 font-medium">
                    {formatDate(result.brewDate)}
                  </p>
                </div>

                <p className="text-sm text-slate-400">
                  {result.brewDays} days
                </p>
              </div>

              {result.coldCrashDate && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Begin cold crash
                    </p>

                    <p className="mt-1 font-medium">
                      {formatDate(result.coldCrashDate)}
                    </p>
                  </div>

                  <p className="text-sm text-slate-400">
                    {result.coldCrashDays} day
                    {result.coldCrashDays === 1 ? "" : "s"}
                  </p>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Begin conditioning
                  </p>

                  <p className="mt-1 font-medium">
                    {formatDate(result.conditioningDate)}
                  </p>
                </div>

                <p className="text-sm text-slate-400">
                  {result.conditioningDays} days
                </p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tap day
                  </p>

                  <p className="mt-1 font-medium">
                    {formatDate(result.tapDate)}
                  </p>
                </div>

                <p className="text-sm font-medium text-amber-300">
                  Ready
                </p>
              </div>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Planning only. Follow the official Pinter app for brewing
          instructions and active brew guidance.
        </p>
      </div>
    </main>
  );
}