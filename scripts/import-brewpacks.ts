import * as cheerio from "cheerio";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { fetchJsonWithRetry, fetchTextWithRetry } from "./lib/http";
import {
  selectBrewPackProducts,
  type ShopifyProduct,
} from "./lib/discovery";

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

export const OUTPUT_FILE = path.join(
  process.cwd(),
  "data",
  "brewpacks.generated.ts",
);

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

export type BrewPack = z.infer<typeof BrewPackSchema>;

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

// The importer reuses the shared retrying fetch for product and support pages.
const fetchText = fetchTextWithRetry;

// ---------------------------------------------------------------------------
// Primary source: the shop collection + product pages
// ---------------------------------------------------------------------------

type ShopProductsResponse = {
  products?: ShopifyProduct[];
};

/**
 * Fetch the Fresh Beer collection as Shopify product JSON. Returns the raw
 * BrewPack products (bundles/glasses removed) so both the catalog build and the
 * discovery scan work from a single collection request.
 */
export async function fetchShopProducts(): Promise<ShopifyProduct[]> {
  const data = await fetchJsonWithRetry<ShopProductsResponse>(SHOP_COLLECTION_URL);
  const products = data.products ?? [];

  if (!Array.isArray(data.products)) {
    throw new Error(
      "Pinter collection JSON did not contain a products array — source layout may have changed.",
    );
  }

  return selectBrewPackProducts(products);
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
  style: string | null;
  recommendedBrewDays: number | null;
  recommendedConditioningDays: number | null;
  minimumBrewDays: number | null;
  minimumConditioningDays: number | null;
  abv: number | null;
  yeast: string | null;
};

// The product page prints the style as the subtitle under the title, e.g.
// "Double IPA 8.0%" or "Pale Ale + Hopper 4.5%". Drop the trailing ABV and the
// "+ Hopper" note (hopper is tracked separately) to get just the style.
function cleanStyle(raw: string): string | null {
  const style = cleanText(raw)
    .replace(/\s*\d+(?:\.\d+)?\s*%.*/, "")
    .replace(/\s*\+\s*Hopper\b/i, "")
    .replace(/[\s\-+]+$/, "")
    .trim();

  return style || null;
}

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

  // Style subtitle lives in a <p class="h4 t-upper"> next to the title; pick
  // the one that carries the ABV so we do not grab an unrelated heading.
  const styleText = $("p.h4.t-upper")
    .filter((_, el) => /\d+(?:\.\d+)?\s*%/.test($(el).text()))
    .first()
    .text();

  $("script, style, noscript").remove();

  const text = cleanText($.root().text());

  const yeastMatch = text.match(
    /\bYeast:\s*([A-Za-z][\w '-]*?)\s+(?:Nutrition|Facts|Serving|Allergen)/i,
  );

  return {
    style: cleanStyle(styleText),
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

/**
 * A shop product that is published but whose required timing/spec fields could
 * not be resolved yet (new page not fully populated, product page unreachable).
 * These are never added to the planner catalog; they are reported so a scan can
 * keep them pending and retry on the next run.
 */
export type PendingProduct = {
  id: number;
  handle: string;
  title: string;
  missing: string[];
};

export type CatalogResult = {
  packs: BrewPack[];
  pending: PendingProduct[];
  fromShop: number;
  retainedFromSupport: string[];
};

// Resolve one shop product into a complete BrewPack, or into a pending record
// listing the fields that could not be filled. Any per-product failure (missing
// spec or an unreachable product page) is contained here so it never aborts the
// whole run -- a single incomplete product must not drop the rest of the catalog.
async function resolveShopPack(
  product: ShopifyProduct,
  supportByName: Map<string, BrewPack>,
  supportByNorm: Map<string, BrewPack>,
): Promise<{ pack: BrewPack } | { pending: PendingProduct }> {
  const tags = product.tags ?? [];
  const canonicalName =
    SHOP_NAME_ALIASES[product.title] ??
    supportByNorm.get(normalizeName(product.title))?.name ??
    product.title;

  const support = supportByName.get(canonicalName);
  const id = SLUG_OVERRIDES[canonicalName] ?? slugify(canonicalName);

  const missing: string[] = [];
  const pendingRecord = (): { pending: PendingProduct } => ({
    pending: { id: product.id, handle: product.handle, title: product.title, missing },
  });

  let specs: ProductSpecs;
  try {
    specs = parseProductSpecs(await fetchText(productUrl(product.handle)));
  } catch {
    // Product page unreachable/unparseable right now: treat as fully pending so
    // it is retried next scan rather than crashing this run or dropping data.
    missing.push("product page");
    return pendingRecord();
  }

  // Prefer the support page's curated style / hopper / yeast for packs it knows
  // (no churn); fall back to the product page and shop tags for brand-new packs.
  const pick = <T>(value: T | null | undefined, field: string): T | null => {
    if (value === null || value === undefined) {
      missing.push(field);
      return null;
    }
    return value;
  };

  const style = pick(support?.style ?? specs.style ?? styleFromTags(tags), "style");
  const recommendedBrewDays = pick(
    specs.recommendedBrewDays ?? support?.recommendedBrewDays,
    "recommended brewing time",
  );
  const recommendedConditioningDays = pick(
    specs.recommendedConditioningDays ?? support?.recommendedConditioningDays,
    "recommended conditioning time",
  );
  const minimumBrewDays = pick(
    specs.minimumBrewDays ?? support?.minimumBrewDays,
    "minimum brewing time",
  );
  const minimumConditioningDays = pick(
    specs.minimumConditioningDays ?? support?.minimumConditioningDays,
    "minimum conditioning time",
  );
  const abv = pick(specs.abv ?? support?.abv, "abv");
  const yeast = pick(support?.yeast ?? specs.yeast, "yeast");

  if (missing.length > 0) {
    return pendingRecord();
  }

  const candidate: BrewPack = {
    id,
    name: canonicalName,
    style: style as string,
    recommendedBrewDays: recommendedBrewDays as number,
    recommendedConditioningDays: recommendedConditioningDays as number,
    minimumBrewDays: minimumBrewDays as number,
    minimumConditioningDays: minimumConditioningDays as number,
    abv: abv as number,
    yeast: yeast as string,
    hopperIncluded: support ? support.hopperIncluded : hopperFromTags(tags),
  };

  return { pack: BrewPackSchema.parse(candidate) };
}

/** Fetch and parse the support "Pinter Packs" article into curated packs. */
export async function fetchSupportPacks(): Promise<BrewPack[]> {
  return parseSupportPacks(await fetchText(SUPPORT_URL));
}

/**
 * Resolve a set of shop products against the support backup into complete
 * BrewPacks plus a pending list. Used both for the full build (all products)
 * and the quick scan's incremental path (only the changed products), so the two
 * paths extract specs identically. Does not apply support retention.
 */
export async function resolveShopPacks(
  products: ShopifyProduct[],
  supportPacks: BrewPack[],
): Promise<{ packs: BrewPack[]; pending: PendingProduct[] }> {
  const supportByName = new Map(supportPacks.map((p) => [p.name, p]));
  const supportByNorm = new Map(
    supportPacks.map((p) => [normalizeName(p.name), p]),
  );

  const bySlug = new Map<string, BrewPack>();
  const pending: PendingProduct[] = [];

  for (const product of products) {
    const resolved = await resolveShopPack(product, supportByName, supportByNorm);

    if ("pending" in resolved) {
      pending.push(resolved.pending);
      continue;
    }

    const { pack } = resolved;

    if (bySlug.has(pack.id)) {
      throw new Error(
        `Two shop products resolved to the same id "${pack.id}" ("${pack.name}").`,
      );
    }

    bySlug.set(pack.id, pack);
  }

  return { packs: [...bySlug.values()], pending };
}

export async function buildCatalog(
  options: { shopProducts?: ShopifyProduct[] } = {},
): Promise<CatalogResult> {
  const [shopProducts, supportPacks] = await Promise.all([
    options.shopProducts
      ? Promise.resolve(options.shopProducts)
      : fetchShopProducts(),
    fetchSupportPacks(),
  ]);

  const { packs: shopPacks, pending } = await resolveShopPacks(
    shopProducts,
    supportPacks,
  );

  // 1) Shop is primary: every pack currently on sale (already deduped by slug).
  const catalog = new Map<string, BrewPack>(
    shopPacks.map((pack) => [pack.id, pack]),
  );

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

  return { packs, pending, fromShop, retainedFromSupport };
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

// The generated file is written atomically (temp file + rename) so a crash
// mid-write can never leave a truncated or empty catalog on disk.
export async function writeGeneratedFile(packs: BrewPack[]): Promise<void> {
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  const tempFile = `${OUTPUT_FILE}.tmp`;
  await writeFile(tempFile, buildGeneratedFile(packs), "utf8");
  await rename(tempFile, OUTPUT_FILE);
}

/**
 * Guard against a source-layout change silently wiping the catalog: refuse a
 * suspiciously small result or duplicate ids. Throwing here leaves the existing
 * generated file untouched (nothing has been written yet).
 */
export function assertCatalogSafe(packs: BrewPack[]): void {
  if (packs.length < MIN_EXPECTED_PACKS) {
    throw new Error(
      `Importer produced only ${packs.length} BrewPacks. Expected at least ${MIN_EXPECTED_PACKS}. A source layout may have changed; existing data left untouched.`,
    );
  }

  const duplicateIds = packs
    .map((pack) => pack.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate BrewPack IDs found: ${duplicateIds.join(", ")}`);
  }
}

async function main(): Promise<void> {
  console.log("Building BrewPack catalog.");
  console.log(`  Primary (shop): ${SHOP_COLLECTION_URL}`);
  console.log(`  Backup (support): ${SUPPORT_URL}\n`);

  const { packs, pending, fromShop, retainedFromSupport } = await buildCatalog();

  assertCatalogSafe(packs);

  if (pending.length > 0) {
    console.log(
      `Pending (published but incomplete, not added): ${pending
        .map((p) => `${p.title} [missing: ${p.missing.join(", ")}]`)
        .join("; ")}\n`,
    );
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

// Only run the importer when this file is executed directly (pnpm
// import:brewpacks), not when the scanner or tests import its helpers.
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("\nBrewPack import failed.");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  });
}
