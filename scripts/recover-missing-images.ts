/**
 * Recover pack shots for packs that left Pinter's main store before
 * `sync:images` ever ran, so they have no manifest entry and fall back to
 * generated art.
 *
 * These are still Pinter's own images from Pinter's own servers -- same
 * provenance and framing as every other capture. What is missing is only the
 * *filename*, because a delisted pack appears in no collection feed. Three
 * places still name it, tried in this order:
 *
 *   1. `pinter.com/blogs/news/<handle>` -- the announcement post usually
 *      carries the same `<Name>_03.jpg` shot the product page used. Live and
 *      fast, so it goes first.
 *   2. `pinterdirect.shop/products/<handle>` -- Pinter's direct store, which
 *      keeps packs the main Shopify storefront has dropped.
 *   3. A Wayback snapshot of `pinter.com/products/<handle>` -- last resort,
 *      and only the filename is read from it; the image itself still comes
 *      from Pinter.
 *
 * Deliberately NOT web image search: those results are strangers' photographs
 * of unknown provenance, frequently the wrong beer, and a worse licence
 * position than the manufacturer's own photo.
 *
 * Manual and re-runnable -- archive.org is often slow or briefly offline, and
 * this only needs to run when a pack is missing. Not part of any workflow.
 *
 * Run with `pnpm recover:images`.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildCatalog } from "./import-brewpacks";
import { fetchBytesWithRetry, fetchTextWithRetry } from "./lib/http";
import { readManifest, sizedUrl } from "./sync-brewpack-images";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FILE = path.join(ROOT, "data", "brewpack-images.json");
const IMAGE_DIR = path.join(ROOT, "public", "brewpacks");

const IMAGE_WIDTH = 700;
const THUMB_WIDTH = 160;

const CDX = "http://web.archive.org/cdx/search/cdx";
const SHOPIFY_FILES = "https://pinter.com/cdn/shop/files/";

/** Strip to lowercase alphanumerics, for loose filename comparison. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shopify's generated size variants, which we never want over the original. */
function isSizeVariant(fileName: string): boolean {
  return /_(?:grande|large|medium|small|compact|icon|pico|thumb|[0-9]+x[0-9]*)[.](?:jpg|jpeg|png)$/i.test(
    fileName,
  );
}

/**
 * Absolute URLs of every plausible pack shot on a page.
 *
 * Two shapes, because the sources are two different platforms: Shopify serves
 * from `/cdn/shop/files/<name>` (product pages) or `/s/files/<store>/files/
 * <name>` (the blog), while the direct store serves plain `/images/.../
 * product/<name>` paths.
 */
export function packShotUrls(html: string, origin: string): string[] {
  // Both platforms embed URLs JSON-escaped as well as plainly, and the
  // full-size name often appears only in the escaped form -- miss this and you
  // silently take Shopify's smaller `_grande` variant instead.
  const flat = html.split(String.fromCharCode(92) + "/").join("/");
  const urls = new Set<string>();

  const shopify = new RegExp("files/([A-Za-z0-9_.-]+[.](?:jpg|jpeg|png))", "g");

  for (const match of flat.matchAll(shopify)) {
    urls.add(SHOPIFY_FILES + match[1]);
  }

  const direct = new RegExp(
    "(/images/[A-Za-z0-9_./-]*product/[A-Za-z0-9_.-]+[.](?:jpg|jpeg|png))",
    "g",
  );

  for (const match of flat.matchAll(direct)) {
    urls.add(new URL(match[1], origin).toString());
  }

  return [...urls];
}

/**
 * Pick the URL whose filename looks like this pack.
 *
 * Matched against the handle as well as the pack name: the direct store names
 * files after the handle ("winters-slumber-1.jpg"), which does not contain the
 * full catalog name ("Winter's Slumber (Christmas Ale)").
 */
export function choosePackShot(
  urls: string[],
  packName: string,
  handle: string,
): string | null {
  const keys = [normalize(handle), normalize(packName)].filter(
    (key) => key.length > 4,
  );

  const scored = urls.filter((url) => {
    const fileName = url.split("/").pop() ?? "";
    const base = normalize(fileName.replace(/[.](?:jpg|jpeg|png)$/i, ""));

    return keys.some((key) => base.includes(key));
  });

  if (scored.length === 0) {
    return null;
  }

  const originals = scored.filter(
    (url) => !isSizeVariant(url.split("/").pop() ?? ""),
  );
  const pool = originals.length > 0 ? originals : scored;

  pool.sort((a, b) => a.length - b.length);

  return pool[0];
}

/** Newest archived snapshot timestamp for a product page, or null. */
async function newestSnapshot(handle: string): Promise<string | null> {
  const url =
    `${CDX}?url=pinter.com/products/${handle}` +
    `&output=json&limit=-3&filter=statuscode:200&fl=timestamp`;

  try {
    const text = await fetchTextWithRetry(url, {
      retries: 1,
      timeoutMs: 25_000,
    });
    const rows = JSON.parse(text) as string[][];

    return rows.length > 1 ? rows[rows.length - 1][0] : null;
  } catch {
    return null;
  }
}

type Page = { source: string; html: string; origin: string };

/** Pages that might name the pack shot, cheapest and most reliable first. */
async function candidatePages(handle: string): Promise<Page[]> {
  const pages: Page[] = [];

  const live: { source: string; url: string; origin: string }[] = [
    {
      source: `blog/${handle}`,
      url: `https://pinter.com/blogs/news/${handle}`,
      origin: "https://pinter.com",
    },
    {
      source: `direct/${handle}`,
      url: `https://pinterdirect.shop/products/${handle}`,
      origin: "https://pinterdirect.shop",
    },
  ];

  for (const entry of live) {
    try {
      pages.push({
        source: entry.source,
        origin: entry.origin,
        html: await fetchTextWithRetry(entry.url, {
          retries: 0,
          timeoutMs: 25_000,
        }),
      });
    } catch {
      // No such page here; try the next source.
    }
  }

  const timestamp = await newestSnapshot(handle);

  if (timestamp) {
    try {
      pages.push({
        source: `archive/${handle}`,
        origin: "https://pinter.com",
        html: await fetchTextWithRetry(
          `https://web.archive.org/web/${timestamp}id_/https://pinter.com/products/${handle}`,
          { retries: 1, timeoutMs: 45_000 },
        ),
      });
    } catch {
      // Archive slow or offline; re-running later is safe.
    }
  }

  return pages;
}

/** Candidate product handles for a catalog id. */
function handlesFor(id: string, name: string): string[] {
  return [...new Set([id, id.replace(/-/g, ""), normalize(name)])];
}

async function main(): Promise<void> {
  const { packs } = await buildCatalog();
  const manifest = await readManifest();

  await mkdir(IMAGE_DIR, { recursive: true });

  const missing = packs.filter((pack) => !manifest.packs[pack.id]);

  console.log(`Catalog packs:    ${packs.length}`);
  console.log(`Missing an image: ${missing.length}\n`);

  const recovered: string[] = [];
  const notes: string[] = [];
  const failed: string[] = [];

  for (const pack of missing) {
    let done = false;

    for (const handle of handlesFor(pack.id, pack.name)) {
      if (done) {
        break;
      }

      for (const page of await candidatePages(handle)) {
        if (done) {
          break;
        }

        const source = choosePackShot(
          packShotUrls(page.html, page.origin),
          pack.name,
          handle,
        );

        if (!source) {
          continue;
        }

        try {
          const [bytes, thumbBytes] = await Promise.all([
            fetchBytesWithRetry(sizedUrl(source, IMAGE_WIDTH)),
            fetchBytesWithRetry(sizedUrl(source, THUMB_WIDTH)),
          ]);

          if (bytes.length === 0 || thumbBytes.length === 0) {
            throw new Error("empty response body");
          }

          // Only Shopify honours `width`. When a host ignores it the two
          // fetches come back identical, so say so rather than shipping a
          // full-size file as a thumbnail without comment.
          if (thumbBytes.length === bytes.length) {
            notes.push(
              `${pack.name}: host ignores resizing, thumbnail is full size ` +
                `(${Math.round(bytes.length / 1024)}KB)`,
            );
          }

          const extension = /[.]png$/i.test(source) ? "png" : "jpg";
          const file = `${pack.id}.${extension}`;
          const thumb = `${pack.id}.thumb.${extension}`;

          await writeFile(path.join(IMAGE_DIR, file), bytes);
          await writeFile(path.join(IMAGE_DIR, thumb), thumbBytes);

          manifest.packs[pack.id] = {
            file,
            thumb,
            src: source,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            productId: pack.shopProductId,
            name: pack.name,
            capturedAt: new Date().toISOString().slice(0, 10),
          };

          recovered.push(
            `${pack.name} (${source.split("/").pop()}, via ${page.source})`,
          );
          done = true;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          failed.push(`${pack.name}: ${source} — ${detail}`);
          done = true;
        }
      }
    }

    if (!done) {
      failed.push(`${pack.name}: no page found naming its pack shot`);
    }
  }

  // Sorted on write so the committed manifest diffs cleanly.
  const sorted: typeof manifest.packs = {};

  for (const id of Object.keys(manifest.packs).sort()) {
    sorted[id] = manifest.packs[id];
  }

  await writeFile(
    MANIFEST_FILE,
    `${JSON.stringify({ packs: sorted }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Recovered: ${recovered.length}`);

  for (const entry of recovered) {
    console.log(`  + ${entry}`);
  }

  for (const note of notes) {
    console.log(`  ! ${note}`);
  }

  if (failed.length > 0) {
    console.log(`\nStill missing: ${failed.length}`);

    for (const entry of failed) {
      console.log(`  - ${entry}`);
    }

    console.log(
      "\narchive.org is often slow or briefly offline. Re-running later is safe;" +
        "\nanything still missing keeps its generated artwork.",
    );
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
