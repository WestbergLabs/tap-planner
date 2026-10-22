// Serves the generated schedule PDF (see scripts/export-schedule.ts). Read at
// build time, so the file is as current as the last merged catalog PR.

import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  const file = readFileSync(path.join(process.cwd(), "data/schedule/Pinter_Brewing_Schedule.pdf"));
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Pinter_Brewing_Schedule.pdf"',
    },
  });
}
