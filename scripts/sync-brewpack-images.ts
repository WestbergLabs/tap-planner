/**
 * Download Pinter pack shots for the BrewPack catalog.
 *
 * Why this is a separate, retained manifest rather than a catalog field:
 * `buildCatalog` rebuilds a pack from Pinter's *support page* once it leaves
 * the shop feed, and the support page carries no imagery. A field on the
 * generated catalog would therefore be erased the moment a pack was
 * discontinued -- precisely the packs we most want to keep a picture of.
 *
 * So this manifest is append/update-only. An image captured while a pack was
 * on sale is kept forever, even after the pack disappears from Pinter
 * entirely. Nothing here ever deletes.
 *
 * Run with `pnpm sync:images`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildCatalog } from "./import-brewpacks";
import { fetchBytesWithRetry } from "./lib/http";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FILE = path.join(ROOT, "data", "brewpack-images.json");
const IMAGE_DIR = path.join(ROOT, "public", "brewpacks");

/**
 * Width requested from Shopify's CDN. The label art panel is under 4in wide,
 * so 700px is beyond what 300dpi printing needs while keeping each file around
 * 70KB rather than the 1800px original's ~400KB.
 */
const IMAGE_WIDTH = 700;

/**
 * A second, much smaller copy for list UI. The pickers show a row of packs at
 * once, and 700px shots would be roughly 180KB each; at 160px they are ~5KB, so
 * a whole dropdown costs less than one full pack shot.
 */
const THUMB_WIDTH = 160;

export type ImageRecord = {
  /** File name inside `public/brewpacks/`. */
  file: string;
  /** Small copy of the same shot, for pickers and lists. */
  thumb: string;
  /** Source URL this was captured from, used to detect replaced artwork. */
  src: string;
  /** SHA-256 of the stored bytes, so a re-run can verify without re-fetching. */
  sha256: string;
  /** ISO date the image was first captured or last replaced. */
  capturedAt: string;
};

export type ImageManifest = {
  packs: Record<string, ImageRecord>;
};

const EMPTY: ImageManifest = { packs: {} };

export async function readManifest(): Promise<ImageManifest> {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_FILE, "utf8"));

    return parsed && typeof parsed === "object" && parsed.packs
      ? (parsed as ImageManifest)
      : EMPTY;
  } catch {
    // First run, or the file was removed. Starting empty is correct; existing
    // image files on disk are re-recorded as they are re-fetched.
    return EMPTY;
  }
}

/** Sorted on write so the committed manifest diffs cleanly in a pull request. */
async function writeManifest(manifest: ImageManifest): Promise<void> {
  const packs: Record<string, ImageRecord> = {};

  for (const id of Object.keys(manifest.packs).sort()) {
    packs[id] = manifest.packs[id];
  }

  await writeFile(
    MANIFEST_FILE,
    `${JSON.stringify({ packs }, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Ask Shopify's CDN for a resized copy. The CDN honours `width` as a query
 * parameter, which avoids shipping an image-processing dependency and keeps
 * the GitHub Action free of native builds.
 */
export function sizedUrl(src: string, width = IMAGE_WIDTH): string {
  const url = new URL(src);
  url.searchParams.set("width", String(width));

  return url.toString();
}

/** `.jpg` unless the source is clearly a PNG; Pinter mixes both. */
export function fileNameFor(id: string, src: string): string {
  const extension = new URL(src).pathname.toLowerCase().endsWith(".png")
    ? "png"
    : "jpg";

  return `${id}.${extension}`;
}

/** Thumbnail name for a pack, alongside the full-size file. */
export function thumbNameFor(id: string, src: string): string {
  return fileNameFor(id, src).replace(/\.(jpg|png)$/, ".thumb.$1");
}

async function main(): Promise<void> {
  const { packs } = await buildCatalog();
  const manifest = await readManifest();

  await mkdir(IMAGE_DIR, { recursive: true });

  const withSource = packs.filter((pack) => pack.imageSrc);
  const added: string[] = [];
  const replaced: string[] = [];
  const failed: string[] = [];

  for (const pack of withSource) {
    const src = pack.imageSrc as string;
    const existing = manifest.packs[pack.id];

    // Only re-fetch when there is nothing yet, or Pinter swapped the artwork.
    if (existing && existing.src === src && existing.thumb) {
      continue;
    }

    const file = fileNameFor(pack.id, src);
    const thumb = thumbNameFor(pack.id, src);

    try {
      const [bytes, thumbBytes] = await Promise.all([
        fetchBytesWithRetry(sizedUrl(src)),
        fetchBytesWithRetry(sizedUrl(src, THUMB_WIDTH)),
      ]);

      if (bytes.length === 0 || thumbBytes.length === 0) {
        throw new Error("empty response body");
      }

      await writeFile(path.join(IMAGE_DIR, file), bytes);
      await writeFile(path.join(IMAGE_DIR, thumb), thumbBytes);

      manifest.packs[pack.id] = {
        file,
        thumb,
        src,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        capturedAt: new Date().toISOString().slice(0, 10),
      };

      (existing ? replaced : added).push(pack.name);
    } catch (error) {
      // One bad image must not fail the whole run: the rest of the catalog
      // still deserves its pictures, and the next run retries this one.
      const detail = error instanceof Error ? error.message : String(error);
      failed.push(`${pack.name} (${detail})`);
    }
  }

  await writeManifest(manifest);

  const retained = Object.keys(manifest.packs).filter(
    (id) => !withSource.some((pack) => pack.id === id),
  );

  console.log(`Catalog packs:        ${packs.length}`);
  console.log(`With a shop image:    ${withSource.length}`);
  console.log(`Newly captured:       ${added.length}`);
  console.log(`Artwork replaced:     ${replaced.length}`);
  console.log(`Retained (not live):  ${retained.length}`);

  for (const name of added) {
    console.log(`  + ${name}`);
  }

  for (const name of replaced) {
    console.log(`  ~ ${name}`);
  }

  for (const id of retained) {
    console.log(`  = ${id} (kept from an earlier run)`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed (will retry next run): ${failed.length}`);

    for (const detail of failed) {
      console.log(`  ! ${detail}`);
    }
  }

  // A failed download is not a failed run. The manifest is still consistent,
  // and the workflow should open its pull request for whatever did succeed.
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
