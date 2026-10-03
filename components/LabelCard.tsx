import LabelArt from "@/components/LabelArt";
import { CARD_SIZES, type CardSize, isLandscape } from "@/lib/labelSizes";
import { formatAbv, formatLabelDate, getStyleProfile } from "@/lib/labels";

/**
 * A printable 4x6 BrewPack label, drawn entirely as one SVG.
 *
 * Everything -- artwork, headings, data rows -- lives in a single 400x600
 * viewBox (4x6 inches at 100 units per inch). That keeps the on-screen preview
 * and the printed card pixel-identical at any scale, and it sidesteps the
 * browser inconsistencies you hit trying to lay out a physical-size card in
 * CSS inches.
 */

export type LabelFields = {
  name: string;
  style: string;
  abv: string;
  brewedDate: string;
  tappedDate: string;
  batch: string;
  notes: string;
  /**
   * Public path to a Pinter pack shot. When absent -- a custom recipe, or a
   * pack discontinued before images were first captured -- the card falls back
   * to the generated motif so it still looks deliberate.
   */
  image?: string;
};

const CARD_WIDTH = 400;
const MARGIN = 34;
const CONTENT_WIDTH = CARD_WIDTH - MARGIN * 2;

/** Art panel occupies the top ~45% of the card (268 of 600 units). */
const ART_RATIO = 268 / 600;

/**
 * Greedy word wrap for SVG text, which has no automatic line breaking.
 * Width is estimated from an average glyph ratio rather than measured, so it
 * stays deterministic and identical between server and client render.
 */
function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  glyphRatio: number,
): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * glyphRatio)));
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current === "" ? word : `${current} ${word}`;

    if (candidate.length <= maxChars || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current !== "") {
    lines.push(current);
  }

  return lines;
}

/**
 * Choose the largest heading size that fits the name in `maxLines`, so short
 * names print big and long ones stay inside the card instead of overflowing.
 */
function fitHeading(
  name: string,
  maxLines: number,
  width: number,
  sizes: number[],
) {
  for (const fontSize of sizes) {
    const lines = wrapText(name, fontSize, width, 0.66);

    if (lines.length <= maxLines) {
      return { fontSize, lines };
    }
  }

  const fontSize = sizes[sizes.length - 1];

  return {
    fontSize,
    lines: wrapText(name, fontSize, width, 0.66).slice(0, maxLines),
  };
}

export default function LabelCard({
  fields,
  gradientId,
  size = CARD_SIZES[0],
  bleedIn = 0,
}: {
  fields: LabelFields;
  size?: CardSize;
  /**
   * Inches of background painted past the trim on every side, for stock that
   * is cut after printing. Only backgrounds extend: text keeps its position,
   * so it stays inside the safe area.
   */
  bleedIn?: number;
  /** Must be unique per rendered card -- SVG gradient ids are document global. */
  gradientId: string;
}) {
  const CARD_WIDTH = size.viewW;
  const CARD_HEIGHT = size.viewH;
  const landscape = isLandscape(size);
  const B = (bleedIn * CARD_WIDTH) / size.widthIn;

  // Landscape: the art is a full-height panel on the left and the text sits in
  // a column to its right, past the (vertical) foam edge. Portrait: art on top.
  const ART_RIGHT =
    "artFrac" in size ? Math.round(CARD_WIDTH * size.artFrac) : CARD_WIDTH;
  const ART_BOTTOM = landscape
    ? CARD_HEIGHT
    : Math.round(CARD_HEIGHT * ART_RATIO);

  const left = landscape ? ART_RIGHT + 14 + 24 : MARGIN;
  const right = CARD_WIDTH - (landscape ? 30 : MARGIN);
  const textWidth = right - left;
  const profile = getStyleProfile(fields.style);
  const name = fields.name.trim() === "" ? "Untitled Brew" : fields.name.trim();

  const heading = landscape
    ? fitHeading(name.toUpperCase(), CARD_HEIGHT >= 500 ? 3 : 2, textWidth, [
        34, 30, 27, 24, 21, 18,
      ])
    : fitHeading(name.toUpperCase(), 3, CONTENT_WIDTH, [40, 36, 32, 28, 25, 22]);
  const abv = formatAbv(fields.abv);
  const style = fields.style.trim();
  const subtitle = [style, abv].filter((part) => part !== "").join("  ·  ");

  const rows = [
    // Dates always print their field name; a blank one gets a write-in line,
    // so a card can be printed first and filled in by hand after brewing.
    { label: "Brewed", value: formatLabelDate(fields.brewedDate), always: true },
    { label: "Tapped", value: formatLabelDate(fields.tappedDate), always: true },
    { label: "ID", value: fields.batch.trim(), always: false },
  ].filter((row) => row.always || row.value !== "");

  // Tasting notes do not survive the short landscape cards: the tall one
  // keeps two lines, the business card drops them.
  const noteLines = landscape ? (CARD_HEIGHT >= 500 ? 2 : 0) : 3;
  const notes = wrapText(fields.notes.trim(), 13, textWidth, 0.52).slice(0, noteLines);

  // Vertical layout. The title block hangs from the bottom of the artwork and
  // the meta block is anchored to the foot of the card, so slack collects in
  // the middle as deliberate whitespace. Laying everything out top-down
  // instead would push the last note line off a 600-unit card once the name
  // wraps to three lines and every field is filled.
  const headingTop = landscape ? 62 : ART_BOTTOM + 52;
  const headingBottom =
    headingTop + heading.fontSize * 1.02 * (heading.lines.length - 1);

  const subtitleY = headingBottom + 30;
  const titleBottom = subtitle === "" ? headingBottom : subtitleY;

  const NOTE_LINE = 18;
  const ROW_GAP = 30;
  const RULE_TO_ROWS = 30;
  const ROWS_TO_NOTES = 32;

  // The meta block (rule, data rows, notes) is positioned as one unit rather
  // than field by field. It hangs from the foot of the card so the card reads
  // as designed rather than as text that ran out, but the gap below the title
  // is clamped: bottom-anchoring alone left a card with only a tap date
  // showing a ~300 unit void in the middle, which looks like a bug.
  const hasMeta = rows.length > 0 || notes.length > 0;

  const metaHeight =
    (rows.length > 0 ? RULE_TO_ROWS + ROW_GAP * (rows.length - 1) : 0) +
    (notes.length > 0
      ? ROWS_TO_NOTES + NOTE_LINE * (notes.length - 1)
      : 0);

  const MIN_TITLE_GAP = 22;
  // Taller cards (2x3.5) get the extra height as more breathing room.
  const MAX_TITLE_GAP = landscape ? 60 : 92 + (CARD_HEIGHT - 600) / 2;
  const META_FLOOR = CARD_HEIGHT - 36;

  const ruleY = Math.max(
    titleBottom + MIN_TITLE_GAP,
    Math.min(META_FLOOR - metaHeight, titleBottom + MAX_TITLE_GAP),
  );

  const rowsTop = ruleY + RULE_TO_ROWS;
  const notesTop =
    (rows.length > 0 ? rowsTop + ROW_GAP * (rows.length - 1) : ruleY) +
    ROWS_TO_NOTES;

  // The motif is a 100x100 box. Portrait centres it near the top of the card;
  // landscape centres it in the art panel.
  const motifScale = landscape ? (ART_RIGHT / 100) * 0.72 : 1.56;
  const motifTransform = landscape
    ? `translate(${(ART_RIGHT - 100 * motifScale) / 2}, ${(CARD_HEIGHT - 100 * motifScale) / 2}) scale(${motifScale})`
    : `translate(${CARD_WIDTH / 2 - 78}, 30) scale(${motifScale})`;

  // The foam edge: horizontal under the art on portrait cards, vertical beside
  // it on landscape ones. Same scallops, drawn along the other axis.
  const foamPath = landscape
    ? `M${ART_RIGHT - 26} ${-B}v${B}${"c0 34 18 34 18 68s-18 34-18 68 ".repeat(
        Math.ceil(CARD_HEIGHT / 136) + 1,
      )}h40V${-B}Z`
    : `M${-B} ${ART_BOTTOM - 26}h${B}c34 0 34 18 68 18s34-18 68-18 34 18 68 18 34-18 68-18 34 18 68 18 34-18 60-18h${B}v40H${-B}Z`;

  // Backgrounds run to the bleed edge. Landscape art only bleeds on the three
  // outer sides: its right edge is the foam, not the trim.
  const artWidth = ART_RIGHT + B + (landscape ? 0 : B);
  const artHeight = landscape ? CARD_HEIGHT + 2 * B : ART_BOTTOM + B;

  return (
    <svg
      viewBox={`${-B} ${-B} ${CARD_WIDTH + 2 * B} ${CARD_HEIGHT + 2 * B}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Label for ${name}`}
      style={{ display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={profile.beerTop} />
          <stop offset="100%" stopColor={profile.beerBottom} />
        </linearGradient>
      </defs>

      {/* Card face. Explicitly white rather than transparent so the card still
          prints on a white ground when the sheet behind it is not. */}
      <rect x={-B} y={-B} width={CARD_WIDTH + 2 * B} height={CARD_HEIGHT + 2 * B} fill="#ffffff" />

      {/* Artwork panel. */}
      <rect x={-B} y={-B} width={artWidth} height={artHeight} fill={`url(#${gradientId})`} />

      {fields.image ? (
        // Pack shots are square and the panel is 3:2, so something has to give.
        // Full-bleed rather than fitted: fitting leaves the photo's own
        // background colour sitting in a block against the style gradient,
        // which reads as a mistake. Anchored to the top (`YMin`) because these
        // shots put the glass high and the reflection low -- centring the crop
        // takes the head off the beer.
        <image
          href={fields.image}
          x={-B}
          y={-B}
          width={artWidth}
          height={artHeight}
          preserveAspectRatio="xMidYMin slice"
        />
      ) : (
        <g transform={motifTransform}>
          <LabelArt motif={profile.motif} ink={profile.motifInk} />
        </g>
      )}

      {/* Foam head: the artwork panel pours into the body of the card. */}
      <path
        d={foamPath}
        fill={profile.foam}
      />

      {/* Beer name. */}
      {heading.lines.map((line, index) => (
        <text
          key={line + index}
          x={left}
          y={headingTop + heading.fontSize * 1.02 * index}
          fontSize={heading.fontSize}
          fontWeight="700"
          letterSpacing="-0.5"
          fill="#1d1c1a"
        >
          {line}
        </text>
      ))}

      {subtitle !== "" && (
        <text
          x={left}
          y={subtitleY}
          fontSize="15"
          fontWeight="600"
          letterSpacing="1.6"
          fill="#b75c2b"
        >
          {subtitle.toUpperCase()}
        </text>
      )}

      {/* The rule separates the title from the data below it, so it is only
          drawn when there is data. Otherwise a name-only card ends on a
          floating line with nothing beneath it. */}
      {hasMeta && (
        <line
          x1={left}
          y1={ruleY}
          x2={right}
          y2={ruleY}
          stroke="#d8d1c5"
          strokeWidth="2"
        />
      )}

      {/* Data rows: label left, value right, so values align in a column. */}
      {rows.map((row, index) => (
        <g key={row.label}>
          <text
            x={left}
            y={rowsTop + ROW_GAP * index}
            fontSize="13"
            fontWeight="700"
            letterSpacing="1.8"
            fill="#6f6a61"
          >
            {row.label.toUpperCase()}
          </text>
          <text
            x={right}
            y={rowsTop + ROW_GAP * index}
            fontSize="17"
            fontWeight="600"
            textAnchor="end"
            fill="#1d1c1a"
          >
            {row.value}
          </text>
          {row.value === "" && (
            <line
              x1={left + 90}
              x2={right}
              y1={rowsTop + ROW_GAP * index + 3}
              y2={rowsTop + ROW_GAP * index + 3}
              stroke="#b9b3a8"
              strokeWidth="1"
            />
          )}
        </g>
      ))}

      {notes.map((line, index) => (
        <text
          key={line + index}
          x={left}
          y={notesTop + NOTE_LINE * index}
          fontSize="13"
          fill="#6f6a61"
        >
          {line}
        </text>
      ))}

      {/* Foot: a solid bar reads as intentional even on a mono printer. */}
      <rect x={-B} y={CARD_HEIGHT - 14} width={CARD_WIDTH + 2 * B} height={14 + B} fill="#b75c2b" />
    </svg>
  );
}
