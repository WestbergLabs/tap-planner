# Tap Planner

Tap Planner is a web app for Pinter owners who want to know:

> When should I start brewing so my beer is ready on a specific tap day?

The app works backward from the desired tapping date and calculates the date brewing should begin.

Tap Planner is a planning tool only. It is not intended to replace the official Pinter app.

## What Tap Planner Does

Brewer select:

- A BrewPack
- A desired tapping date
- A recommended or minimum schedule
- The number of cold-crash days

Tap Planner then calculates:

- Brew start date
- Cold-crash start date
- Conditioning start date
- Tap date
- Total lead time

Example:

```text
Desired tap date: July 28, 2026

Brewing:       8 days
Cold crashing: 2 days
Conditioning:  3 days

Start brewing: July 15, 2026
Cold crash:    July 23, 2026
Condition:     July 25, 2026
Tap:           July 28, 2026
```

## What Tap Planner Does Not Do

Tap Planner does not provide:

- Brewing instructions
- Active brew monitoring
- Carbonation guidance
- Fermentation troubleshooting
- BrewPack preparation steps
- Notifications for an active brew

Users should follow the official Pinter app and current manufacturer instructions during the brewing process.

## Current Features

- BrewPack selection
- Desired tap-date calendar
- Recommended and minimum schedule options
- Cold-crash selection
- Backward date calculation
- Brew timeline display
- Mobile-friendly interface

## Schedule Calculation

Tap Planner calculates total lead time using:

```text
Total lead time =
Brewing days
+ Cold-crash days
+ Conditioning days
```

The brew start date is then calculated using:

```text
Brew start date =
Desired tap date
- Total lead time
```

## Using the Web App

Tap Planner is intended to be deployed as a public website.

Once deployed, users will:

1. Open Tap Planner in a web browser.
2. Select a BrewPack.
3. Select the desired tap date.
4. Select the schedule type.
5. Select the number of cold-crash days.
6. Click **Calculate start date**.
7. Follow the displayed planning timeline.
8. Use the official Pinter app when brew day arrives.

The public website address will be added here before the first release.

## Development Setup

The following instructions are for developers who want to run or modify Tap Planner locally.

### Requirements

Install:

- Node.js
- pnpm
- Git

### Clone the Repository

```powershell
git clone <repository-url>
cd tap-planner
```

Replace `<repository-url>` with the GitHub repository URL.

### Install Dependencies

```powershell
pnpm install
```

### Start the Development Server

```powershell
pnpm dev
```

Open the app in a browser:

```text
http://localhost:3000
```

Use `localhost` while developing on the same computer.

### Stop the Development Server

In the terminal running the app, press:

```text
Ctrl+C
```

### Create a Production Build

```powershell
pnpm build
```

### Run the Production Build Locally

```powershell
pnpm start
```

## Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- pnpm
- GitHub
- Vercel

Planned services:

- GitHub Actions for scheduled BrewPack imports
- Supabase for BrewPack data, if a database is required

## Deployment Plan

Tap Planner is intended to use:

- GitHub for source control
- Vercel for website hosting
- GitHub Actions for scheduled data updates
- Supabase for structured BrewPack data, if needed

Deployment instructions and the public website address will be added before Version 1.0.

## Project Timeline

### Version 0.1 — Working Planner

- [x] Create the Next.js project
- [x] Configure TypeScript
- [x] Configure Tailwind CSS
- [x] Create the initial interface
- [x] Add BrewPack selection
- [x] Add the tap-date calendar
- [x] Add recommended and minimum schedules
- [x] Add cold-crash selection
- [x] Calculate the brew start date
- [x] Display the brew timeline
- [x] Add initial project documentation

### Version 0.2 — BrewPack Data

- [ ] Move BrewPack data out of the page component
- [ ] Create a reusable BrewPack data model
- [ ] Add the official Pinter BrewPack catalog
- [ ] Store recommended brewing times
- [ ] Store minimum brewing times
- [ ] Store recommended conditioning times
- [ ] Store minimum conditioning times
- [ ] Include source and last-updated information

### Version 0.3 — Automatic Data Updates

- [ ] Build an importer for official Pinter BrewPack data
- [ ] Validate imported schedules
- [ ] Detect newly added BrewPacks
- [ ] Detect discontinued BrewPacks
- [ ] Detect schedule changes
- [ ] Preserve previous data if an import fails
- [ ] Run the importer with GitHub Actions
- [ ] Display when data was last checked

### Version 0.4 — Planning Improvements

- [ ] Add an optional event-ready safety buffer
- [ ] Add a shareable planning summary
- [ ] Add copy-to-clipboard functionality
- [ ] Add calendar export
- [ ] Improve mobile accessibility
- [ ] Add clearer schedule explanations

### Version 1.0 — Public Web App

- [ ] Complete the official BrewPack catalog
- [ ] Complete automatic data validation
- [ ] Deploy the app to Vercel
- [ ] Add the public website address
- [ ] Test desktop browsers
- [ ] Test mobile browsers
- [ ] Publish release documentation
- [ ] Release the first stable version

## Possible Future Features

These features are outside the current Version 1 scope:

- Multiple Pinter planning
- Saved brew plans
- User accounts
- Reminders
- Community-tested schedules
- Mr. Beer recipe support
- BrewDemon recipe support
- MoreBeer Flash Brew support
- Multiple beers planned for one event

## Disclaimer

Tap Planner is an independent community planning tool.

It is not affiliated with, endorsed by, or sponsored by Pinter.

Product names and trademarks belong to their respective owners. Always follow the official Pinter app and current manufacturer instructions when preparing and managing a brew.

## License

This project is licensed under the MIT License.
