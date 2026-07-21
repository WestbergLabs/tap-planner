import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const SOURCE_URL =
  "https://support.pinter.com/en-US/our-pinter-packs-2525825";

const OUTPUT_FILE = path.join(
  process.cwd(),
  "data",
  "brewpacks.generated.ts",
);

const SLUG_OVERRIDES: Record<string, string> = {
  "Lemon & Lime Hard Seltzer": "lemon-lime-hard-seltzer",
  "Winter's Slumber (Christmas Ale)": "winters-slumber",
};

const BrewPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  style: z.string().min(1),
  recommendedBrewDays: z.number().int().positive(),
  recommendedConditioningDays: z.number().int().positive(),
  minimumBrewDays: z.number().int().positive(),
  minimumConditioningDays: z.number().int().positive(),
  abv: z.number().positive(),
  yeast: z.string().min(1),
  hopperIncluded: z.boolean(),
  discontinued: z.boolean().optional(),
});

type BrewPack = z.infer<typeof BrewPackSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDays(value: string, fieldName: string): number {
  const match = value.match(/(\d+)/);

  if (!match) {
    throw new Error(`Could not parse ${fieldName}: "${value}"`);
  }

  return Number(match[1]);
}

function parseAbv(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)/);

  if (!match) {
    throw new Error(`Could not parse ABV: "${value}"`);
  }

  return Number(match[1]);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getField(
  fields: Map<string, string>,
  fieldName: string,
): string {
  const value = fields.get(fieldName.toLowerCase());

  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }

  return value;
}

async function fetchPage(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent":
        "TapPlanner/1.0 BrewPack monitor (community planning tool)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Pinter page returned ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

function parseBrewPacks(html: string): BrewPack[] {
  const $ = cheerio.load(html);
  const packs: BrewPack[] = [];

  $("h2").each((_, headingElement) => {
    const rawHeading = cleanText($(headingElement).text());

    if (
      !rawHeading ||
      rawHeading === "Looking for details about Pinter Packs?"
    ) {
      return;
    }

    const discontinued = rawHeading
      .toLowerCase()
      .includes("discontinued");

    const name = rawHeading
      .replace(/\s*-\s*discontinued\s*$/i, "")
      .trim();

    const fields = new Map<string, string>();

    let current = $(headingElement).next();

    while (current.length && current[0].tagName !== "h2") {
      const text = cleanText(current.text());
      const separatorIndex = text.indexOf(":");

      if (separatorIndex > 0) {
        const key = text
          .slice(0, separatorIndex)
          .trim()
          .toLowerCase();

        const value = text.slice(separatorIndex + 1).trim();

        fields.set(key, value);
      }

      current = current.next();
    }

    if (!fields.has("style")) {
      return;
    }

    const hopperValue = fields.get("hopper included") ?? "";

    const candidate: BrewPack = {
      id: SLUG_OVERRIDES[name] ?? slugify(name),
      name,
      style: getField(fields, "style"),
      recommendedBrewDays: parseDays(
        getField(fields, "recommended brewing time"),
        "recommended brewing time",
      ),
      recommendedConditioningDays: parseDays(
        getField(fields, "recommended conditioning time"),
        "recommended conditioning time",
      ),
      minimumBrewDays: parseDays(
        getField(fields, "minimum brewing time"),
        "minimum brewing time",
      ),
      minimumConditioningDays: parseDays(
        getField(fields, "minimum conditioning time"),
        "minimum conditioning time",
      ),
      abv: parseAbv(getField(fields, "abv")),
      yeast: getField(fields, "yeast"),
      hopperIncluded: hopperValue.toLowerCase() === "yes",
      ...(discontinued ? { discontinued: true } : {}),
    };

    packs.push(BrewPackSchema.parse(candidate));
  });

  return packs.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }

    if (a.name > b.name) {
      return 1;
    }

    return 0;
  });
}

function escapeString(value: string): string {
  return JSON.stringify(value);
}

function formatBrewPack(pack: BrewPack): string {
  const lines = [
    "  {",
    `    id: ${escapeString(pack.id)},`,
    `    name: ${escapeString(pack.name)},`,
    `    style: ${escapeString(pack.style)},`,
    `    recommendedBrewDays: ${pack.recommendedBrewDays},`,
    `    recommendedConditioningDays: ${pack.recommendedConditioningDays},`,
    `    minimumBrewDays: ${pack.minimumBrewDays},`,
    `    minimumConditioningDays: ${pack.minimumConditioningDays},`,
    `    abv: ${pack.abv},`,
    `    yeast: ${escapeString(pack.yeast)},`,
    `    hopperIncluded: ${pack.hopperIncluded},`,
  ];

  if (pack.discontinued) {
    lines.push("    discontinued: true,");
  }

  lines.push("  }");

  return lines.join("\n");
}

function buildGeneratedFile(packs: BrewPack[]): string {
  return `// This file is generated by scripts/import-brewpacks.ts.
// Do not edit manually.
// Source: ${SOURCE_URL}

export type BrewPack = {
  id: string;
  name: string;
  style: string;
  recommendedBrewDays: number;
  recommendedConditioningDays: number;
  minimumBrewDays: number;
  minimumConditioningDays: number;
  abv: number;
  yeast: string;
  hopperIncluded: boolean;
  discontinued?: boolean;
};

export const brewPacks: BrewPack[] = [
${packs.map(formatBrewPack).join(",\n")}
];
`;
}

async function writeGeneratedFile(
  packs: BrewPack[],
): Promise<void> {
  await mkdir(path.dirname(OUTPUT_FILE), {
    recursive: true,
  });

  const contents = buildGeneratedFile(packs);

  await writeFile(OUTPUT_FILE, contents, "utf8");
}

async function main(): Promise<void> {
  console.log(`Fetching BrewPack data from:\n${SOURCE_URL}\n`);

  const html = await fetchPage();
  const packs = parseBrewPacks(html);

  if (packs.length < 25) {
    throw new Error(
      `Importer found only ${packs.length} BrewPacks. Expected at least 25. The source layout may have changed.`,
    );
  }

  const duplicateIds = packs
    .map((pack) => pack.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate BrewPack IDs found: ${duplicateIds.join(", ")}`,
    );
  }

  await writeGeneratedFile(packs);

  console.log(`Successfully parsed ${packs.length} BrewPacks.`);
  console.log(`Generated:\n${OUTPUT_FILE}\n`);

  console.table(
    packs.map((pack) => ({
      Name: pack.name,
      Style: pack.style,
      "Brew Rec.": pack.recommendedBrewDays,
      "Condition Rec.": pack.recommendedConditioningDays,
      "Brew Min.": pack.minimumBrewDays,
      "Condition Min.": pack.minimumConditioningDays,
      ABV: `${pack.abv}%`,
      Discontinued: pack.discontinued ? "Yes" : "No",
    })),
  );
}

main().catch((error: unknown) => {
  console.error("\nBrewPack import failed.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
