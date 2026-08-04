// Two-level BrewPack discovery scanner.
//
//   pnpm scan:quick   (default)  — gate: fetch the collection once, compare it
//                                   against known discovery state, and only
//                                   scrape/regenerate when something relevant
//                                   changed. No file changes when nothing did.
//   pnpm scan:full                — authority: re-resolve every current product
//                                   and rebuild the catalog + state from scratch
//                                   (the weekly verification).
//
// The quick scan is designed for the steady state: one collection request and
// no writes. When it does find new or changed products it scrapes only those
// products' pages and merges them into the existing catalog. The weekly full
// scan re-verifies everything and reconciles retention, renames, and removals.
//
// All schedule/date logic still lives elsewhere; this script only decides what
// to (re)generate. It never overwrites valid data with an empty result: the
// shared `assertCatalogSafe` guard and atomic writes protect the generated file.

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertCatalogSafe,
  buildCatalog,
  fetchShopProducts,
  fetchSupportPacks,
  resolveShopPacks,
  writeGeneratedFile,
  type BrewPack,
} from "./import-brewpacks";
import {
  buildState,
  classifyProducts,
  parseState,
  serializeState,
  type DiscoveryState,
  type ScanClassification,
  type ShopifyProduct,
} from "./lib/discovery";
import { brewPacks as existingPacks } from "../data/brewpacks.generated";

const STATE_FILE = path.join(process.cwd(), "data", "pinter-product-state.json");

type ScanMode = "quick" | "full";

async function readState(): Promise<DiscoveryState> {
  try {
    return parseState(await readFile(STATE_FILE, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { products: [] };
    }
    throw error;
  }
}

async function writeState(state: DiscoveryState): Promise<void> {
  const tempFile = `${STATE_FILE}.tmp`;
  await writeFile(tempFile, serializeState(state), "utf8");
  await rename(tempFile, STATE_FILE);
}

function byName(a: BrewPack, b: BrewPack): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

// Compact, readable summary of what the scan found and why — without dumping
// the raw Shopify payload into the Actions log.
function logClassification(mode: ScanMode, cls: ScanClassification): void {
  const { counts } = cls;
  console.log(`BrewPack ${mode} scan`);
  console.log(`  products discovered: ${counts.discovered}`);
  console.log(`  known products:      ${counts.known}`);
  console.log(`  new products:        ${counts.new}`);
  console.log(`  changed products:    ${counts.changed}`);
  console.log(`  unchanged products:  ${counts.unchanged}`);
  console.log(`  removed from feed:   ${counts.removed}`);

  if (cls.toProcess.length > 0) {
    console.log("\n  requires processing:");
    for (const entry of cls.toProcess) {
      console.log(
        `    - ${entry.product.title} (${entry.product.handle}, id ${entry.product.id}) — ${entry.reasons.join(", ")}`,
      );
    }
  }

  if (cls.removedIds.length > 0) {
    console.log(
      `\n  no longer in the collection feed: ${cls.removedIds.join(", ")} — the weekly full verification reconciles retention.`,
    );
  }
}

function logPending(pending: { title: string; missing: string[] }[]): void {
  if (pending.length === 0) return;
  console.log("\n  pending (published but incomplete — kept for retry):");
  for (const p of pending) {
    console.log(`    - ${p.title} [missing: ${p.missing.join(", ")}]`);
  }
}

async function runQuick(products: ShopifyProduct[], cls: ScanClassification): Promise<void> {
  if (cls.toProcess.length === 0) {
    console.log("\nNo new or relevantly changed BrewPacks. No files changed.");
    return;
  }

  // Scrape only the products that are actually new or changed, plus one support
  // request for curated style/hopper/yeast parity with the full build.
  const productById = new Map(products.map((product) => [product.id, product]));
  const changedProducts = cls.toProcess
    .map((entry) => productById.get(entry.product.id))
    .filter((product): product is ShopifyProduct => product !== undefined);

  const supportPacks = await fetchSupportPacks();
  const { packs: resolved, pending } = await resolveShopPacks(
    changedProducts,
    supportPacks,
  );

  // Merge the freshly resolved packs into the existing catalog by slug id,
  // leaving every unchanged pack exactly as committed (no re-scrape, no churn).
  const bySlug = new Map(existingPacks.map((pack) => [pack.id, { ...pack }]));
  for (const pack of resolved) {
    bySlug.set(pack.id, pack);
  }

  const packs = [...bySlug.values()].sort(byName);
  assertCatalogSafe(packs);
  await writeGeneratedFile(packs);
  await writeState(buildState(products, pending.map((p) => p.id)));

  logPending(pending);
  console.log(
    `\nProcessed ${resolved.length} product(s); catalog now has ${packs.length} BrewPacks. Files updated.`,
  );
}

async function runFull(products: ShopifyProduct[]): Promise<void> {
  // Authority pass: re-resolve everything and rebuild catalog + state.
  const { packs, pending, fromShop, retainedFromSupport } = await buildCatalog({
    shopProducts: products,
  });

  assertCatalogSafe(packs);
  await writeGeneratedFile(packs);
  await writeState(buildState(products, pending.map((p) => p.id)));

  logPending(pending);
  console.log(
    `\nVerified full catalog: ${packs.length} BrewPacks (${fromShop} on sale, ${retainedFromSupport.length} retained from support backup). Files rewritten deterministically.`,
  );
}

async function main(): Promise<void> {
  const mode: ScanMode = process.argv.includes("--full") ? "full" : "quick";

  const products = await fetchShopProducts();
  const state = await readState();
  const cls = classifyProducts(products, state);

  logClassification(mode, cls);

  if (mode === "quick") {
    await runQuick(products, cls);
  } else {
    await runFull(products);
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("\nBrewPack scan failed. Existing generated data left untouched.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { main, runQuick, runFull };
