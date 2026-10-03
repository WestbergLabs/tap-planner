/**
 * Physical card sizes. Each size is drawn in its own SVG coordinate space:
 * 100 units per inch for the 4x6 family and 200 for the small stock, so text
 * lands at a sensible printed size on each. One `LabelCard` serves them all;
 * portrait cards just gain whitespace, landscape ones swap to a side-by-side
 * layout (art left, text right).
 */
export const CARD_SIZES = [
  { id: "4x6", label: "4×6 in (index card)", widthIn: 4, heightIn: 6, viewW: 400, viewH: 600 },
  { id: "3x4.5", label: "3×4.5 in", widthIn: 3, heightIn: 4.5, viewW: 400, viewH: 600 },
  { id: "2x3.5", label: "2×3.5 in (business card, portrait)", widthIn: 2, heightIn: 3.5, viewW: 400, viewH: 700 },
  { id: "2x3", label: "2×3 in", widthIn: 2, heightIn: 3, viewW: 400, viewH: 600 },
  { id: "3.5x2", label: "3.5×2 in (business card, landscape)", widthIn: 3.5, heightIn: 2, viewW: 700, viewH: 400, artFrac: 0.42 },
  { id: "3x2.5", label: "3×2.5 in (tap handle, landscape)", widthIn: 3, heightIn: 2.5, viewW: 600, viewH: 500, artFrac: 0.45 },
] as const;

export type CardSize = (typeof CARD_SIZES)[number];

/** The perforated business-card sheet is always portrait 2x3.5. */
export const BUSINESS_CARD: CardSize = CARD_SIZES[2];

export function isLandscape(size: CardSize) {
  return size.widthIn > size.heightIn;
}

/** Bleed, in inches past the trim on every side. */
export const BLEED_IN = 0.125;

/** The sheet has no gutters, so its bleed only has to cover registration slop. */
export const SHEET_BLEED_IN = 0.0625;

/** Export resolution: 300dpi at the card's physical size, bleed included. */
export function cardPixels(size: CardSize, bleedIn = 0) {
  return {
    width: (size.widthIn + 2 * bleedIn) * 300,
    height: (size.heightIn + 2 * bleedIn) * 300,
  };
}
