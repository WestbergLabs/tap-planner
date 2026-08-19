// Pure logic for the BrewPack release timeline. No network, no filesystem, so
// every rule here is directly testable (see release-history.test.ts).
// scripts/release-scan.ts supplies the fetching and writes the generated file.
//
// The hard part is that Pinter publishes no release dates anywhere, and neither
// Shopify timestamp means "released":
//
//   created_at   - when the product record was made. Usually days-to-weeks
//                  before it went on sale, but it survives a pack going out of
//                  stock, so it is the sturdier of the two.
//   published_at - when the product was last made visible. OVERWRITTEN on every
//                  re-release, so a returning seasonal reads as brand new.
//
// Everything below is about turning those two into an honest estimate, and
// being explicit about how much of that estimate to trust.

import type { ShopifyProduct } from "./discovery";

/** The store-feed fields we read beyond what discovery already models. */
export type StoreProduct = ShopifyProduct & {
  product_type?: string | null;
  // The store feed returns tags as an array; single-product endpoints return
  // the same data as one comma-separated string.
  tags?: string[] | string;
  images?: Array<{ src?: string | null }>;
};

/** The pack facts the timeline needs from the curated catalog. */
export type CatalogPack = {
  id: string;
  name: string;
  style: string;
  abv: number;
  discontinued?: boolean;
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
  imageUrl: string | null;
  blurb: string | null;
  /** Flavor descriptors from Pinter's own "Icons|" tags. */
  flavors: string[];
  /** Dietary notes such as Vegan or Contains Gluten. */
  badges: string[];
};

/** Shopify product_type used for BrewPacks. Everything else is not a pack. */
export const BREWPACK_PRODUCT_TYPE = "Press";

/** Bundles reuse the Press type but are not packs in their own right. */
const BUNDLE_PATTERN = /\bbundle\b|\+\s*glass/i;

/**
 * How far apart created_at and published_at can be before we read the gap as a
 * re-release rather than the ordinary lag between building a product and
 * putting it on sale. Four months covers even the slowest normal lead time
 * (Ancestor's sat 92 days as a draft); real re-releases here span 200+ days.
 */
export const REISSUE_GAP_DAYS = 120;

/**
 * How many packs must share a created_at day before we treat that day as a
 * bulk store event (a migration or mass import) rather than a real date.
 */
export const BULK_CREATION_THRESHOLD = 4;

const DAY_MS = 24 * 60 * 60 * 1_000;

const toDay = (iso: string): string => iso.slice(0, 10);

const daysBetween = (a: string, b: string): number =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;

/** Normalize a name for loose matching (case, punctuation, curly quotes). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Keep only real BrewPacks: the Press product type, minus bundles. */
export function selectPackProducts(
  products: readonly StoreProduct[],
): StoreProduct[] {
  return products.filter(
    (product) =>
      product.product_type === BREWPACK_PRODUCT_TYPE &&
      !BUNDLE_PATTERN.test(product.title),
  );
}

/** Normalize either tag representation into a plain list. */
export function toTagList(tags: string[] | string | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
}

/** Strip HTML and collapse whitespace into a short plain-text blurb. */
export function toBlurb(html: string | null | undefined): string | null {
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

/**
 * Pull Pinter's own flavor icons out of the tag list. Tags look like
 * "Icons|full bodied" and "Icons|malt 1", where the trailing digit is an
 * intensity step we drop for display.
 */
export function toFlavors(tags: string[] | string | undefined): string[] {
  const flavors = toTagList(tags)
    .filter((tag) => tag.startsWith("Icons|"))
    .map((tag) => tag.slice("Icons|".length).replace(/\s*\d+$/, "").trim())
    .filter(Boolean);

  return [...new Set(flavors)].sort();
}

/** Dietary notes Pinter tags directly, with no prefix. */
export function toBadges(tags: string[] | string | undefined): string[] {
  const list = toTagList(tags);
  const known = ["Vegan", "Contains Gluten", "Gluten Free"];
  return known.filter((badge) => list.includes(badge));
}

/**
 * Drop Shopify's `?v=` cache-buster from an image URL. It changes whenever an
 * asset is re-uploaded, which would otherwise produce a data diff (and an
 * automated pull request) that carries no actual news.
 */
export function toStableImageUrl(
  src: string | null | undefined,
): string | null {
  if (!src) return null;
  const [base] = src.split("?");
  return base || null;
}

/**
 * Find created_at days shared by enough packs to be a bulk store event. Pinter
 * migrated stores in Oct 2023 and stamped that day onto everything it carried
 * over, so those dates say when the store moved, not when a pack arrived.
 */
export function findBulkCreationDays(
  products: ReadonlyArray<StoreProduct | null>,
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

/**
 * Combine catalog facts (curated style and ABV) with store facts (dates,
 * imagery, copy). The catalog is the list of packs that exist; the store is
 * where the timeline comes from.
 */
export function buildRelease(
  pack: CatalogPack,
  product: StoreProduct | null,
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
    created !== null &&
    published !== null &&
    published > created &&
    daysBetween(created, published) > REISSUE_GAP_DAYS;

  // Normal case: published_at is the day it went on sale, so trust it. Reissue
  // case: published_at is a later return, so the original launch is only known
  // to be somewhere around created_at.
  const releaseDate = reissued ? created : (published ?? created);
  const reissuedOn = reissued ? published : null;

  const bulkCreated = created !== null && bulkCreationDays.has(created);

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
    imageUrl: toStableImageUrl(product.images?.[0]?.src),
    blurb: toBlurb(product.body_html),
    flavors: toFlavors(product.tags),
    badges: toBadges(product.tags),
  };
}

/** Sort newest first, with undated packs last. */
export function sortReleases(
  releases: readonly BrewPackRelease[],
): BrewPackRelease[] {
  return [...releases].sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return a.name.localeCompare(b.name);
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return b.releaseDate.localeCompare(a.releaseDate);
  });
}

/** Refuse to write a suspiciously small timeline. */
export const MIN_EXPECTED_RELEASES = 25;

/** Guard against a store-layout change silently gutting the timeline. */
export function assertTimelineSafe(
  releases: readonly BrewPackRelease[],
): void {
  const dated = releases.filter((release) => release.releaseDate);

  if (dated.length < MIN_EXPECTED_RELEASES) {
    throw new Error(
      `Release scan produced only ${dated.length} dated packs. Expected at least ${MIN_EXPECTED_RELEASES}. The store feed may have changed; existing data left untouched.`,
    );
  }
}
