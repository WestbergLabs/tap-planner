"use client";

// The backup section of /brews: export, restore, and the settings that go with
// them. This is where the "how do I not lose my brews" answer lives, so the
// copy is plain and the buttons say exactly what they do.

import { useRef, useState } from "react";

import { downloadSchedules } from "@/lib/calendar";
import { toCalendarSchedule } from "@/lib/brews";
import {
  clearBrews,
  downloadBackup,
  getBackupStatus,
  parseBackup,
  restoreBrews,
  setHideWelcome,
  type SavedBrew,
} from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

type Pending = { brews: SavedBrew[]; exportedAt: string };

const primaryButton =
  "rounded-xl bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "rounded-xl border border-border-strong bg-field px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

function formatWhen(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "an unknown date";
  }

  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export default function BackupPanel({ today }: { today: string }) {
  const { available, store } = useBrewStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const count = store.brews.length;
  const status = getBackupStatus(store);
  const lastExport = store.settings.lastExportedAt;

  function handleBackup() {
    setError("");

    const fileName = downloadBackup();

    setMessage(
      fileName
        ? `Downloaded ${fileName}. Keep it somewhere safe, like Files, a cloud drive, or an email to yourself.`
        : "",
    );

    if (!fileName) {
      setError("Backup is not available in this browser.");
    }
  }

  async function handleFile(file: File | undefined) {
    setMessage("");
    setError("");
    setPending(null);

    if (!file) {
      return;
    }

    // A backup of 2000 brews is well under 2MB. Refuse anything wildly larger
    // before reading it into memory.
    if (file.size > 5_000_000) {
      setError("That file is too large to be a Tap Planner backup.");
      return;
    }

    const result = parseBackup(await file.text());

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPending({ brews: result.brews, exportedAt: result.exportedAt });
  }

  function applyRestore(mode: "merge" | "replace") {
    if (!pending) {
      return;
    }

    const ok = restoreBrews(pending.brews, mode);

    if (ok) {
      setMessage(
        `Restored ${pending.brews.length} brew${pending.brews.length === 1 ? "" : "s"} from your backup.`,
      );
      setError("");
    } else {
      setError("Could not restore. Your browser may be out of space or blocking site data.");
    }

    setPending(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleCalendar() {
    // Brews already tasted are history, not something to put on a calendar.
    const upcoming = store.brews.filter((brew) => !brew.tasting && brew.tapDate >= today);

    if (upcoming.length === 0) {
      setError("No upcoming brews to put on a calendar.");
      return;
    }

    setError("");
    downloadSchedules(upcoming.map(toCalendarSchedule), "tap-planner-brews");
    setMessage(
      `Calendar file with ${upcoming.length} upcoming brew${upcoming.length === 1 ? "" : "s"} downloaded.`,
    );
  }

  return (
    <section
      id="backup"
      aria-labelledby="backup-heading"
      className="mt-6 scroll-mt-6 overflow-hidden rounded-[28px] border border-border bg-surface shadow-card"
    >
      <div className="rounded-t-[28px] border-b border-border px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Back up &amp; restore
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="space-y-3 text-sm leading-6 text-muted">
          <p>
            <strong className="text-foreground">
              Your brews are saved only in this browser, on this device.
            </strong>{" "}
            Nothing is sent anywhere. If you clear your browser data, use a
            private window, or switch to another phone or browser, they will not
            be there.
          </p>
          <p>
            A backup is a small file you keep yourself. Download one now and
            then, and use Restore to put it back on any device.
          </p>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
            status.needsBackup
              ? "border-accent/40 bg-accent-soft text-foreground"
              : "border-border bg-field text-foreground"
          }`}
        >
          <p className="font-semibold">
            {lastExport ? `Last backup: ${formatWhen(lastExport)}` : "Never backed up"}
          </p>
          <p className="text-muted">
            {count === 0
              ? "No saved brews yet."
              : status.needsBackup
                ? status.reason
                : `${count} saved brew${count === 1 ? "" : "s"}, backed up.`}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={handleBackup}
            disabled={!available || count === 0}
            className={primaryButton}
          >
            Back up my brews
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!available}
            className={secondaryButton}
          >
            Restore from backup
          </button>

          <button
            type="button"
            onClick={handleCalendar}
            disabled={!available || count === 0}
            className={secondaryButton}
          >
            Calendar file, all upcoming
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a Tap Planner backup file"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>

        {pending && (
          <div
            role="group"
            aria-label="Confirm restore"
            className="space-y-3 rounded-xl border border-border-strong bg-field px-4 py-4 text-sm leading-6"
          >
            <p>
              <strong>
                Found {pending.brews.length} brew{pending.brews.length === 1 ? "" : "s"}
              </strong>{" "}
              in a backup made on {formatWhen(pending.exportedAt)}. You have {count} saved
              now. What should happen?
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => applyRestore("merge")} className={primaryButton}>
                Add to my brews
              </button>
              <button type="button" onClick={() => applyRestore("replace")} className={secondaryButton}>
                Replace everything
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);

                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="text-xs font-semibold uppercase tracking-[0.14em] underline underline-offset-2"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-muted">
              Add keeps what you have and lets the file win if the same brew is in
              both. Replace discards your current saved brews first.
            </p>
          </div>
        )}

        <div aria-live="polite">
          {message && <p className="text-sm text-stage-brew">{message}</p>}
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-4 border-t border-border pt-5 text-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!store.settings.hideWelcome}
              onChange={(event) => setHideWelcome(!event.target.checked)}
              className="mt-1 h-4 w-4 accent-accent"
            />
            <span>
              Show the welcome note when I visit
              <span className="block text-xs leading-5 text-muted">
                The pop-up that explains saving and backups. It appears on each
                visit until you tick &ldquo;Don&rsquo;t show this again&rdquo; on
                it. Tick this box to bring it back.
              </span>
            </span>
          </label>

          {count > 0 &&
            (confirmingClear ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-error">
                  Delete all {count} saved brews? This cannot be undone
                  {lastExport ? "" : " and you have no backup"}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearBrews();
                    setConfirmingClear(false);
                    setMessage("All saved brews deleted.");
                  }}
                  className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-error focus:outline-none focus:ring-2 focus:ring-error"
                >
                  Delete all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="text-xs font-semibold uppercase tracking-[0.14em] underline underline-offset-2"
                >
                  Keep them
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="text-xs font-semibold uppercase tracking-[0.14em] text-muted underline underline-offset-2 hover:text-error focus:outline-none focus:ring-2 focus:ring-accent"
              >
                Delete all saved brews
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
