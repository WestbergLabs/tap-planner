// Pure BrewPack discovery logic: no network, no filesystem.
//
// The scanner fetches Pinter's Fresh Beer collection as Shopify product JSON
// and uses these helpers to decide which products are new or relevantly changed
// and therefore need the (expensive) product-page scrape. Keeping this logic
// pure makes the two-level scan deterministic and unit-testable with fixtures.
//
// Identity is the Shopify numeric product id (stable across renames), with the
// handle retained because it determines the product URL. Titles are never used
// as identity because they can be renamed.

import { createHash } from "node:crypto";

/** The subset of a Shopify collection product we read. */
export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  /** ISO timestamp the product was created (may precede publication). */
  created_at?: string | null;
  /** ISO timestamp the product was published, or null while unpublished. */
  published_at?: string | null;
  /** Product description HTML; our proxy for timing-relevant page content. */
  body_html?: string | null;
  tags?: string[];
  variants?: Array<{ available?: boolean }>;
};

/** A normalized product reduced to the fields relevant to Tap Planner. */
export type RelevantProduct = {
  id: number;
  handle: string;
  title: string;
  createdAt: string | null;
  publishedAt: string | null;
  available: boolean;
  /** Deterministic fingerprint of the relevant fields (see `fingerprint`). */
  fingerprint: string;
};

/** One product's persisted discovery state (see data/pinter-product-state.json). */
export type ProductState = {
  id: number;
  handle: string;
  title: string;
  publishedAt: string | null;
  available: boolean;
  fingerprint: string;
  /**
   * Set when the product is published but its required timing specs could not
   * be extracted yet. Pending products are never added to the planner catalog
   * and are always re-checked on the next scan, so they are never treated as
   * permanently processed.
   */
  pending?: boolean;
};

/** The on-disk shape of the discovery state file. */
export type DiscoveryState = {
  products: ProductState[];
};

/** Why a product needs processing. Drives the human-readable scan log. */
export type ChangeReason =
  | "new-product"
  | "handle-changed"
  | "title-changed"
  | "newly-published"
  | "became-available"
  | "became-unavailable"
  | "content-changed"
  | "pending-retry";

export type ClassifiedProduct = {
  product: RelevantProduct;
  status: "new" | "changed" | "unchanged";
  reasons: ChangeReason[];
};

export type ScanClassification = {
  all: ClassifiedProduct[];
  toProcess: ClassifiedProduct[];
  /** IDs present in state but absent from the current collection. */
  removedIds: number[];
  counts: {
    discovered: number;
    known: number;
    new: number;
    changed: number;
    unchanged: number;
    removed: number;
  };
};

// Titles that are sold in the collection but are not BrewPacks themselves.
function isBrewPackTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();

  if (!normalized || normalized === "pinter pack") {
    return false;
  }

  return !normalized.includes("bundle") && !normalized.includes("glass");
}

/** Keep only the Shopify products that represent an actual BrewPack. */
export function selectBrewPackProducts(
  products: ShopifyProduct[],
): ShopifyProduct[] {
  const seenIds = new Set<number>();
  const result: ShopifyProduct[] = [];

  for (const product of products) {
    if (
      typeof product?.id !== "number" ||
      typeof product.title !== "string" ||
      typeof product.handle !== "string" ||
      !product.title.trim() ||
      !product.handle.trim() ||
      !isBrewPackTitle(product.title)
    ) {
      continue;
    }

    // A product can appear in more than one collection; keep the first by id.
    if (seenIds.has(product.id)) {
      continue;
    }

    seenIds.add(product.id);
    result.push(product);
  }

  return result;
}

/** True when any variant is available for sale. */
export function isAvailable(product: ShopifyProduct): boolean {
  return (product.variants ?? []).some((variant) => variant?.available === true);
}

// Collapse whitespace so trivial formatting changes in the description do not
// register as content changes, while real copy edits still do.
function normalizeContent(html: string | null | undefined): string {
  return (html ?? "").replace(/\s+/g, " ").trim();
}

// Tags that classify the product (style, hopper, etc). Marketing/inventory tags
// are not part of Shopify's `tags` array, so the whole sorted set is relevant.
function relevantTags(product: ShopifyProduct): string[] {
  return [...(product.tags ?? [])].map((tag) => tag.trim()).sort();
}

/**
 * Deterministic fingerprint of the fields Tap Planner cares about: id, handle,
 * title, published_at, availability, description content, and classification
 * tags. Irrelevant storefront data (cart, subscription plans, inventory counts,
 * prices) is deliberately excluded so it never triggers reprocessing.
 */
export function fingerprint(product: ShopifyProduct): string {
  const material = JSON.stringify({
    id: product.id,
    handle: product.handle,
    title: product.title.trim(),
    publishedAt: product.published_at ?? null,
    available: isAvailable(product),
    content: normalizeContent(product.body_html),
    tags: relevantTags(product),
  });

  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/** Reduce a Shopify product to its relevant fields plus a fingerprint. */
export function toRelevant(product: ShopifyProduct): RelevantProduct {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title.trim(),
    createdAt: product.created_at ?? null,
    publishedAt: product.published_at ?? null,
    available: isAvailable(product),
    fingerprint: fingerprint(product),
  };
}

/** A product is only a candidate for the planner once it is published. */
export function isPublished(product: RelevantProduct): boolean {
  return product.publishedAt !== null && product.publishedAt !== undefined;
}

// Work out precisely why a known product changed, for the scan log.
function changeReasons(
  current: RelevantProduct,
  known: ProductState,
): ChangeReason[] {
  const reasons: ChangeReason[] = [];

  if (current.handle !== known.handle) {
    reasons.push("handle-changed");
  }

  if (current.title !== known.title) {
    reasons.push("title-changed");
  }

  if (isPublished(current) && !known.publishedAt) {
    reasons.push("newly-published");
  }

  if (current.available && !known.available) {
    reasons.push("became-available");
  }

  if (!current.available && known.available) {
    reasons.push("became-unavailable");
  }

  // Fingerprint differs but none of the specific reasons above fired: the
  // description content or classification tags changed.
  if (current.fingerprint !== known.fingerprint && reasons.length === 0) {
    reasons.push("content-changed");
  }

  return reasons;
}

/**
 * Classify the current collection against known discovery state. A product
 * needs processing when it is new, its relevant fingerprint changed, or it was
 * left pending (incomplete timing) on a previous scan. Unpublished products are
 * never selected for processing here — the caller treats them as pending.
 */
export function classifyProducts(
  currentProducts: ShopifyProduct[],
  state: DiscoveryState,
): ScanClassification {
  const brewPacks = selectBrewPackProducts(currentProducts).map(toRelevant);
  const knownById = new Map(state.products.map((entry) => [entry.id, entry]));
  const currentIds = new Set(brewPacks.map((product) => product.id));

  const all: ClassifiedProduct[] = brewPacks.map((product) => {
    const known = knownById.get(product.id);

    if (!known) {
      return { product, status: "new", reasons: ["new-product"] };
    }

    const reasons = changeReasons(product, known);

    if (known.pending) {
      // Always retry a pending product until it is complete, regardless of
      // whether its collection metadata changed.
      if (!reasons.includes("pending-retry")) {
        reasons.push("pending-retry");
      }
    }

    return {
      product,
      status: reasons.length > 0 ? "changed" : "unchanged",
      reasons,
    };
  });

  const toProcess = all.filter((entry) => entry.status !== "unchanged");
  const removedIds = state.products
    .map((entry) => entry.id)
    .filter((id) => !currentIds.has(id));

  return {
    all,
    toProcess,
    removedIds,
    counts: {
      discovered: brewPacks.length,
      known: state.products.length,
      new: all.filter((entry) => entry.status === "new").length,
      changed: all.filter((entry) => entry.status === "changed").length,
      unchanged: all.filter((entry) => entry.status === "unchanged").length,
      removed: removedIds.length,
    },
  };
}

/**
 * Build a fresh, deterministic state array from the current products. `pending`
 * ids are flagged so future scans keep retrying them. Sorted by id so the
 * serialized file is stable and a no-change scan produces no diff.
 */
export function buildState(
  products: ShopifyProduct[],
  pendingIds: Iterable<number> = [],
): DiscoveryState {
  const pending = new Set(pendingIds);

  const entries: ProductState[] = selectBrewPackProducts(products)
    .map((product) => {
      const relevant = toRelevant(product);
      const entry: ProductState = {
        id: relevant.id,
        handle: relevant.handle,
        title: relevant.title,
        publishedAt: relevant.publishedAt,
        available: relevant.available,
        fingerprint: relevant.fingerprint,
      };

      if (pending.has(relevant.id)) {
        entry.pending = true;
      }

      return entry;
    })
    .sort((a, b) => a.id - b.id);

  return { products: entries };
}

/** Serialize state deterministically (stable key order, trailing newline). */
export function serializeState(state: DiscoveryState): string {
  const products = state.products.map((entry) => {
    const ordered: ProductState = {
      id: entry.id,
      handle: entry.handle,
      title: entry.title,
      publishedAt: entry.publishedAt,
      available: entry.available,
      fingerprint: entry.fingerprint,
    };

    if (entry.pending) {
      ordered.pending = true;
    }

    return ordered;
  });

  return `${JSON.stringify({ products }, null, 2)}\n`;
}

/** Parse a discovery state file, tolerating an empty or missing document. */
export function parseState(raw: string | null | undefined): DiscoveryState {
  if (!raw || !raw.trim()) {
    return { products: [] };
  }

  const data = JSON.parse(raw) as Partial<DiscoveryState>;

  return { products: Array.isArray(data.products) ? data.products : [] };
}
