"use client";

// "Save to My brews" for a planner result. Each planner builds NewBrew records
// from its own result and drops this in beside its calendar button. The
// multi-Pinter planner passes several at once.
//
// Whether a brew is already saved is derived from the store, not tracked in
// local state, so the button stays truthful across refreshes, other tabs, and
// deleting the brew from /brews.

import { useState } from "react";

import Link from "next/link";

import { findClashesWith } from "@/lib/brews";
import { addBrew, findDuplicate, getBackupStatus, type NewBrew } from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

export default function SaveBrewButton({ brews }: { brews: NewBrew[] }) {
  const { loaded, available, store } = useBrewStore();
  const [failed, setFailed] = useState(false);

  const unsaved = brews.filter((brew) => !findDuplicate(store.brews, brew));

  // Heads-up only: saving is never blocked, because the person may be about to
  // move the other brew.
  const clashNames = Array.from(
    new Set(unsaved.flatMap((brew) => findClashesWith(brew, store.brews).map((other) => other.name))),
  );

  if (loaded && !available) {
    return (
      <p className="text-xs leading-5 text-muted">
        Saving is switched off in this browser (private browsing or blocked
        site data). The calendar file still works.
      </p>
    );
  }

  if (unsaved.length === 0) {
    const status = getBackupStatus(store);

    return (
      <div aria-live="polite" className="space-y-1 text-xs leading-5">
        <p className="font-semibold text-stage-brew">
          {brews.length === 1 ? "Saved to My brews." : `All ${brews.length} brews saved to My brews.`}{" "}
          <Link
            href="/brews"
            className="underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            View
          </Link>
        </p>

        {status.needsBackup && (
          <p className="text-muted">
            Saved brews live only in this browser. Open{" "}
            <Link
              href="/brews#backup"
              className="underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              My brews
            </Link>{" "}
            to back them up.
          </p>
        )}
      </div>
    );
  }

  function handleSave() {
    // Every brew is attempted, so one refusal does not strand the rest.
    const results = unsaved.map((brew) => addBrew(brew));

    setFailed(results.some((saved) => saved === null));
  }

  const alreadySaved = brews.length - unsaved.length;

  const label =
    brews.length === 1
      ? "Save to My brews"
      : alreadySaved > 0
        ? `Save the other ${unsaved.length} to My brews`
        : `Save all ${brews.length} to My brews`;

  return (
    <div>
      <button
        type="button"
        disabled={!loaded}
        onClick={handleSave}
        className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {label}
      </button>

      {clashNames.length > 0 && (
        <p role="status" className="mt-3 text-xs leading-5 text-error">
          Heads up: this uses a Pinter that is already booked by{" "}
          {clashNames.join(", ")} on overlapping dates. You can still save it.
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-3 text-xs leading-5 text-error">
          Could not save. Your browser may be out of space or blocking site
          data.
        </p>
      )}
    </div>
  );
}
