/**
 * Physical card sizes. The card is always 400 units wide; the height follows
 * from the aspect ratio, so one `LabelCard` serves every size and only the
 * amount of middle whitespace changes.
 */
export const CARD_VIEW_WIDTH = 400;

export const CARD_SIZES = [
  { id: "4x6", label: "4×6 in (index card)", widthIn: 4, heightIn: 6 },
  { id: "3x4.5", label: "3×4.5 in", widthIn: 3, heightIn: 4.5 },
  { id: "2x3.5", label: "2×3.5 in (business card, portrait)", widthIn: 2, heightIn: 3.5 },
  { id: "2x3", label: "2×3 in", widthIn: 2, heightIn: 3 },
] as const;

export type CardSize = (typeof CARD_SIZES)[number];

export const BUSINESS_CARD: CardSize = CARD_SIZES[2];

export function viewHeight(size: CardSize) {
  return (CARD_VIEW_WIDTH * size.heightIn) / size.widthIn;
}

/** Export resolution: 300dpi at the card's physical size. */
export function cardPixels(size: CardSize) {
  return { width: size.widthIn * 300, height: size.heightIn * 300 };
}
