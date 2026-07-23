import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Primary source: the Pinter shop. This is what is actually on sale right now,
// so new packs appear here within a day of launch (long before the support
// article is updated). The live catalog and the full brewing specs both come
// from here — the collection lists the packs, each product page has the specs.
const SHOP_COLLECTION_URL =
  "https://pinter.com/collections/fresh-beer/products.json?limit=250";

const productUrl = (handle: string): string =>
  `https://pinter.com/products/${handle}`;

// Backup source: the support "Pinter Packs" article. It lags the shop badly,
// but it is the ONLY place that keeps packs that are no longer on sale
// (discontinued or seasonal/out-of-stock) and the only source of the explicit
// "- Discontinued" marker. Used to (a) retain packs that have dropped off the
// shop and (b) backfill any spec a product page happens to omit.
const SUPPORT_URL =
  "https://support.pinter.com/en-US/our-pinter-packs-2525825";

const OUTPUT_FILE = path.join(
  process.cwd(),
  "data",
  "brewpacks.generated.ts",
);

const USER_AGENT =
  "TapPlanner/1.0 BrewPack monitor (community planning tool)";

const MIN_EXPECTED_PACKS = 25;

// Shop product titles sometimes differ from the catalog/support name (brewery
// prefixes, "Coffee"/"Pilsner" suffixes). Map shop title -> canonical catalog
// name so a pack keeps one stable id across both sources.
const SHOP_NAME_ALIASES: Record<string, string> = {
  Snap: "Snap Pilsner",
  "Deep Shade Coffee": "Deep Shade",
  "Lagunitas Sumpin' Easy Remixed": "Sumpin' Easy Remixed",
};

const SLUG_OVERRIDES: Record<string, string> = {
  "Lemon & Lime Hard Seltzer": "lemon-lime-hard-seltzer",
  "Winter's Slumber (Christmas Ale)": "winters-slumber",
};

// Values seen in "Additional Product Type|X" tags that are NOT beer styles.
const NON_STYLE_TAG_VALUES = new Set([
  "breweries",
  "hopper",
  "classic",
  "lagunitas",
  "brewer",
  "collector",
]);

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

// Loose key for reconciling a shop title against a support name.
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function required<T>(
  value: T | null | undefined,
  packName: string,
  field: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(
      `Missing "${field}" for "${packName}" — not found on the product page or the support backup.`,
    );
  }

  return value;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `${url} returned ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// Primary source: the shop collection + product pages
// ---------------------------------------------------------------------------

type ShopBeer = {
  title: string;
  handle: string;
  tags: string[];
};

type ShopProductsResponse = {
  products?: Array<{
    title?: string;
    handle?: string;
    tags?: string[];
  }>;
};

function isBeerProduct(title: string): boolean {
  const normalized = title.trim().toLowerCase();

  if (normalized === "pinter pack") {
    return false;
  }

  return !normalized.includes("bundle") && !normalized.includes("glass");
}

async function fetchShopBeers(): Promise<ShopBeer[]> {
  const response = await fetch(SHOP_COLLECTION_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `Pinter shop returned ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as ShopProductsResponse;
  const products = data.products ?? [];
  const seen = new Set<string>();
  const beers: ShopBeer[] = [];

  for (const product of products) {
    const title = (product.title ?? "").trim();
    const handle = product.handle ?? "";

    if (!title || !handle || !isBeerProduct(title) || seen.has(handle)) {
      continue;
    }

    seen.add(handle);
    beers.push({ title, handle, tags: product.tags ?? [] });
  }

  return beers;
}

function styleFromTags(tags: string[]): string | null {
  const values = tags
    .filter((tag) => tag.startsWith("Additional Product Type|"))
    .map((tag) => tag.split("|")[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const style = values.find(
    (value) => !NON_STYLE_TAG_VALUES.has(value.toLowerCase()),
  );

  return style ?? null;
}

function hopperFromTags(tags: string[]): boolean {
  return tags.some(
    (tag) => tag.trim() === "Additional Product Type|Hopper",
  );
}

type ProductSpecs = {
  recommendedBrewDays: number | null;
  recommendedConditioningDays: number | null;
  minimumBrewDays: number | null;
  minimumConditioningDays: number | null;
  abv: number | null;
  yeast: string | null;
};

function matchInt(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);

  return match ? Number(match[1]) : null;
}

function matchFloat(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);

  return match ? Number(match[1]) : null;
}

function parseProductSpecs(html: string): ProductSpecs {
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  const text = cleanText($.root().text());

  const yeastMatch = text.match(
    /\bYeast:\s*([A-Za-z][\w '-]*?)\s+(?:Nutrition|Facts|Serving|Allergen)/i,
  );

  return {
    recommendedBrewDays: matchInt(
      text,
      /\bBrewing\s+(\d+)\s*Days\s+Recommended Conditioning/i,
    ),
    recommendedConditioningDays: matchInt(
      text,
      /Recommended Conditioning\s+(\d+)\s*Days/i,
    ),
    minimumBrewDays: matchInt(text, /Minimum Brewing\s+(\d+)\s*Days/i),
    minimumConditioningDays: matchInt(
      text,
      /Minimum Conditioning\s+(\d+)\s*Days/i,
    ),
    abv: matchFloat(text, /ABV Once Brewed\s+(\d+(?:\.\d+)?)\s*%/i),
    yeast: yeastMatch ? cleanText(yeastMatch[1]) : null,
  };
}

// ---------------------------------------------------------------------------
// Backup source: the support "Pinter Packs" article
// ---------------------------------------------------------------------------

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

function parseSupportPacks(html: string): BrewPack[] {
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

    const discontinued = rawHeading.toLowerCase().includes("discontinued");
    const name = rawHeading.replace(/\s*-\s*discontinued\s*$/i, "").trim();

    const fields = new Map<string, string>();
    let current = $(headingElement).next();

    while (current.length && current[0].tagName !== "h2") {
      const text = cleanText(current.text());
      const separatorIndex = text.indexOf(":");

      if (separatorIndex > 0) {
        const key = text.slice(0, separatorIndex).trim().toLowerCase();
        const value = text.slice(separatorIndex + 1).trim();
        fields.set(key, value);
      }

      current = current.next();
    }

    if (!fields.has("style")) {
      return;
    }

    const hopperValue = getField(fields, "hopper included").toLowerCase();

    if (hopperValue !== "yes" && hopperValue !== "no") {
      throw new Error(
        `Unexpected Hopper Included value for ${name}: "${hopperValue}"`,
      );
    }

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
      hopperIncluded: hopperValue === "yes",
      ...(discontinued ? { discontinued: true } : {}),
    };

    packs.push(BrewPackSchema.parse(candidate));
  });

  return packs;
}

// ---------------------------------------------------------------------------
// Merge: shop primary, support backup
// ---------------------------------------------------------------------------

async function buildCatalog(): Promise<{
  packs: BrewPack[];
  fromShop: number;
  retainedFromSupport: string[];
}> {
  const [shopBeers, supportHtml] = await Promise.all([
    fetchShopBeers(),
    fetchText(SUPPORT_URL),
  ]);

  const supportPacks = parseSupportPacks(supportHtml);
  const supportByName = new Map(supportPacks.map((p) => [p.name, p]));
  const supportByNorm = new Map(
    supportPacks.map((p) => [normalizeName(p.name), p]),
  );

  const catalog = new Map<string, BrewPack>();

  // 1) Shop is primary: every pack currently on sale, specs from its product
  //    page, falling back to the support entry only for anything missing.
  for (const beer of shopBeers) {
    const canonicalName =
      SHOP_NAME_ALIASES[beer.title] ??
      supportByNorm.get(normalizeName(beer.title))?.name ??
      beer.title;

    const support = supportByName.get(canonicalName);
    const id = SLUG_OVERRIDES[canonicalName] ?? slugify(canonicalName);

    const specs = parseProductSpecs(await fetchText(productUrl(beer.handle)));

    // Prefer the support page's explicit style / hopper flag for packs it
    // knows (clean, curated); fall back to the shop tags for brand-new packs.
    const style =
      support?.style ??
      required(styleFromTags(beer.tags), canonicalName, "style");
    const hopperIncluded = support
      ? support.hopperIncluded
      : hopperFromTags(beer.tags);

    const candidate: BrewPack = {
      id,
      name: canonicalName,
      style,
      recommendedBrewDays: required(
        specs.recommendedBrewDays ?? support?.recommendedBrewDays,
        canonicalName,
        "recommended brewing time",
      ),
      recommendedConditioningDays: required(
        specs.recommendedConditioningDays ??
          support?.recommendedConditioningDays,
        canonicalName,
        "recommended conditioning time",
      ),
      minimumBrewDays: required(
        specs.minimumBrewDays ?? support?.minimumBrewDays,
        canonicalName,
        "minimum brewing time",
      ),
      minimumConditioningDays: required(
        specs.minimumConditioningDays ?? support?.minimumConditioningDays,
        canonicalName,
        "minimum conditioning time",
      ),
      abv: required(specs.abv ?? support?.abv, canonicalName, "abv"),
      // Yeast (like style/hopper) stays with the curated support value for
      // packs it knows — the support page keeps the sachet count (e.g.
      // "Spark x2") that the product page drops. Product page fills new packs.
      yeast: support?.yeast ?? required(specs.yeast, canonicalName, "yeast"),
      hopperIncluded,
    };

    if (catalog.has(id)) {
      throw new Error(
        `Two shop products resolved to the same id "${id}" ("${canonicalName}").`,
      );
    }

    catalog.set(id, BrewPackSchema.parse(candidate));
  }

  const fromShop = catalog.size;

  // 2) Support is the backup: retain packs no longer on sale (discontinued or
  //    seasonal/out-of-stock) so they never silently vanish from the planner.
  const retainedFromSupport: string[] = [];

  for (const pack of supportPacks) {
    if (!catalog.has(pack.id)) {
      catalog.set(pack.id, pack);
      retainedFromSupport.push(pack.name);
    }
  }

  const packs = [...catalog.values()].sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }

    if (a.name > b.name) {
      return 1;
    }

    return 0;
  });

  return { packs, fromShop, retainedFromSupport };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

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
// Primary source (live catalog + specs): ${SHOP_COLLECTION_URL}
// Backup source (discontinued/seasonal + spec fallback): ${SUPPORT_URL}

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

async function writeGeneratedFile(packs: BrewPack[]): Promise<void> {
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, buildGeneratedFile(packs), "utf8");
}

async function main(): Promise<void> {
  console.log("Building BrewPack catalog.");
  console.log(`  Primary (shop): ${SHOP_COLLECTION_URL}`);
  console.log(`  Backup (support): ${SUPPORT_URL}\n`);

  const { packs, fromShop, retainedFromSupport } = await buildCatalog();

  if (packs.length < MIN_EXPECTED_PACKS) {
    throw new Error(
      `Importer produced only ${packs.length} BrewPacks. Expected at least ${MIN_EXPECTED_PACKS}. A source layout may have changed.`,
    );
  }

  const duplicateIds = packs
    .map((pack) => pack.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate BrewPack IDs found: ${duplicateIds.join(", ")}`);
  }

  await writeGeneratedFile(packs);

  console.log(
    `Parsed ${packs.length} BrewPacks (${fromShop} on sale, ${retainedFromSupport.length} retained from support backup).`,
  );

  if (retainedFromSupport.length > 0) {
    console.log(
      `Retained (not currently on sale): ${retainedFromSupport.join(", ")}`,
    );
  }

  console.log(`Generated:\n${OUTPUT_FILE}\n`);

  console.table(
    packs.map((pack) => ({
      Name: pack.name,
      Style: pack.style,
      "Brew Rec.": pack.recommendedBrewDays,
      "Condition Rec.": pack.recommendedConditioningDays,
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
