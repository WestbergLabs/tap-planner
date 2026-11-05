"use client";

// A slim strip, shown on every page, when saved brews have not been backed up.
// It carries a working Back up button so exporting is one tap from anywhere,
// not a trip to another page. It stays out of the way on /brews, which has the
// full backup panel, and it never prints.

import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { downloadBackup, getBackupStatus } from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

export default function BackupReminder() {
  const pathname = usePathname();
  const { loaded, available, store } = useBrewStore();
  const [savedName, setSavedName] = useState<string | null>(null);

  if (!loaded || !available || pathname === "/brews") {
    return null;
  }

  const status = getBackupStatus(store);

  if (savedName) {
    return (
      <div
        role="status"
        className="border-b border-stage-brew/30 bg-stage-brew-soft px-4 py-3 text-center text-sm text-foreground print:hidden"
      >
        Backup downloaded as <strong>{savedName}</strong>. Keep it somewhere safe,
        like Files or a cloud drive.{" "}
        <button
          type="button"
          onClick={() => setSavedName(null)}
          className="font-semibold underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!status.needsBackup) {
    return null;
  }

  const count = store.brews.length;

  return (
    <div
      role="region"
      aria-label="Backup reminder"
      className="border-b border-accent/30 bg-accent-soft px-4 py-3 text-sm text-foreground print:hidden"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-6">
          <strong>
            {count} saved brew{count === 1 ? "" : "s"}, not backed up.
          </strong>{" "}
          {status.reason}
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSavedName(downloadBackup())}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-accent-soft"
          >
            Back up now
          </button>

          <Link
            href="/brews#backup"
            className="text-xs font-semibold uppercase tracking-[0.14em] underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            More options
          </Link>
        </div>
      </div>
    </div>
  );
}
