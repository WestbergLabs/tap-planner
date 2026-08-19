// Builds the BrewPack release timeline that powers /releases.
//
// This is deliberately a SEPARATE scraper from the catalog importer and the
// quick/full scanners. Those read the "fresh beer" collection, which only ever
// contains what is on sale right now. A release timeline needs the opposite:
// every pack Pinter has ever listed, including seasonals that are currently off
// the shelf. So this reads the whole store product feed instead, and falls back
// to fetching individual product pages for packs the feed omits.
//
// IMPORTANT: the dates this produces are estimates, not announcements. Pinter
// publishes no release dates anywhere. Shopify gives us two timestamps per
// product and neither one means "released":
//
//   created_at   - when the product record was first made in the store. Usually
//                  days-to-weeks before it went on sale, but it survives a pack
//                  going out of stock, so it is the sturdier of the two.
//   published_at - when the product was last made visible. This is OVERWRITTEN
//                  every time a pack is re-released, so a seasonal that came
//                  back this spring reads as a brand new pack.
//
// So the rule is: normally published_at IS the release date, because that is
// the day the pack became buyable. Only when published_at sits absurdly long
// after created_at (more than REISSUE_GAP_DAYS) do we read it as a re-release,
// in which case the real launch is somewhere after created_at and we fall back
// to that with month-only precision.
//
// One more wrinkle: Pinter migrated stores in Oct 2023, which stamped a batch
// of packs with the same created_at. Any created_at shared by several packs is
// a bulk store event rather than a real creation date, so those packs are
// capped at month precision too.
//
// The page says all of this plainly; see app/releases/page.tsx.

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { brewPacks, type BrewPack } from "../data/brewpacks.generated";
import { fetchJsonWithRetry } from "./lib/http";

// The whole store, not a single collection. Includes hardware, gift cards and
// merch, which we filter out below.
const STORE_FEED_URL = (page: number): string =>
  `https://pinter.com/products.json?limit=250&page=${page}`;

// A single product record, for packs missing from the store feed.
const PRODUCT_URL = (handle: string): string =>
  `https://pinter.com/products/${handle}.json`;

const OUTPUT_FILE = path.join(
  process.cwd(),
  "data",
  "releases.generated.ts",
);

/** Shopify product_type used for BrewPacks. Everything else is not a pack. */
const BREWPACK_PRODUCT_TYPE = "Press";

/** Bundles reuse the Press type but are not packs in their own right. */
const BUNDLE_PATTERN = /\bbundle\b|\+\s*glass/i;

/**
 * Packs whose store handle is not just their catalog id. Seasonals live outside
 * the store feed, so we fetch them by handle and need the exact spelling.
 */
const HANDLE_OVERRIDES: Record<string, string> = {
  prostmeister: "prostmeister-oktoberfest-lager",
};

/** Shop title -> catalog name, mirroring scripts/import-brewpacks.ts. */
const SHOP_NAME_ALIASES: Record<string, string> = {
  Snap: "Snap Pilsner",
  "Deep Shade Coffee": "Deep Shade",
  "Lagunitas Sumpin' Easy Remixed": "Sumpin' Easy Remixed",
};

/**
 * How far apart created_at and published_at can be before we read the gap as a
 * re-release rather than the ordinary lag between building a product and
 * putting it on sale. Four months covers even the slowest normal lead time
 * (Ancestor's sat 92 days as a draft); real re-releases here span 200+ days.
 */
const REISSUE_GAP_DAYS = 120;

/**
 * How many packs must share a created_at day before we treat that day as a
 * bulk store event (a migration or mass import) rather than a real date.
 */
const BULK_CREATION_THRESHOLD = 4;

/** Refuse to write a suspiciously small timeline. */
const MIN_EXPECTED_RELEASES = 25;

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  published_at?: string;
  created_at?: string;
  product_type?: string;
  // The store feed returns tags as an array; single-product endpoints return
  // the same data as one comma-separated string.
  tags?: string[] | string;
  variants?: Array<{ price?: string; available?: boolean }>;
  images?: Array<{ src?: string }>;
};

export type ReleasePrecision = "day" | "month" | "unknown";

export type BrewPackRelease = {
  id: string;
  name: string;
  style: string;
  abv: number;
  /** Best estimate of when the pack first appeared, or null if unknown. */
  releaseDate: string | null;
  /** How much of `releaseDate` to trust: the exact day, the month, or nothing. */
  precision: ReleasePrecision;
  /** A later re-release date, when the store shows the pack came back. */
  reissuedOn: string | null;
  status: "available" | "unavailable" | "discontinued";
  price: string | null;
  imageUrl: string | null;
  blurb: string | null;
  /** Flavor descriptors from Pinter's own "Icons|" tags. */
  flavors: string[];
  /** Dietary notes such as Vegan or Contains Gluten. */
  badges: string[];
};

const DAY_MS = 24 * 60 * 60 * 1_000;

const toDay = (iso: string): string => iso.slice(0, 10);

const daysBetween = (a: string, b: string): number =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;

/** Normalize a name for loose matching (case, punctuation, curly quotes). */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Strip HTML and collapse whitespace into a short plain-text blurb. */
function toBlurb(html: string | undefined): string | null {
  if (!html) return null;

  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  // Keep it to roughly a sentence or two so cards stay scannable.
  if (text.length <= 220) return text;

  const cut = text.slice(0, 220);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > 120 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}...`;
}

/** Normalize either tag representation into a plain list. */
function toTagList(tags: string[] | string | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
}

/**
 * Pull Pinter's own flavor icons out of the tag list. Tags look like
 * "Icons|full bodied" and "Icons|malt 1", where the trailing digit is an
 * intensity step we drop for display.
 */
function toFlavors(tags: string[] | string | undefined): string[] {
  const flavors = toTagList(tags)
    .filter((tag) => tag.startsWith("Icons|"))
    .map((tag) => tag.slice("Icons|".length).replace(/\s*\d+$/, "").trim())
    .filter(Boolean);

  return [...new Set(flavors)].sort();
}

/** Dietary notes Pinter tags directly, with no prefix. */
function toBadges(tags: string[] | string | undefined): string[] {
  const list = toTagList(tags);
  const known = ["Vegan", "Contains Gluten", "Gluten Free"];
  return known.filter((badge) => list.includes(badge));
}

/** Page through the store feed until it stops returning products. */
async function fetchAllStoreProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const body = await fetchJsonWithRetry<{ products?: ShopifyProduct[] }>(
      STORE_FEED_URL(page),
    );

    const batch = body.products ?? [];
    if (batch.length === 0) break;

    products.push(...batch);
  }

  return products;
}

/** Fetch one product record, or null when the handle does not resolve. */
async function fetchProduct(handle: string): Promise<ShopifyProduct | null> {
  try {
    const body = await fetchJsonWithRetry<{ product?: ShopifyProduct }>(
      PRODUCT_URL(handle),
      { retries: 1 },
    );
    return body.product ?? null;
  } catch {
    // A 404 here is expected and meaningful: the pack is not on the store at
    // all, so it simply has no date. Not an error worth failing the run for.
    return null;
  }
}

/**
 * Combine catalog facts (curated style and ABV) with store facts (dates,
 * imagery, copy). The catalog is the list of packs that exist; the store is
 * where the timeline comes from.
 */
export function buildRelease(
  pack: BrewPack,
  product: ShopifyProduct | null,
  /** created_at days known to be bulk store events, so not real dates. */
  bulkCreationDays: ReadonlySet<string> = new Set(),
): BrewPackRelease {
  const base = {
    id: pack.id,
    name: pack.name,
    style: pack.style,
    abv: pack.abv,
  };

  if (!product) {
    return {
      ...base,
      releaseDate: null,
      precision: "unknown",
      reissuedOn: null,
      status: pack.discontinued ? "discontinued" : "unavailable",
      price: null,
      imageUrl: null,
      blurb: null,
      flavors: [],
      badges: [],
    };
  }

  const created = product.created_at ? toDay(product.created_at) : null;
  const published = product.published_at ? toDay(product.published_at) : null;

  // A re-release only shows up as published_at running far LATER than
  // created_at. published_at landing earlier is just the Oct 2023 migration
  // preserving the original publish date, which is exactly what we want.
  const reissued =
    Boolean(created && published) &&
    published! > created! &&
    daysBetween(created!, published!) > REISSUE_GAP_DAYS;

  // Normal case: published_at is the day it went on sale, so trust it. Reissue
  // case: published_at is a later return, so the original launch is only known
  // to be somewhere around created_at.
  const releaseDate = reissued ? created : (published ?? created);
  const reissuedOn = reissued ? published : null;

  const bulkCreated = Boolean(created && bulkCreationDays.has(created));

  let precision: ReleasePrecision = "unknown";
  if (releaseDate) {
    precision = reissued || bulkCreated ? "month" : "day";
  }

  const available = product.variants?.some((variant) => variant.available);

  return {
    ...base,
    releaseDate,
    precision,
    reissuedOn,
    status: pack.discontinued
      ? "discontinued"
      : available
        ? "available"
        : "unavailable",
    price: product.variants?.[0]?.price ?? null,
    imageUrl: product.images?.[0]?.src ?? null,
    blurb: toBlurb(product.body_html),
    flavors: toFlavors(product.tags),
    badges: toBadges(product.tags),
  };
}

/**
 * Find created_at days shared by enough packs to be a bulk store event. Pinter
 * migrated stores in Oct 2023 and stamped that day onto everything it carried
 * over, so those dates say when the store moved, not when a pack arrived.
 */
export function findBulkCreationDays(
  products: ReadonlyArray<ShopifyProduct | null>,
): Set<string> {
  const counts = new Map<string, number>();

  for (const product of products) {
    if (!product?.created_at) continue;
    const day = toDay(product.created_at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= BULK_CREATION_THRESHOLD)
      .map(([day]) => day),
  );
}

/** Sort newest first, with undated packs last. */
export function sortReleases(releases: BrewPackRelease[]): BrewPackRelease[] {
  return [...releases].sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return a.name.localeCompare(b.name);
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return b.releaseDate.localeCompare(a.releaseDate);
  });
}

function formatRelease(release: BrewPackRelease): string {
  const list = (values: string[]): string =>
    values.length === 0
      ? "[]"
      : `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;

  return `  {
    id: ${JSON.stringify(release.id)},
    name: ${JSON.stringify(release.name)},
    style: ${JSON.stringify(release.style)},
    abv: ${release.abv},
    releaseDate: ${JSON.stringify(release.releaseDate)},
    precision: ${JSON.stringify(release.precision)},
    reissuedOn: ${JSON.stringify(release.reissuedOn)},
    status: ${JSON.stringify(release.status)},
    price: ${JSON.stringify(release.price)},
    imageUrl: ${JSON.stringify(release.imageUrl)},
    blurb: ${JSON.stringify(release.blurb)},
    flavors: ${list(release.flavors)},
    badges: ${list(release.badges)},
  }`;
}

function buildGeneratedFile(releases: BrewPackRelease[]): string {
  return `// This file is generated by scripts/release-scan.ts.
// Do not edit manually.
//
// Dates are ESTIMATES derived from Shopify product timestamps, not official
// release announcements. See the header of scripts/release-scan.ts for how
// each date is chosen and why some are month-only.

export type ReleasePrecision = "day" | "month" | "unknown";

export type BrewPackRelease = {
  id: string;
  name: string;
  style: string;
  abv: number;
  releaseDate: string | null;
  precision: ReleasePrecision;
  reissuedOn: string | null;
  status: "available" | "unavailable" | "discontinued";
  price: string | null;
  imageUrl: string | null;
  blurb: string | null;
  flavors: string[];
  badges: string[];
};

export const releases: BrewPackRelease[] = [
${releases.map(formatRelease).join(",\n")}
];
`;
}

/** Guard against a store-layout change silently gutting the timeline. */
export function assertTimelineSafe(releases: BrewPackRelease[]): void {
  const dated = releases.filter((release) => release.releaseDate);

  if (dated.length < MIN_EXPECTED_RELEASES) {
    throw new Error(
      `Release scan produced only ${dated.length} dated packs. Expected at least ${MIN_EXPECTED_RELEASES}. The store feed may have changed; existing data left untouched.`,
    );
  }
}

async function writeGeneratedFile(releases: BrewPackRelease[]): Promise<void> {
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  const tempFile = `${OUTPUT_FILE}.tmp`;
  await writeFile(tempFile, buildGeneratedFile(releases), "utf8");
  await rename(tempFile, OUTPUT_FILE);
}

async function main(): Promise<void> {
  const storeProducts = await fetchAllStoreProducts();

  const packProducts = storeProducts.filter(
    (product) =>
      product.product_type === BREWPACK_PRODUCT_TYPE &&
      !BUNDLE_PATTERN.test(product.title),
  );

  // Index the store feed by normalized catalog name so we can join it to the
  // curated pack list.
  const byName = new Map<string, ShopifyProduct>();
  for (const product of packProducts) {
    const canonical = SHOP_NAME_ALIASES[product.title] ?? product.title;
    byName.set(normalizeName(canonical), product);
  }

  // Resolve every pack to a product first, because spotting bulk creation days
  // needs the whole set before any release can be dated.
  const resolved: Array<{ pack: BrewPack; product: ShopifyProduct | null }> = [];
  let recovered = 0;

  for (const pack of brewPacks) {
    let product = byName.get(normalizeName(pack.name)) ?? null;

    // Seasonals and retired packs are absent from the store feed but usually
    // still have a reachable product record. That record is the only surviving
    // evidence of when they first appeared, so it is worth the extra request.
    if (!product) {
      const handle = HANDLE_OVERRIDES[pack.id] ?? pack.id;
      product = await fetchProduct(handle);
      if (product) recovered += 1;
    }

    resolved.push({ pack, product });
  }

  const bulkCreationDays = findBulkCreationDays(
    resolved.map(({ product }) => product),
  );

  const releases = resolved.map(({ pack, product }) =>
    buildRelease(pack, product, bulkCreationDays),
  );

  const undated = releases.filter((release) => !release.releaseDate).length;

  const sorted = sortReleases(releases);
  assertTimelineSafe(sorted);
  await writeGeneratedFile(sorted);

  const reissued = sorted.filter((release) => release.reissuedOn).length;

  console.log(
    `Wrote ${sorted.length} packs to data/releases.generated.ts ` +
      `(${recovered} recovered off-feed, ${reissued} look re-released, ${undated} undated).`,
  );
}

// Only run when invoked directly, so the helpers above stay importable/testable.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
