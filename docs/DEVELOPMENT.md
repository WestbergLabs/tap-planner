<div align="center">

# Tap Planner Developer Documentation

Technical setup, project structure, BrewPack importing, automated monitoring, and deployment.

[Back to the project README](../README.md)

</div>

---

## Quick reference

<table>
  <tr>
    <td width="25%" align="center">
      <strong>Framework</strong><br><br>
      Next.js
    </td>
    <td width="25%" align="center">
      <strong>Language</strong><br><br>
      TypeScript
    </td>
    <td width="25%" align="center">
      <strong>Package manager</strong><br><br>
      pnpm 11.15.1
    </td>
    <td width="25%" align="center">
      <strong>Hosting</strong><br><br>
      Vercel
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>Production app</strong><br><br>
      <a href="https://tap-planner.vercel.app/">https://tap-planner.vercel.app/</a>
    </td>
    <td width="50%" valign="top">
      <strong>Repository</strong><br><br>
      <a href="https://github.com/WestbergLabs/tap-planner">WestbergLabs/tap-planner</a>
    </td>
  </tr>
</table>

---

## Contents

- [Local setup](#local-setup)
- [Common commands](#common-commands)
- [Project structure](#project-structure)
- [Application flow](#application-flow)
- [Custom recipe planner](#custom-recipe-planner)
- [BrewPack data](#brewpack-data)
- [BrewPack importer](#brewpack-importer)
- [Automatic catalog monitoring](#automatic-catalog-monitoring)
- [Deployment](#deployment)
- [Data and image policy](#data-and-image-policy)
- [Current scope](#current-scope)
- [Future improvements](#future-improvements)

---

## Local setup

### Requirements

| Requirement | Purpose |
|---|---|
| Node.js 22 | Runs the Next.js application and importer |
| pnpm 11.15.1 | Installs dependencies and runs scripts |
| Git | Version control and branch management |

### Clone and install

```powershell
git clone https://github.com/WestbergLabs/tap-planner.git
cd tap-planner
pnpm install
```

### Start the development server

```powershell
pnpm dev
```

Open:

```text
http://localhost:3000
```

---

## Common commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the local development server |
| `pnpm lint` | Run lint checks |
| `pnpm build` | Create a production build |
| `pnpm import:brewpacks` | Fetch and regenerate BrewPack data |

Before pushing a change, run:

```powershell
pnpm lint
pnpm build
```

---

## Project structure

```text
.github/
  workflows/
    ci.yml
    monitor-brewpacks.yml

app/
  custom/
    page.tsx
  globals.css
  layout.tsx
  page.tsx

data/
  brewpacks.generated.ts

lib/
  schedule.ts

public/
  tap-handles.jpg

scripts/
  import-brewpacks.ts
```

| Path | Purpose |
|---|---|
| `app/page.tsx` | Official BrewPack planner interface at `/` |
| `app/custom/page.tsx` | Custom recipe planner at `/custom` |
| `components/BrewPackPicker.tsx` | Accessible BrewPack search combobox shared by both planners |
| `lib/schedule.ts` | Shared date and schedule-calculation utilities used by both planners |
| `app/globals.css` | Global design, responsive layout, and mobile fixes |
| `app/layout.tsx` | Application metadata and root layout |
| `data/brewpacks.generated.ts` | Generated BrewPack catalog used by the app |
| `scripts/import-brewpacks.ts` | Scrapes, validates, and writes BrewPack data |
| `.github/workflows/ci.yml` | Runs lint and build checks on pull requests and pushes to `main` |
| `.github/workflows/monitor-brewpacks.yml` | Scheduled BrewPack monitoring workflow |
| `public/tap-handles.jpg` | Local hero image |

---

## Application flow

<table>
  <tr>
    <td width="25%" align="center">
      <strong>1</strong><br><br>
      User selects a BrewPack
    </td>
    <td width="25%" align="center">
      <strong>2</strong><br><br>
      User selects a tap date
    </td>
    <td width="25%" align="center">
      <strong>3</strong><br><br>
      Timing and cold crash are chosen
    </td>
    <td width="25%" align="center">
      <strong>4</strong><br><br>
      Tap Planner calculates backward
    </td>
  </tr>
</table>

The date calculation is:

```text
brewing time + cold-crash time + conditioning time = total lead time
```

Tap Planner subtracts the total lead time from the requested tap date and builds each stage from that start date.

The date helpers (`parseLocalDate`, `addDays`, `subtractDays`, `formatDate`, `getTodayString`) and the backward `calculateSchedule` function live in `lib/schedule.ts` so both the official and custom planners share identical logic rather than duplicating it.

---

## Custom recipe planner

The custom planner lives at:

```text
app/custom/page.tsx        →  /custom
```

It lets a user schedule their own recipe, or adjust an official BrewPack's timing, without touching the compact official planner at `/`. A compact hero banner (the shared `public/tap-handles.jpg`, roughly 200px tall, cropped with `object-cover` and darkened) sits at the top so the form stays near the top of the page.

### Starting point

A **Starting point** toggle sits at the top of the form:

- **Start from an official BrewPack** (default) reveals the shared `BrewPackPicker`. Selecting a pack seeds the schedule name (`BrewPack Name - Custom`), style, ABV, fermentation days (recommended brew days), conditioning days (recommended conditioning days), and cold-crash days (0). Every seeded field stays editable, and a notice confirms the official timing was applied.
- **Start from scratch** clears the BrewPack selection and all recipe fields, keeping only a tap date the user has already entered on this page.

### Fields and validation

| Field | Required | Rule |
|---|:---:|---|
| Schedule name | Yes | Non-empty |
| Style | No | Free text |
| ABV | No | Decimal, 0–30 |
| Fermentation days | Yes | Whole number, minimum 1 |
| Cold-crash days | Yes | Whole number, minimum 0 (default 0) |
| Conditioning days | Yes | Whole number, minimum 1 |
| Desired tap date | Yes | Date on or after today |

Validation is strict: negative values are rejected, inline messages are associated with their fields via `aria-describedby`, and no schedule is calculated until every required value is valid. The custom planner uses the term **Fermentation** rather than **Brewing** because the timing is user-defined.

### Prefilling from an official BrewPack

The **Customize timing** action on the main planner links to `/custom` and passes the selected BrewPack's current values — id, name, style, ABV, the chosen brew (fermentation), cold-crash, and conditioning durations, and the tap date when already entered — as **URL query parameters only**. The BrewPack's brew duration is interpreted as fermentation days, and the `id` preselects the pack in the picker. All prefilled fields remain fully editable, and a notice indicates when values were prefilled.

No `localStorage`, `sessionStorage`, `IndexedDB`, cookies, database, or accounts are used, so a browser refresh on `/custom` simply re-reads the query parameters.

### Calculation

The custom planner uses the same backward calculation as the official planner:

```text
fermentation days + cold-crash days + conditioning days = total lead time
```

The cold-crash stage is omitted from the result when cold-crash days are 0.

> Custom recipes are never stored. Recipe details exist only in the browser for the current calculation and are discarded when the page is left.

---

## BrewPack data

The application uses:

```text
data/brewpacks.generated.ts
```

Each BrewPack record contains:

| Field | Description |
|---|---|
| `id` | Stable internal slug |
| `name` | BrewPack display name |
| `style` | Beverage style |
| `recommendedBrewDays` | Recommended brewing duration |
| `recommendedConditioningDays` | Recommended conditioning duration |
| `minimumBrewDays` | Minimum brewing duration |
| `minimumConditioningDays` | Minimum conditioning duration |
| `abv` | Alcohol by volume |
| `yeast` | Included yeast type |
| `hopperIncluded` | Whether a Hopper is included |
| `discontinued` | Optional discontinued marker |

Discontinued BrewPacks remain in the generated data but are hidden from normal search results.

---

## BrewPack importer

The importer is located at:

```text
scripts/import-brewpacks.ts
```

Run it manually with:

```powershell
pnpm import:brewpacks
```

### Importer workflow

<table>
  <tr>
    <td width="20%" align="center"><strong>1</strong><br><br>Fetch source page</td>
    <td width="20%" align="center"><strong>2</strong><br><br>Parse BrewPack fields</td>
    <td width="20%" align="center"><strong>3</strong><br><br>Validate with Zod</td>
    <td width="20%" align="center"><strong>4</strong><br><br>Check record safety</td>
    <td width="20%" align="center"><strong>5</strong><br><br>Write generated catalog</td>
  </tr>
</table>

The importer also:

- rejects suspiciously small result sets
- checks for duplicate IDs
- identifies discontinued packs
- applies stable slug overrides where needed
- writes deterministic output

The generated file does not include a changing timestamp, so Git detects only real catalog changes. The importer also requires a valid `Hopper Included` value and fails loudly if Pinter removes or changes that field.

---

## Automatic catalog monitoring

The workflow is located at:

```text
.github/workflows/monitor-brewpacks.yml
```

It runs every Monday and can also be started manually from the repository's **Actions** tab.

### Workflow behavior

| Stage | Action |
|---|---|
| Checkout | Loads the current repository |
| Install | Installs dependencies with pnpm |
| Import | Regenerates the BrewPack catalog |
| Compare | Checks for meaningful data changes |
| Validate | Runs lint and a production build |
| Review | Opens or updates a pull request |

A successful no-change run confirms that the source page still parses correctly. A failed scheduled run can intentionally signal that Pinter changed the source-page structure and the importer needs maintenance.

The monitor can detect:

| Change | Covered |
|---|:---:|
| New or removed BrewPacks | Yes |
| Brew or conditioning time changes | Yes |
| ABV or style changes | Yes |
| Yeast or Hopper changes | Yes |
| Discontinued-status changes | Yes |
| Source-page parsing failures | Yes |

> Catalog updates are never merged automatically. A maintainer must review and merge the pull request.

---

## Deployment

Tap Planner is deployed through Vercel.

Changes merged into `main` are deployed to production automatically.

### Recommended workflow

<table>
  <tr>
    <td width="20%" align="center"><strong>1</strong><br><br>Create branch</td>
    <td width="20%" align="center"><strong>2</strong><br><br>Make changes</td>
    <td width="20%" align="center"><strong>3</strong><br><br>Lint and build</td>
    <td width="20%" align="center"><strong>4</strong><br><br>Review preview</td>
    <td width="20%" align="center"><strong>5</strong><br><br>Merge to main</td>
  </tr>
</table>

Typical validation:

```powershell
pnpm lint
pnpm build
```

Vercel creates preview deployments for branches and deploys `main` to production after merge.

---

## Data and image policy

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>BrewPack data</strong><br><br>
      BrewPack specifications are sourced from publicly available Pinter documentation.
    </td>
    <td width="50%" valign="top">
      <strong>Product artwork</strong><br><br>
      Official BrewPack product artwork is not included because no redistribution license has been confirmed.
    </td>
  </tr>
</table>

The local header image is stored at:

```text
public/tap-handles.jpg
```

Any required attribution should remain visible wherever the image is used.

---

## Current scope

Tap Planner focuses on schedule planning.

| Included | Not included |
|---|---|
| BrewPack selection | Active brew instructions |
| Recommended and minimum timing | Fermentation monitoring |
| Custom recipe scheduling | Saved or stored recipes |
| Adjusting official BrewPack timing | Product support |
| Optional cold-crash planning | Safety guidance |
| Backward date calculation | Account or device management |
| BrewPack catalog monitoring | |

The official Pinter app remains the source for active brewing instructions and support.

---

## Future improvements

| Idea | Status |
|---|---|
| Calendar export | Planned candidate |
| Saved schedules | Planned candidate |
| Shareable schedule links | Planned candidate |
| Accessibility refinements | Ongoing |
| BrewPack imagery | Requires appropriate permission |

---

<div align="center">

[Back to the project README](../README.md)

</div>
