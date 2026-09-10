# Tap Planner

Scheduling tool for Pinter home-brew owners. Pick a BrewPack and a tap date, and it
works backward to tell you when to start. Independent community project — **not**
affiliated with Pinter.

## Commands

```
pnpm dev              # local dev
pnpm lint             # eslint (must be clean)
pnpm build            # next build; also the TypeScript gate
pnpm test             # discovery tests only
pnpm import:brewpacks # regenerate the BrewPack catalog
pnpm scan:releases    # rebuild the release timeline
pnpm sync:images      # capture Pinter pack shots (never deletes)
pnpm recover:images   # recover shots for delisted packs, via archived filenames
pnpm preview:labels   # render /labels cards to scripts/out/*.{svg,png}
```

Lint and build are the full check. There is no component test suite.

## Testing the app for real

`pnpm dev` serves on `http://localhost:3000`. The pages are all client
components, so curling the HTML only proves they compile — anything
interactive needs a browser.

There is no Playwright here. `scripts/drive-labels.mjs` drives `/labels`
through the Chrome DevTools Protocol over a plain WebSocket instead: point a
headless browser at a debug port, then run it.

```
# Windows, Edge:
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\tap-edge-profile" about:blank

node scripts/drive-labels.mjs http://127.0.0.1:9222 scripts/out/driven.png
```

It picks a BrewPack, switches to the two-label sheet, puts a different beer on
each card, and screenshots. **Look at the screenshot** — it caught a duplicated
field label and a missing space that lint, build, and the HTML all passed.

## Layout

- `app/` — five pages, all `"use client"`: `/` (official planner), `/custom`,
  `/rotation`, `/releases`, `/labels`.
- `lib/schedule.ts` — all date math. `lib/calendar.ts` — `.ics` generation.
  `lib/labels.ts` — style→artwork mapping. `lib/releases.ts` — timeline
  grouping. `lib/brewpackImages.ts` — pack id → captured shot.
- `components/` — `SiteNav` (shared nav, on every page), `BrewPackPicker` /
  `BeerPicker` (comboboxes), `PackThumb` (pack shot with generated fallback),
  `LabelCard` + `LabelArt`, `ReleaseStrip`, `PinterNotice`.
- `data/*.generated.ts` — **generated, do not hand-edit.** Change the importer
  or the release scanner instead.

## Conventions

**Page shell.** Every page repeats the same structure rather than sharing a layout
component: hero banner with `<SiteNav current="/route" />` rendered *outside* the
hero div (the hero clips overflow, which would cut off the open menu) →
`<header>` with eyebrow/h1/lede → `rounded-[28px]` surface sections → `<footer>`
ending in `<PinterNotice />`. Copy an existing page.

**The attribution notice is one shared component.** Never inline that wording —
a legal notice that drifts between pages is worse than none.

**Colors come from tokens**, never literals: `bg-surface`, `text-muted`,
`border-border`, `text-accent`, and the `stage-*` families. Defined once in
`app/globals.css` under `:root` and re-exported through `@theme inline`.

**Everything is client-side and nothing persists.** No database, no accounts, no
analytics. Schedules, calendar files, and labels are all generated in the browser.
Keep it that way — the README makes this promise to users explicitly.

## Gotchas

**Dates are timezone-traps.** Always use `parseLocalDate` / `toDateInputValue` from
`lib/schedule.ts`, never `new Date(string)` — the latter parses `YYYY-MM-DD` as UTC
and drifts stages by a day for anyone west of Greenwich.

**Don't reach for `Intl` in printed or exported output.** Locale data varies by
engine (some render September as "Sept", others "Sep"), so the same card or `.ics`
would differ per browser. `lib/labels.ts` hard-codes month names for this reason.

**Pack artwork has two sources.** Pinter pack shots in `public/brewpacks/` when
one was captured, and a procedurally generated motif (`lib/labels.ts` →
`LabelArt`) as the fallback. The fallback is not dead code: it covers custom
recipes and packs discontinued before capture began.

`sync:images` writes two sizes per pack: a 700px shot for the printed label and
a 160px `.thumb.` copy for `PackThumb`, used by the three planners beside the
selected BrewPack and by every card on `/releases`. Use the thumb anywhere a
pack appears in a list or panel — the full shot is ~180KB and only earns that
on a printed card.

**The `/releases` density strip is deliberately `aria-hidden`.** Hovering and
clicking ticks is a mouse-only enhancement, which is normally a smell. It is
acceptable here only because nothing lives in the strip alone: every release is
in the card list below it, the year buttons are real buttons that do the
filtering, and a screen reader gets a one-line summary instead of 38 unlabelled
rectangles. If you ever put information *only* in the strip, that reasoning
breaks and it needs real controls.

**Missing images come from Pinter, never from image search.** A delisted pack
is absent from every collection feed, so its *filename* is unknown — but the
file itself is still on Pinter's CDN. `pnpm recover:images` reads the filename
out of an archived product page and then fetches the image from Pinter. Nothing
but the filename comes from the archive. Do not substitute web image search
results: unknown provenance, frequently the wrong beer, and a worse licence
position than the manufacturer's own photo.

**`data/brewpack-images.json` is retained, never regenerated.** This is the whole
reason older brews keep their pictures. `buildCatalog` rebuilds a discontinued
pack from Pinter's *support page*, which has no imagery — so an image field on
the generated catalog would be erased the moment a pack stopped selling. The
manifest is append/update-only and `sync:images` never deletes. Do not "clean up"
entries for packs that are no longer in the shop feed; that is the feature.

**Pack shots are Pinter's copyrighted images**, shipped in a tool the README
states is unaffiliated. This was a deliberate owner decision. Flag it if the
scope grows, but do not silently revert it.

**`/labels` prints via SVG, not CSS.** The card is one 400×600 SVG (100 units per
inch). This is deliberate: browsers only print CSS backgrounds when the user ticks
"background graphics", but SVG fills always print. Verify layout changes with
`pnpm preview:labels`, which asserts no text escapes the trim and writes PNGs to
look at.

**Catalog changes go through a PR.** The scanner opens one for review; nothing about
the BrewPack list publishes silently.
