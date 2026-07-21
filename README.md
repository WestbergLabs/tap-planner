# Tap Planner

**Live app:** https://tap-planner.vercel.app/

Tap Planner is a simple scheduling tool for Pinter owners. Choose an official BrewPack and the date you want it ready to pour, and Tap Planner works backward to show when each stage should begin.

It is built for planning ahead. Continue using the official Pinter app for active brewing instructions and guidance.

## How to use Tap Planner

1. Search for and select your BrewPack.
2. Choose the date you want it ready to tap.
3. Select the recommended or minimum schedule.
4. Add a cold-crash period when needed.
5. Select **Calculate start date**.

Tap Planner then shows:

- when to start brewing
- when to begin cold crashing, when selected
- when to begin conditioning
- the planned tap date
- the total lead time

Use the **×** in the BrewPack search field to quickly clear the current selection and choose another pack.

## Schedule options

### Recommended

Uses the official recommended brewing and conditioning durations for the selected BrewPack.

This is the default option and is generally the best choice when you have enough time before the desired tap date.

### Minimum

Uses the official minimum brewing and conditioning durations.

This can help when planning with less lead time, but the recommended schedule should normally provide the intended experience.

### Cold crash

Cold crashing is optional and is treated as a separate stage between brewing and conditioning.

Available choices are:

- none
- 1 day
- 2 days
- 3 days

## How dates are calculated

Tap Planner calculates the required start date using:

```text
brewing time + cold-crash time + conditioning time = total lead time
```

It subtracts the total lead time from the desired tap date and then builds the complete schedule.

Example:

```text
Desired tap date:       July 28
Brewing:                8 days
Cold crash:             2 days
Conditioning:           3 days

Start brewing:          July 15
Begin cold crash:       July 23
Begin conditioning:     July 25
Tap day:                July 28
```

## BrewPack information

The BrewPack catalog includes:

- BrewPack name
- beer or beverage style
- ABV
- recommended brewing time
- recommended conditioning time
- minimum brewing time
- minimum conditioning time
- yeast
- hopper inclusion
- discontinued status

Discontinued BrewPacks remain in the catalog data but are hidden from normal search results.

## Important notice

Tap Planner is an independent community project. It is not an official Pinter product and is not affiliated with or endorsed by Pinter.

Planning information is provided for convenience. Always follow the official Pinter app for brewing instructions, safety information, current product guidance, and active brew decisions.

---

# Development

The sections below are intended for contributors and developers.

## Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- pnpm
- Zod
- Cheerio
- Vercel

## Local setup

### Requirements

Install:

- Node.js
- pnpm
- Git

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

### Production build

```powershell
pnpm build
```

### Lint

```powershell
pnpm lint
```

## Project structure

```text
app/
  globals.css
  layout.tsx
  page.tsx

data/
  brewpacks.ts
  brewpacks.generated.ts

public/
  tap-handles.jpg

scripts/
  import-brewpacks.ts
```

## BrewPack importer

The catalog importer reads BrewPack information from Pinter's public support documentation, validates the parsed records, and generates:

```text
data/brewpacks.generated.ts
```

Run it with:

```powershell
pnpm import:brewpacks
```

The importer:

- fetches the official BrewPack reference page
- parses BrewPack specifications
- validates each record with Zod
- rejects suspiciously small results
- checks for duplicate IDs
- identifies discontinued packs
- writes a generated TypeScript catalog

The importer does not overwrite the hand-maintained catalog automatically.

After running the importer, review the differences:

```powershell
git diff --no-index .\data\brewpacks.ts .\data\brewpacks.generated.ts
```

The source page may change without notice. Generated data should be reviewed before being promoted or deployed.

## Deployment

The project is deployed through Vercel.

Typical workflow:

1. Create a feature branch.
2. Make and test the change locally.
3. Run `pnpm lint`.
4. Run `pnpm build`.
5. Commit and push the branch.
6. Review the Vercel preview deployment.
7. Open a pull request into `main`.
8. Merge after verification.

Changes merged into `main` are deployed to production automatically.

## Data and image policy

BrewPack specifications are sourced from publicly available Pinter documentation.

Official BrewPack product artwork is not included because no redistribution license has been confirmed. Product images should only be added after permission or an appropriate license is obtained.

The header photograph is stored locally in:

```text
public/tap-handles.jpg
```

Its attribution should remain visible in the application or project documentation when required by the selected image source.

## Current scope

Tap Planner intentionally focuses on schedule planning.

It does not attempt to replace:

- the official Pinter app
- active brew instructions
- fermentation monitoring
- product support
- safety guidance
- account or device management

## Possible future improvements

Potential additions include:

- automated catalog update checks
- clearer source-change reporting
- optional calendar export
- saved schedules
- shareable schedule links
- accessibility refinements
- user-requested BrewPack imagery, subject to permission