// Focused tests for the release-timeline logic. Pure functions only — no
// network — driven by small Shopify-product fixtures. Run with `pnpm test`.
//
// The date rules are the part of this feature most likely to break quietly: a
// wrong threshold does not throw, it just publishes a confidently wrong date.
// Several cases below are pinned to real packs so a regression is obvious.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertTimelineSafe,
  buildRelease,
  findBulkCreationDays,
  normalizeName,
  selectPackProducts,
  sortReleases,
  toBadges,
  toFlavors,
  type BrewPackRelease,
  type CatalogPack,
  type StoreProduct,
} from "./release-history";

// --- fixtures --------------------------------------------------------------

let nextId = 5000;

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: overrides.id ?? nextId++,
    title: overrides.title ?? "Test Pack",
    handle: overrides.handle ?? "test-pack",
    product_type: "Press",
    created_at: "2025-01-01T00:00:00-05:00",
    published_at: "2025-01-05T00:00:00-05:00",
    variants: [{ available: true }],
    ...overrides,
  };
}

function pack(overrides: Partial<CatalogPack> = {}): CatalogPack {
  return {
    id: "test-pack",
    name: "Test Pack",
    style: "IPA",
    abv: 5,
    ...overrides,
  };
}

// --- date estimation -------------------------------------------------------

test("uses published_at as the release date, not the earlier draft date", () => {
  // Adnams Ghost Ship: drafted May 30, actually went on sale Jul 10.
  const release = buildRelease(
    pack(),
    product({
      created_at: "2025-05-30T00:00:00-04:00",
      published_at: "2025-07-10T00:00:00-04:00",
    }),
  );

  assert.equal(release.releaseDate, "2025-07-10");
  assert.equal(release.precision, "day");
  assert.equal(release.reissuedOn, null);
});

test("treats a far-later published_at as a re-release and falls back to created_at", () => {
  // All American Haze: created Aug 2025, re-published Feb 2026.
  const release = buildRelease(
    pack(),
    product({
      created_at: "2025-08-05T00:00:00-04:00",
      published_at: "2026-02-19T00:00:00-05:00",
    }),
  );

  assert.equal(release.releaseDate, "2025-08-05");
  assert.equal(release.precision, "month", "a reissue must not claim a day");
  assert.equal(release.reissuedOn, "2026-02-19");
});

test("a long draft period just under the threshold is not a re-release", () => {
  // Ancestor's sat 92 days as a draft — the longest normal gap observed.
  const release = buildRelease(
    pack(),
    product({
      created_at: "2023-10-25T00:00:00-04:00",
      published_at: "2024-01-25T00:00:00-05:00",
    }),
  );

  assert.equal(release.releaseDate, "2024-01-25");
  assert.equal(release.precision, "day");
  assert.equal(release.reissuedOn, null);
});

test("published_at earlier than created_at is a migration, not a re-release", () => {
  // Dark Matter kept its original Sep 2023 publish date through the Oct 2023
  // store move, so the earlier timestamp is the trustworthy one.
  const release = buildRelease(
    pack(),
    product({
      created_at: "2023-10-02T00:00:00-04:00",
      published_at: "2023-09-18T00:00:00-04:00",
    }),
  );

  assert.equal(release.releaseDate, "2023-09-18");
  assert.equal(release.reissuedOn, null);
});

test("a bulk creation day caps precision at the month", () => {
  const migrationDay = "2023-10-02T00:00:00-04:00";
  const products = Array.from({ length: 6 }, () =>
    product({ created_at: migrationDay }),
  );

  const bulkDays = findBulkCreationDays(products);
  assert.ok(bulkDays.has("2023-10-02"));

  const release = buildRelease(
    pack(),
    product({ created_at: migrationDay, published_at: "2023-10-27T00:00:00-04:00" }),
    bulkDays,
  );

  assert.equal(release.releaseDate, "2023-10-27");
  assert.equal(release.precision, "month");
});

test("an ordinary shared creation day is not treated as a bulk event", () => {
  // Three packs created together is a normal batch, not a store migration.
  const products = Array.from({ length: 3 }, () =>
    product({ created_at: "2024-08-27T00:00:00-04:00" }),
  );

  assert.equal(findBulkCreationDays(products).size, 0);
});

test("a pack with no store record is undated rather than dropped", () => {
  const release = buildRelease(pack({ name: "Dog House" }), null);

  assert.equal(release.releaseDate, null);
  assert.equal(release.precision, "unknown");
  assert.equal(release.status, "unavailable");
});

test("a discontinued catalog pack keeps that status even when still listed", () => {
  const release = buildRelease(
    pack({ discontinued: true }),
    product({ variants: [{ available: true }] }),
  );

  assert.equal(release.status, "discontinued");
});

test("status reflects variant availability", () => {
  assert.equal(
    buildRelease(pack(), product({ variants: [{ available: false }] })).status,
    "unavailable",
  );
  assert.equal(
    buildRelease(pack(), product({ variants: [{ available: true }] })).status,
    "available",
  );
});

// --- product selection -----------------------------------------------------

test("selects Press products and rejects merch and bundles", () => {
  const products = [
    product({ title: "Sport Beer", product_type: "Press" }),
    product({ title: "Deep Gray Pinter", product_type: "Pinter" }),
    product({ title: "$50 Digital Gift Card", product_type: "Gift Card" }),
    product({ title: "Shadow & Cream Bundle", product_type: "Press" }),
    product({ title: "Super Cluster Remixed + Glass Bundle", product_type: "Press" }),
  ];

  const selected = selectPackProducts(products).map((p) => p.title);
  assert.deepEqual(selected, ["Sport Beer"]);
});

test("normalizeName matches across curly quotes and suffix punctuation", () => {
  assert.equal(
    normalizeName("Iron Maiden’s Trooper Remixed"),
    normalizeName("Iron Maiden's Trooper Remixed"),
  );
  assert.equal(normalizeName("Pear With Me"), normalizeName("Pear with me"));
});

// --- tag extraction -----------------------------------------------

test("toFlavors reads Icons tags, drops intensity digits, and dedupes", () => {
  assert.deepEqual(
    toFlavors([
      "Icons|malt 1",
      "Icons|malt 2",
      "Icons|full bodied",
      "Vegan",
      "Filter Product Type|Fresh Beer",
    ]),
    ["full bodied", "malt"],
  );
});

test("toFlavors and toBadges accept the comma-string tag form", () => {
  // The store feed returns an array; single-product endpoints return a string.
  assert.deepEqual(toFlavors("Icons|clean, Icons|crisp, Vegan"), [
    "clean",
    "crisp",
  ]);
  assert.deepEqual(toBadges("Vegan, Contains Gluten, funnel_default"), [
    "Vegan",
    "Contains Gluten",
  ]);
});

// --- ordering and safety ---------------------------------------------------

test("sortReleases orders newest first and puts undated packs last", () => {
  const releases = [
    { name: "Older", releaseDate: "2024-01-01" },
    { name: "Undated", releaseDate: null },
    { name: "Newer", releaseDate: "2026-01-01" },
  ] as BrewPackRelease[];

  assert.deepEqual(
    sortReleases(releases).map((release) => release.name),
    ["Newer", "Older", "Undated"],
  );
});

test("assertTimelineSafe rejects a suspiciously small timeline", () => {
  const tiny = [{ releaseDate: "2026-01-01" }] as BrewPackRelease[];
  assert.throws(() => assertTimelineSafe(tiny), /Expected at least/);

  const healthy = Array.from({ length: 30 }, () => ({
    releaseDate: "2026-01-01",
  })) as BrewPackRelease[];
  assert.doesNotThrow(() => assertTimelineSafe(healthy));
});

test("undated packs do not count toward the safety minimum", () => {
  const mostlyUndated = Array.from({ length: 40 }, (_, index) => ({
    releaseDate: index < 5 ? "2026-01-01" : null,
  })) as BrewPackRelease[];

  assert.throws(() => assertTimelineSafe(mostlyUndated), /only 5 dated packs/);
});
