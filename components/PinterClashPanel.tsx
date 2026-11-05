"use client";

// Warning on /brews when two saved brews need the same Pinter at the same time.
// Derived from the saved dates on every render (see findPinterClashes), so it
// clears itself the moment a brew is deleted or tasted.

import { findPinterClashes } from "@/lib/brews";
import { formatShortDate, parseLocalDate } from "@/lib/schedule";
import type { SavedBrew } from "@/lib/storage";

function range(brew: SavedBrew): string {
  return `${formatShortDate(parseLocalDate(brew.brewDate))} to ${formatShortDate(
    parseLocalDate(brew.tapDate),
  )}`;
}

export default function PinterClashPanel({ brews }: { brews: SavedBrew[] }) {
  const clashes = findPinterClashes(brews);

  if (clashes.length === 0) {
    return null;
  }

  return (
    <section
      role="alert"
      aria-labelledby="clash-heading"
      className="mt-6 rounded-[28px] border border-error-border bg-error-bg p-5 text-sm leading-6 text-error shadow-card sm:p-6"
    >
      <h2 id="clash-heading" className="font-bold">
        {clashes.length === 1
          ? "One Pinter is booked twice"
          : `${clashes.length} Pinter clashes`}
      </h2>

      <ul className="mt-3 space-y-3">
        {clashes.map((clash) => (
          <li key={`${clash.first.id}-${clash.second.id}`}>
            <p className="font-semibold">Pinter {clash.pinter}</p>
            <p>
              {clash.first.name} ({range(clash.first)}) overlaps{" "}
              {clash.second.name} ({range(clash.second)}).
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs">
        A Pinter is counted as busy from brew day to tap day. Delete one of
        the two and plan it again on another Pinter or date.
      </p>
    </section>
  );
}
