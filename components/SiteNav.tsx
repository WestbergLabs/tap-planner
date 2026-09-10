"use client";

// Shared navigation for every planner page. Sits over the hero image, so it
// works against the dark photo on all pages without each page owning its own
// nav markup.
//
// Responsive by design: a visible bar of every route from `sm` up, and a
// hamburger menu below that, where five pills would wrap. The bar exists
// because hiding four of five routes behind a menu costs discovery, not just
// a click -- people never find pages they do not know are there.
//
// Menu behavior follows the same accessibility rules as BrewPackPicker: the
// button reports its expanded state, Escape closes and returns focus, a click
// outside dismisses, and the panel is reachable by keyboard in DOM order.

import { useEffect, useId, useRef, useState } from "react";

import Link from "next/link";

/** GitHub issue tracker, used by the help link and by inline "tell us" prompts. */
export const ISSUES_URL = "https://github.com/WestbergLabs/tap-planner/issues/new";

type NavLink = {
  href: string;
  /** Full name, used in the mobile menu. */
  label: string;
  /**
   * Compact name for the desktop bar. Five full labels are wider than the
   * 672px page column; these fit with room to spare.
   */
  short: string;
  description: string;
};

const LINKS: NavLink[] = [
  {
    href: "/",
    short: "Plan",
    label: "BrewPack planner",
    description: "Pick a pack and a tap date",
  },
  {
    href: "/custom",
    short: "Custom",
    label: "Custom planner",
    description: "Your own recipe or timing",
  },
  {
    href: "/rotation",
    short: "Rotation",
    label: "Rotation planner",
    description: "Stagger several Pinters",
  },
  {
    href: "/releases",
    short: "Releases",
    label: "Release timeline",
    description: "When each pack appeared",
  },
  {
    href: "/labels",
    short: "Labels",
    label: "Brew labels",
    description: "Print a 4×6 fridge card",
  },
];

export default function SiteNav({
  /** Route of the page rendering this nav, used to mark the current item. */
  current,
}: {
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on Escape (returning focus to the button) and on any click outside.
  // Both listeners are only attached while the menu is open.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    // Full width so the bar can centre itself over the hero regardless of how
    // a page positions this component. The hamburger stays right-aligned on
    // mobile, where a centred button reads as a stray control.
    <div
      ref={containerRef}
      className="relative flex w-full justify-end sm:justify-center"
    >
      {/* Desktop: every page visible at once. A hamburger hides four of five
          routes behind a click plus the knowledge that the click exists, which
          is too much to ask of features people do not know are there. Below
          `sm` the bar would wrap, so the menu takes over. */}
      <nav
        aria-label="Site"
        className="hidden rounded-full bg-black/35 p-1 backdrop-blur sm:flex sm:items-center sm:gap-0.5"
      >
        {LINKS.map((link) => {
          const isCurrent = link.href === current;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent ? "page" : undefined}
              title={link.description}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/40 ${
                isCurrent
                  ? "bg-surface text-foreground"
                  : "text-white/90 hover:bg-black/45 hover:text-white"
              }`}
            >
              {link.short}
            </Link>
          );
        })}

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/25" />

        <a
          href={ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/90 transition hover:bg-black/45 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/40"
        >
          Help
          <span aria-hidden="true"> &#8599;</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </nav>

      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/40 sm:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[2px] w-4 rounded-full bg-current" />
          <span className="block h-[2px] w-4 rounded-full bg-current" />
          <span className="block h-[2px] w-4 rounded-full bg-current" />
        </span>
        Menu
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-dropdown sm:hidden"
        >
          <nav aria-label="Site menu">
            <ul className="p-2">
              {LINKS.map((link) => {
                const isCurrent = link.href === current;

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={isCurrent ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3 py-2.5 transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
                        isCurrent
                          ? "bg-accent-soft"
                          : "hover:bg-field focus:bg-field"
                      }`}
                    >
                      <span
                        className={`block text-sm font-semibold ${
                          isCurrent ? "text-accent" : "text-foreground"
                        }`}
                      >
                        {link.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">
                        {link.description}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border p-2">
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 transition hover:bg-field focus:bg-field focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
              >
                <span className="block text-sm font-semibold text-foreground">
                  Help &amp; feedback
                  <span aria-hidden="true"> &#8599;</span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  Report a problem or a wrong date on GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </span>
              </a>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
