import LabelArt from "@/components/LabelArt";
import { getBrewPackThumb } from "@/lib/brewpackImages";
import { getStyleProfile } from "@/lib/labels";

/**
 * Square pack shot for panels that show a chosen BrewPack.
 *
 * Falls back to the same style-derived artwork the label printer uses, so a
 * pack with no captured photo still gets something intentional rather than an
 * empty box. That keeps every row in a lineup the same shape.
 */
export default function PackThumb({
  packId,
  style,
  size = 56,
  className = "",
}: {
  /** Catalog id. Custom recipes pass null and always get generated art. */
  packId: string | null;
  /** Beer style, used to pick the fallback artwork. */
  style: string;
  /** Rendered edge length in pixels. */
  size?: number;
  className?: string;
}) {
  const src = packId ? getBrewPackThumb(packId) : null;
  const profile = getStyleProfile(style);

  const shared = `shrink-0 overflow-hidden rounded-xl border border-border ${className}`;

  if (src) {
    return (
      // Plain <img> on purpose: `sync:images` already captured these at 160px
      // (~5KB each), so next/image would add an optimisation round trip and,
      // on Vercel, billable transformations to shave nothing off.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`${shared} object-cover`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={shared}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id={`thumb-${profile.key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={profile.beerTop} />
          <stop offset="100%" stopColor={profile.beerBottom} />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#thumb-${profile.key})`} />

      <g transform="translate(14 14) scale(0.72)">
        <LabelArt motif={profile.motif} ink={profile.motifInk} />
      </g>
    </svg>
  );
}
