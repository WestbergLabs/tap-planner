// Focused tests for the BrewPack discovery logic. Pure functions only — no
// network — driven by small Shopify-product fixtures. Run with `pnpm test`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildState,
  classifyProducts,
  fingerprint,
  isAvailable,
  isPublished,
  parseState,
  selectBrewPackProducts,
  serializeState,
  toRelevant,
  type DiscoveryState,
  type ProductState,
  type ShopifyProduct,
} from "./discovery";
import { assertCatalogSafe, type BrewPack } from "../import-brewpacks";

// --- fixtures --------------------------------------------------------------

let nextId = 1000;

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Pack ${id}`,
    handle: `pack-${id}`,
    created_at: "2026-07-01T00:00:00-04:00",
    published_at: "2026-07-02T00:00:00-04:00",
    body_html: "<p>A tasty brew.</p>",
    tags: ["Additional Product Type|Pale Ale"],
    variants: [{ available: true }],
    ...overrides,
  };
}

// A discovery-state entry that matches a product (so it reads as "known").
function knownFrom(p: ShopifyProduct, extra: Partial<ProductState> = {}): ProductState {
  const r = toRelevant(p);
  return {
    id: r.id,
    handle: r.handle,
    title: r.title,
    publishedAt: r.publishedAt,
    available: r.available,
    fingerprint: r.fingerprint,
    ...extra,
  };
}

function stateOf(...entries: ProductState[]): DiscoveryState {
  return { products: entries };
}

function classifyOne(current: ShopifyProduct, known: DiscoveryState) {
  const cls = classifyProducts([current], known);
  return cls.all[0];
}

// --- 1. New product ID detected --------------------------------------------

test("1. new product id is detected as new", () => {
  const fresh = product({ id: 5001, title: "Proper English", handle: "proper-english" });
  const result = classifyOne(fresh, stateOf());
  assert.equal(result.status, "new");
  assert.deepEqual(result.reasons, ["new-product"]);
});

// --- 2. Existing product unchanged -----------------------------------------

test("2. existing unchanged product is unchanged", () => {
  const p = product();
  const result = classifyOne(p, stateOf(knownFrom(p)));
  assert.equal(result.status, "unchanged");
  assert.deepEqual(result.reasons, []);
});

// --- 3. Title changed ------------------------------------------------------

test("3. same id with changed title is a change", () => {
  const before = product({ id: 42, title: "Old Name" });
  const after = product({ id: 42, title: "New Name", handle: before.handle });
  const result = classifyOne(after, stateOf(knownFrom(before)));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("title-changed"));
});

// --- 4. Handle changed -----------------------------------------------------

test("4. same id with changed handle is a change", () => {
  const before = product({ id: 43, handle: "old-handle" });
  const after = product({ id: 43, handle: "new-handle" });
  const result = classifyOne(after, stateOf(knownFrom(before)));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("handle-changed"));
});

// --- 5. Created but not published ------------------------------------------

test("5. created-but-unpublished product is new and not published", () => {
  const draft = product({ id: 44, published_at: null });
  const result = classifyOne(draft, stateOf());
  assert.equal(result.status, "new");
  assert.equal(isPublished(result.product), false);
});

// --- 6. Published after a pending scan -------------------------------------

test("6. product published after a pending scan is reprocessed", () => {
  const draftKnown = knownFrom(product({ id: 45, published_at: null }), { pending: true });
  const nowPublished = product({ id: 45, published_at: "2026-08-01T00:00:00-04:00" });
  const result = classifyOne(nowPublished, stateOf(draftKnown));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("newly-published"));
  assert.ok(result.reasons.includes("pending-retry"));
});

// --- 7. Became available ---------------------------------------------------

test("7. product becoming available is a change", () => {
  const soldOut = knownFrom(product({ id: 46, variants: [{ available: false }] }));
  const inStock = product({ id: 46, variants: [{ available: true }] });
  const result = classifyOne(inStock, stateOf(soldOut));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("became-available"));
});

// --- 8. Became unavailable -------------------------------------------------

test("8. product becoming unavailable is a change", () => {
  const inStock = knownFrom(product({ id: 47, variants: [{ available: true }] }));
  const soldOut = product({ id: 47, variants: [{ available: false }] });
  const result = classifyOne(soldOut, stateOf(inStock));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("became-unavailable"));
  assert.equal(isAvailable(soldOut), false);
});

// --- 9. Duplicate product across inputs ------------------------------------

test("9. duplicate product id across inputs is de-duplicated", () => {
  const p = product({ id: 48 });
  const selected = selectBrewPackProducts([p, { ...p }, p]);
  assert.equal(selected.length, 1);
});

// --- 10. Irrelevant change does not trigger processing ---------------------

test("10. irrelevant metadata change keeps the same fingerprint", () => {
  const base = product({ id: 49 });
  // Same relevant fields; only price / updated_at / inventory differ.
  const noisy = product({
    id: 49,
    variants: [{ available: true }],
  }) as ShopifyProduct & Record<string, unknown>;
  noisy.updated_at = "2026-08-03T00:00:00-04:00";
  noisy.variants = [{ available: true }];
  (noisy.variants[0] as Record<string, unknown>).price = "42.00";
  assert.equal(fingerprint(base), fingerprint(noisy));
  assert.equal(classifyOne(noisy, stateOf(knownFrom(base))).status, "unchanged");
});

// --- 11. Relevant content change triggers verification ---------------------

test("11. description/content change triggers processing", () => {
  const before = product({ id: 50, body_html: "<p>Original copy.</p>" });
  const after = product({ id: 50, body_html: "<p>Reformulated with new hops.</p>" });
  assert.notEqual(fingerprint(before), fingerprint(after));
  const result = classifyOne(after, stateOf(knownFrom(before)));
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("content-changed"));
});

// --- 12. Malformed data does not overwrite valid data ----------------------

test("12. malformed products are skipped, not treated as BrewPacks", () => {
  const malformed = [
    { title: "No id or handle" },
    { id: 51 },
    null,
    "garbage",
  ] as unknown as ShopifyProduct[];
  assert.equal(selectBrewPackProducts(malformed).length, 0);
});

test("12b. the safety guard refuses a suspiciously small catalog", () => {
  const tiny: BrewPack[] = [
    {
      id: "x",
      name: "X",
      style: "Ale",
      recommendedBrewDays: 8,
      recommendedConditioningDays: 5,
      minimumBrewDays: 6,
      minimumConditioningDays: 3,
      abv: 4.5,
      yeast: "Y",
      hopperIncluded: false,
    },
  ];
  assert.throws(() => assertCatalogSafe(tiny), /at least/);
});

// --- 13. Missing timing leaves the product pending -------------------------

test("13. a pending product is flagged in state and always retried", () => {
  const p = product({ id: 52 });
  const state = buildState([p], [52]);
  assert.equal(state.products[0].pending, true);
  // Even with identical metadata, a pending product is reprocessed.
  const result = classifyOne(p, state);
  assert.equal(result.status, "changed");
  assert.ok(result.reasons.includes("pending-retry"));
});

// --- 14. Full scan considers all known products ----------------------------

test("14. classification covers every current product", () => {
  const products = [product(), product(), product({ published_at: null })];
  const cls = classifyProducts(products, stateOf());
  assert.equal(cls.counts.discovered, 3);
  assert.equal(cls.all.length, 3);
  // A full rebuild's state records one entry per current product.
  assert.equal(buildState(products).products.length, 3);
});

// --- 15. No-change scan produces no diff -----------------------------------

test("15. state serialization is deterministic and order-independent", () => {
  const a = product({ id: 60 });
  const b = product({ id: 61 });
  const c = product({ id: 62 });
  const one = serializeState(buildState([a, b, c]));
  const two = serializeState(buildState([c, a, b])); // different input order
  assert.equal(one, two);
  // Round-trips through parse without drift.
  assert.equal(serializeState(parseState(one)), one);
});

// --- removed-from-feed detection (supports quick-scan logging) --------------

test("products in state but absent from the feed are reported as removed", () => {
  const present = product({ id: 70 });
  const gone = knownFrom(product({ id: 71 }));
  const cls = classifyProducts([present], stateOf(knownFrom(present), gone));
  assert.deepEqual(cls.removedIds, [71]);
  assert.equal(cls.counts.removed, 1);
});
