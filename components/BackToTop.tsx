"use client";

// Back-to-top control, mounted once in the root layout so every page gets it.
//
// The pages are long -- the release timeline runs to 39 cards and /labels has
// the whole paper guide under the preview -- and there was no way back up
// short of flicking.
//
// Hidden until you have actually scrolled, so it never sits over a short page,
// and hidden in print so it cannot land on a label.

import { useEffect, useState } from "react";

/** How far down before the button is worth showing. */
const REVEAL_AFTER = 600;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > REVEAL_AFTER);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toTop() {
    // Respect a reduced-motion preference: a long smooth scroll is exactly the
    // kind of movement that setting exists to avoid.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      // `hidden` would remove it from the tab order abruptly; fading and
      // disabling keeps the transition and keeps it unreachable while hidden.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-accent-hover/30 bg-accent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-card transition-all duration-200 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background print:hidden sm:bottom-6 sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Deliberately blunt: at 20px a drawn foam wave and a thin outline
            collapse into a blob. A solid foam cap, one tapered glass outline
            and a bold chevron are the most that survives at this size. */}
        <rect x="6.1" y="4.4" width="11.8" height="3.2" rx="1.6" fill="currentColor" />
        <path
          d="M7.3 7.2h9.4l-1.6 11.8a2 2 0 0 1-2 1.8h-2.2a2 2 0 0 1-2-1.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9.6 15.8 12 13.2l2.4 2.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <span className="hidden sm:inline">Top up</span>
    </button>
  );
}
