"use client";

// First-visit explainer for saved brews.
//
// Saving is the one thing Tap Planner stores, and browser storage is easy to
// lose, so the first thing a new visitor sees is how it works and how to back
// it up. It uses the native <dialog> element, which gives a focus trap, Escape
// to close, and an inert page behind it for free.
//
// It appears once per browser. Any way of closing it counts as seen, and the
// "Show welcome note again" switch on /brews turns it back on.

import { useEffect, useRef } from "react";

import Link from "next/link";

import { setWelcomeSeen } from "@/lib/storage";
import { useBrewStore } from "@/lib/useBrewStore";

export default function WelcomeDialog() {
  const { loaded, available, store } = useBrewStore();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Wait for localStorage to be read, and stay quiet if the browser will not
  // let us save anything: there is nothing to explain.
  const shouldShow = loaded && available && !store.settings.welcomeSeen;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (shouldShow && !dialog.open) {
      dialog.showModal();
    } else if (!shouldShow && dialog.open) {
      dialog.close();
    }
  }, [shouldShow]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="welcome-heading"
      onClose={() => setWelcomeSeen(true)}
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
