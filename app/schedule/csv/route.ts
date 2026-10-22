// Serves the generated schedule CSV (see scripts/export-schedule.ts).

import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  const file = readFileSync(path.join(process.cwd(), "data/schedule/Pinter_Brewing_Schedule.csv"));
  return new Response(file, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Pinter_Brewing_Schedule.csv"',
    },
  });
}
