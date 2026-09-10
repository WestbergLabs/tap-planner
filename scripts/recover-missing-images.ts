/**
 * Recover pack shots for packs that left Pinter's store before `sync:images`
 * ever ran, so they have no manifest entry and fall back to generated art.
 *
 * The images are still Pinter's own, from Pinter's own CDN -- same provenance
 * and framing as every other capture. Only the *filename* is missing, because
 * the product is delisted and no longer appears in any collection feed. So:
 *
 *   1. Ask the Wayback Machine for an archived snapshot of the product page.
 *   2. Read the pack shot's filename out of that archived HTML.
 *   3. Fetch the file from Pinter's live CDN, which still serves it.
 *
 * Nothing is taken from the archive itself except the filename. Deliberately
 * NOT a web image search: results there are strangers' photographs of unknown
 * provenance, may be the wrong beer entirely, and would be a worse licence
 * position than using the manufacturer's own image.
 *
 * Manual and re-runnable -- archive.org is often slow or briefly offline, and
 * this only ever needs to run when a pack is missing. It is deliberately not
 * part of the weekly workflow.
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

/** Strip to lowercase alphanumerics, for comparing a filename to a pack name. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Newest archived snapshot timestamp for a product page, or null. */
async function newestSnapshot(handle: string): Promise<string | null> {
  const url =
    `${CDX}?url=pinter.com/products/${handle}` +
    `&output=json&limit=-3&filter=statuscode:200&fl=timestamp`;

  try {
    const text = await fetchTextWithRetry(url, { retries: 1, timeoutMs: 25_000 });
    const rows = JSON.parse(text) as string[][];

    // Row 0 is the header. Take the last (newest) timestamp.
    return rows.length > 1 ? rows[rows.length - 1][0] : null;
  } catch {
    return null;
  }
}

/**
 * Find the pack shot's filename in archived product HTML. Shopify serves it
 * from `/cdn/shop/files/`, and the page also references flags, icons and app
 * assets, so the candidate must look like the pack's own name.
 */
export function findPackShotName(html: string, packName: string): string | null {
  const wanted = normalize(packName);
  const seen = new Set<string>();

  // Shopify embeds these both plainly and JSON-escaped (`\/`). The full-size
  // name often appears only in the escaped form, so unescape before matching
  // or you silently end up with the smaller `_grande` variant.
  const flat = html.split(String.fromCharCode(92) + "/").join("/");

  for (const match of flat.matchAll(
    /cdn\/shop\/files\/([A-Za-z0-9_.-]+\.(?:jpg|png))/g,
  )) {
    seen.add(match[1]);
  }

  const candidates = [...seen].filter((file) => {
    const base = normalize(file.replace(/\.(jpg|png)$/i, ""));

    // "BavarianRhapsody2.jpg" -> "bavarianrhapsody2" contains "bavarianrhapsody".
    return base.includes(wanted) && wanted.length > 4;
  });

  if (candidates.length === 0) {
    return null;
  }

  // Prefer the original upload over Shopify's generated size variants.
  const isVariant = (file: string) =>
    /_(?:grande|large|medium|small|compact|icon|pico|thumb|\d+x\d*)\.(?:jpg|png)$/i
      .test(file);

  const originals = candidates.filter((file) => !isVariant(file));
  const pool = originals.length > 0 ? originals : candidates;

  pool.sort((a, b) => a.length - b.length);

  return pool[0];
}

/** Candidate product handles for a catalog id, newest naming first. */
function handlesFor(id: string, name: string): string[] {
  const fromName = normalize(name);

  return [...new Set([id, id.replace(/-/g, ""), fromName])];
}

async function main(): Promise<void> {
  const { packs } = await buildCatalog();
  const manifest = await readManifest();

  await mkdir(IMAGE_DIR, { recursive: true });

  const missing = packs.filter((pack) => !manifest.packs[pack.id]);

  console.log(`Catalog packs:   ${packs.length}`);
  console.log(`Missing an image: ${missing.length}\n`);

  const recovered: string[] = [];
  const failed: string[] = [];

  for (const pack of missing) {
    let done = false;

    for (const handle of handlesFor(pack.id, pack.name)) {
      if (done) {
        break;
      }

      const timestamp = await newestSnapshot(handle);

      if (!timestamp) {
        continue;
      }

      let html: string;

      try {
        html = await fetchTextWithRetry(
          `https://web.archive.org/web/${timestamp}id_/https://pinter.com/products/${handle}`,
          { retries: 1, timeoutMs: 45_000 },
        );
      } catch {
        continue;
      }

      const fileName = findPackShotName(html, pack.name);

      if (!fileName) {
        continue;
      }

      // The file itself comes from Pinter, not the archive.
      const source = `https://pinter.com/cdn/shop/files/${fileName}`;

      try {
        const [bytes, thumbBytes] = await Promise.all([
          fetchBytesWithRetry(sizedUrl(source, IMAGE_WIDTH)),
          fetchBytesWithRetry(sizedUrl(source, THUMB_WIDTH)),
        ]);

        if (bytes.length === 0 || thumbBytes.length === 0) {
          throw new Error("empty response body");
        }

        const extension = fileName.toLowerCase().endsWith(".png") ? "png" : "jpg";
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

        recovered.push(`${pack.name} (${fileName}, via ${handle})`);
        done = true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failed.push(`${pack.name}: CDN rejected ${fileName} — ${detail}`);
        done = true;
      }
    }

    if (!done) {
      failed.push(`${pack.name}: no archived product page found`);
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
