# Tap Planner

Tap Planner is a simple planning tool for Pinter owners.

Choose a BrewPack and the date you want to tap it, and Tap Planner works backward to calculate when brewing should begin.

## Purpose

Tap Planner answers one question:

> When should I start brewing so my beer is ready for a specific tapping day?

This project is not intended to replace the official Pinter app.

The official Pinter app remains the source for:

- Brewing instructions
- Active brew guidance
- Carbonation settings
- BrewPack-specific directions
- Notifications during an active brew

Tap Planner is only intended to help users plan before brewing begins.

## Current Features

- Select a BrewPack
- Select a desired tapping date
- Choose a recommended or minimum schedule
- Select the number of cold-crash days
- Calculate the required brew start date
- Display the planned stages:
  - Brewing
  - Cold crashing
  - Conditioning
  - Tapping

## Schedule Calculation

Tap Planner calculates the required lead time using:

```text
Total lead time =
Brewing days
+ Cold-crash days
+ Conditioning days
```

The brew date is calculated backward from the desired tapping date:

```text
Brew date =
Tapping date
- Total lead time
```

Example:

```text
Desired tapping date: July 28, 2026

Brewing:       8 days
Cold crashing: 2 days
Conditioning:  3 days

Start brewing: July 15, 2026
Cold crash:    July 23, 2026
Condition:     July 25, 2026
Tap:           July 28, 2026
```

## Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- pnpm

## Running Locally

Install dependencies:

```powershell
pnpm install
```

Start the development server:

```powershell
pnpm dev
```

Open the application at:

```text
http://localhost:3000
```

## Project Timeline

### Version 0.1 — Project Setup

- [x] Create the Next.js project
- [x] Configure TypeScript
- [x] Configure Tailwind CSS
- [x] Create the initial Tap Planner interface
- [x] Add the BrewPack selector
- [x] Add the tapping-date calendar
- [x] Add recommended and minimum schedules
- [x] Add cold-crash selection
- [x] Calculate the brew start date
- [x] Display the complete planning timeline

### Version 0.2 — BrewPack Data

- [ ] Move BrewPack information out of the page component
- [ ] Create a structured BrewPack data model
- [ ] Add the official Pinter BrewPack catalog
- [ ] Store recommended brewing times
- [ ] Store minimum brewing times
- [ ] Store recommended conditioning times
- [ ] Store minimum conditioning times
- [ ] Include source and last-updated information

### Version 0.3 — Automatic Data Updates

- [ ] Build an importer for official Pinter BrewPack data
- [ ] Validate imported schedules
- [ ] Detect new and discontinued BrewPacks
- [ ] Detect schedule changes
- [ ] Preserve previous data when an import fails
- [ ] Run the importer through GitHub Actions
- [ ] Display when BrewPack data was last checked

### Version 0.4 — Planning Improvements

- [ ] Add an optional event-ready safety buffer
- [ ] Add a shareable planning summary
- [ ] Add copy-to-clipboard functionality
- [ ] Add calendar export
- [ ] Improve mobile layout and accessibility
- [ ] Add clear explanations for schedule options

### Version 1.0 — First Public Release

- [ ] Complete the official BrewPack catalog
- [ ] Complete automatic data validation
- [ ] Deploy the application
- [ ] Publish project documentation
- [ ] Test desktop and mobile browsers
- [ ] Release the first stable public version

## Possible Future Features

These are outside the initial scope and are not commitments for Version 1:

- Multiple Pinter planning
- Saved brewing plans
- User accounts
- Reminders
- Community-tested schedules
- Mr. Beer recipe support
- BrewDemon recipe support
- MoreBeer Flash Brew support
- Multiple beers planned for one event

## Disclaimer

Tap Planner is an independent community planning tool and is not affiliated with, endorsed by, or sponsored by Pinter.

Product names and trademarks belong to their respective owners. Always follow the official Pinter app and current manufacturer instructions when preparing and managing a brew.

## License

This project is licensed under the MIT License.
