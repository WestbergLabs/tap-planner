"use client";

// Shared navigation for every planner page. Renders as a hamburger button that
// sits over the hero image, so it works against the dark photo on all pages
// without each page owning its own nav markup.
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
  label: string;
  description: string;
};

const LINKS: NavLink[] = [
  {
    href: "/",
    label: "BrewPack planner",
    description: "Pick a pack and a tap date",
  },
  {
    href: "/custom",
    label: "Custom planner",
    description: "Your own recipe or timing",
  },
  {
    href: "/rotation",
    label: "Rotation planner",
    description: "Stagger several Pinters",
  },
  {
    href: "/releases",
    label: "Release timeline",
    description: "When each pack appeared",
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
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/40"
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
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-dropdown"
        >
          <nav aria-label="Site">
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
