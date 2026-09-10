import manifest from "@/data/brewpack-images.json";

/**
 * Pack shots captured from Pinter by `pnpm sync:images`.
 *
 * The manifest is retained rather than regenerated: a pack that leaves Pinter's
 * shop keeps the image captured while it was on sale, so discontinued and
 * seasonal brews still get a picture. Packs that were already gone before the
 * first capture have no entry, and the label falls back to generated artwork.
 */
type ImageRecord = {
  file: string;
  thumb?: string;
  src: string;
  sha256: string;
  capturedAt: string;
};

const packs = manifest.packs as Record<string, ImageRecord>;

/** Public path to a pack's full-size shot, or null when none was captured. */
export function getBrewPackImage(id: string): string | null {
  const record = packs[id];

  return record ? `/brewpacks/${record.file}` : null;
}

/**
 * Small copy for list and panel UI. Falls back to the full-size file for
 * manifest entries captured before thumbnails existed, so an older checkout
 * still shows something rather than a broken image.
 */
export function getBrewPackThumb(id: string): string | null {
  const record = packs[id];

  if (!record) {
    return null;
  }

  return `/brewpacks/${record.thumb ?? record.file}`;
}

/** How many packs currently have a captured image. */
export const capturedImageCount = Object.keys(packs).length;
