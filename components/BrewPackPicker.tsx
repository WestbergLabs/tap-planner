"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { BrewPack } from "@/data/brewpacks.generated";

type BrewPackPickerProps = {
  /** Active BrewPacks to search, already sorted for display. */
  brewPacks: BrewPack[];
  /** Currently selected BrewPack id, or "" when none is selected. */
  selectedId: string;
  /** Called when the user picks a BrewPack from the results. */
  onSelect: (pack: BrewPack) => void;
  /** Called when the selection is cleared or invalidated by editing. */
  onClear: () => void;
  /** Called on any edit to the search field (e.g. to clear a stale result). */
  onEdit?: () => void;
  /** Helper text shown under the field. */
  hint?: string;
};

/**
 * Accessible BrewPack search combobox shared by the official planner (`/`) and
 * the custom planner (`/custom`). The parent owns the selected id; this
 * component owns the search text, open state, and keyboard navigation.
 */
export default function BrewPackPicker({
  brewPacks,
  selectedId,
  onSelect,
  onClear,
  onEdit,
  hint,
}: BrewPackPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [lastSelectedId, setLastSelectedId] = useState(selectedId);

  const selectedPack = useMemo(
    () => brewPacks.find((pack) => pack.id === selectedId) ?? null,
    [brewPacks, selectedId],
  );

  // Reflect an externally applied selection (e.g. prefill) in the input by
  // adjusting state during render when the selected id changes — avoids a
  // synchronous setState in an effect. When the selection is cleared we leave
  // whatever the user has typed in place.
  if (selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId);

    if (selectedPack) {
      setSearch(selectedPack.name);
    }
  }

  const filteredBrewPacks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return brewPacks.slice(0, 8);
    }

    return brewPacks
      .filter((pack) =>
        `${pack.name} ${pack.style}`.toLowerCase().includes(query),
      )
      .slice(0, 10);
  }, [brewPacks, search]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);

        if (selectedPack) {
          setSearch(selectedPack.name);
        }
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [selectedPack]);

  function handleSelect(pack: BrewPack) {
    setSearch(pack.name);
    setOpen(false);
    setHighlightedIndex(-1);
    onSelect(pack);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setOpen(true);
    setHighlightedIndex(0);
    onEdit?.();

    if (selectedPack && value !== selectedPack.name) {
      onClear();
    }
  }

  function handleClear() {
    setSearch("");
    setOpen(false);
    setHighlightedIndex(-1);
    onClear();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((currentIndex) =>
        Math.min(currentIndex + 1, filteredBrewPacks.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((currentIndex) =>
        currentIndex <= 0 ? filteredBrewPacks.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (event.key === "Enter" && open && highlightedIndex >= 0) {
      const highlightedPack = filteredBrewPacks[highlightedIndex];

      if (highlightedPack) {
        event.preventDefault();
        handleSelect(highlightedPack);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="brewpack-search"
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground"
      >
        BrewPack
      </label>

      <div className="relative">
        <input
          id="brewpack-search"
          type="text"
          role="combobox"
          value={search}
          autoComplete="off"
          placeholder="Search by name or style"
          aria-expanded={open}
          aria-controls="brewpack-results"
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlightedIndex >= 0
              ? `brewpack-option-${filteredBrewPacks[highlightedIndex]?.id}`
              : undefined
          }
          onFocus={() => {
            setOpen(true);
          }}
          onChange={(event) => handleSearchChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-border-strong bg-field py-3 pl-3 pr-12 text-foreground outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />

        {search && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selected BrewPack"
            title="Clear BrewPack"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-xl leading-none text-muted transition hover:bg-accent-soft hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      {hint && (
        <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
      )}

      {open && (
        <div
          id="brewpack-results"
          role="listbox"
          aria-label="Matching BrewPacks"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-dropdown"
        >
          {filteredBrewPacks.length > 0 ? (
            filteredBrewPacks.map((pack, index) => (
              <button
                key={pack.id}
                id={`brewpack-option-${pack.id}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => handleSelect(pack)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`grid w-full grid-cols-[1fr_auto] gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 focus:outline-none ${
                  index === highlightedIndex
                    ? "bg-background"
                    : "hover:bg-background"
                }`}
              >
                <span>
                  <span className="block font-medium">{pack.name}</span>

                  <span className="mt-1 block text-sm text-muted">
                    {pack.style}
                  </span>
                </span>

                <span className="self-center font-display text-lg text-accent">
                  {pack.abv}%
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-4 text-sm text-muted">
              No active BrewPacks match your search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
