"use client";

// Welcome explainer for saved brews.
//
// Saving is the one thing Tap Planner stores, and browser storage is easy to
// lose, so the pop-up appears at the start of every visit until the person
// ticks "Don't show this again" on it. It says where to turn it back on, so
// opting out is never a dead end.
//
// "Every visit" means once per browser session, not on every page: the flag
// lives in sessionStorage, so moving between planners does not re-open it, but
// coming back later does. It uses the native <dialog> element, which gives a
// focus trap, Escape to close, and an inert page behind it for free.

import { useRef, useState } from "react";

import Link from "next/link";

import { setHideWelcome } from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

const SHOWN_KEY = "tap-planner:welcome-shown";

function shownThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    // No session storage: fall back to the in-memory flag below.
    return false;
  }
}

function markShownThisVisit() {
  try {
    window.sessionStorage.setItem(SHOWN_KEY, "1");
  } catch {
    // Ignored: the in-memory flag still stops it re-opening on navigation.
  }
}

export default function WelcomeDialog() {
  const { loaded, available, store } = useBrewStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const optOutRef = useRef<HTMLInputElement>(null);
  const [dismissed, setDismissed] = useState(false);

  // `loaded` is only true on the client after hydration, so reading
  // sessionStorage here never runs on the server. Stay quiet if the browser
  // will not let us save anything: there is nothing to explain.
  const shouldShow =
    loaded &&
    available &&
    !store.settings.hideWelcome &&
    !dismissed &&
    !shownThisVisit();

  // A ref callback rather than an effect: open the dialog the moment it mounts
  // visible. showModal() throws if it is already open, so guard it.
  function handleRef(dialog: HTMLDialogElement | null) {
    dialogRef.current = dialog;

    if (dialog && shouldShow && !dialog.open) {
      dialog.showModal();
    }
  }

  function handleClose() {
    markShownThisVisit();
    setDismissed(true);

    if (optOutRef.current?.checked) {
      setHideWelcome(true);
    }
  }

  if (!shouldShow) {
    return null;
  }

  return (
    <dialog
      ref={handleRef}
      aria-labelledby="welcome-heading"
      onClose={handleClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself, not its content.
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[28px] border border-border bg-surface p-0 text-foreground shadow-dropdown backdrop:bg-black/55 print:hidden"
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Before you start
        </p>

        <h2
          id="welcome-heading"
          className="mt-2 font-display text-3xl font-semibold uppercase leading-tight"
        >
          Your brews can be saved
        </h2>

        <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
          <p>
            Save a schedule and it is kept in{" "}
            <strong className="text-foreground">this browser on this device</strong>
            , so it is still here next time. It never goes to a server. There is
            no account and no cloud.
          </p>

          <p>
            That also means it can disappear. Clearing your browser data,
            switching phones or browsers, or using a private window will erase
            your saved brews.
          </p>

          <p>
            <strong className="text-foreground">Back up once in a while.</strong>{" "}
            Open <em>My brews</em> and tap <em>Back up</em>. You get a small file
            to keep in Files, Drive, or email. <em>Restore</em> loads it on any
            device.
          </p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input
            ref={optOutRef}
            type="checkbox"
            className="mt-1 h-4 w-4 accent-accent"
          />
          <span>
            Don&rsquo;t show this again
            <span className="block text-xs leading-5 text-muted">
              To see this message again, open <em>My brews</em>, go to{" "}
              <em>Back up &amp; restore</em>, and tick{" "}
              <em>Show the welcome note when I visit</em>.
            </span>
          </span>
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
          >
            Got it
          </button>

          <Link
            href="/brews#backup"
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl border border-border-strong bg-field px-5 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
          >
            Show me how to back up
          </Link>
        </div>
      </div>
    </dialog>
  );
}
