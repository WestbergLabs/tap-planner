"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { BrewPack } from "@/data/brewpacks.generated";

/** Sentinel value meaning "enter a custom recipe" rather than a BrewPack id. */
export const CUSTOM_BEER = "custom";

type BeerPickerProps = {
  /** Unique per instance so several pickers on one page don't share element ids. */
  instanceId: string;
  /** BrewPacks to search, already sorted for display. */
  brewPacks: BrewPack[];
  /** Current value: "" (none), a BrewPack id, or CUSTOM_BEER. */
  value: string;
  /** Called with "" / a BrewPack id / CUSTOM_BEER. */
  onChange: (value: string) => void;
  /** Marks the field invalid for assistive tech. */
  invalid?: boolean;
};

type Option = { value: string; label: string; sub: string };

/**
 * A compact searchable beer combobox for the rotation lineup. Unlike the shared
 * `BrewPackPicker`, it takes an `instanceId` (so many can live on one page) and
 * offers a "Custom recipe" option alongside the BrewPacks.
 */
export default function BeerPicker({
  instanceId,
  brewPacks,
  value,
  onChange,
  invalid,
}: BeerPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [lastValue, setLastValue] = useState(value);

  const selectedLabel = useMemo(() => {
    if (value === CUSTOM_BEER) {
      return "Custom recipe";
    }
    return brewPacks.find((pack) => pack.id === value)?.name ?? "";
  }, [value, brewPacks]);

  // When the selection changes from outside, drop any half-typed query so the
  // input shows the new selection rather than stale search text.
  if (value !== lastValue) {
    setLastValue(value);
    setQuery("");
  }

  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim().toLowerCase();

    const matches = trimmed
      ? brewPacks.filter((pack) =>
          `${pack.name} ${pack.style}`.toLowerCase().includes(trimmed),
        )
      : brewPacks;

    const list: Option[] = matches
      .slice(0, 8)
      .map((pack) => ({ value: pack.id, label: pack.name, sub: pack.style }));

    if (!trimmed || "custom recipe".includes(trimmed)) {
      list.push({
        value: CUSTOM_BEER,
        label: "Custom recipe",
        sub: "Enter your own timing",
      });
    }

    return list;
  }, [brewPacks, query]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((index) =>
        index <= 0 ? options.length - 1 : index - 1,
      );
    } else if (event.key === "Enter" && open && highlightedIndex >= 0) {
      const option = options[highlightedIndex];
      if (option) {
        event.preventDefault();
        selectOption(option.value);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={`${instanceId}-input`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${instanceId}-listbox`}
        aria-autocomplete="list"
        aria-invalid={invalid ? true : undefined}
        autoComplete="off"
        placeholder="Search beers…"
        value={open ? query : selectedLabel}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl border border-border-strong bg-field px-3 py-3 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      {open && (
        <div
          id={`${instanceId}-listbox`}
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-dropdown"
        >
          {options.length > 0 ? (
            options.map((option, index) => (
              <button
                key={option.value}
                id={`${instanceId}-option-${option.value}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(option.value)}
                className={`block w-full border-b border-border px-4 py-3 text-left last:border-b-0 focus:outline-none ${
                  index === highlightedIndex ? "bg-background" : "hover:bg-background"
                }`}
              >
                <span className="block font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.sub}</span>
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No beers match your search.</p>
          )}
        </div>
      )}
    </div>
  );
}
