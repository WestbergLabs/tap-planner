// Layout for the shareable recipe card. Pure and deterministic (no DOM, no
// measuring), so the same recipe always lays out identically on server and
// client and can be checked in a plain test.
//
// SVG has no automatic line breaking, so text is wrapped here from an average
// glyph width, as the label cards do. Unlike the labels, a recipe is free text
// of any length, so this also hard-breaks words longer than a line and cuts the
// text with an ellipsis when it cannot fit, reporting that in `truncated`.

export const CARD_W = 600;
export const CARD_H = 800;

const MARGIN = 44;
const TEXT_W = CARD_W - MARGIN * 2;
const FOOTER_TOP = CARD_H - 74;

export type RecipeCardData = {
  name: string;
  style: string;
  /** Empty string when no ABV was entered. */
  abv: string;
  system: string;
  ingredients: string;
  method: string;
  fermentationDays: number;
  coldCrashDays: number;
  conditioningDays: number;
};

export type PlacedLines = {
  heading: string;
  fontSize: number;
  lineHeight: number;
  headingY: number;
  /** Baseline y of each line. */
  lines: { text: string; y: number }[];
};

export type RecipeCardLayout = {
  title: { fontSize: number; lines: { text: string; y: number }[] };
  meta: { text: string; y: number }[];
  timeline: { label: string; value: string }[];
  timelineY: number;
  sections: PlacedLines[];
  /** True when the recipe text was cut to fit the card. */
  truncated: boolean;
};

// Arial advance widths in 1/1000 em (Helvetica and Liberation Sans match). A
// flat average is not safe for free text: "WWWW" is roughly twice as wide as
// "illl", and a caps-heavy line would run off the card.
const WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

/** Anything not in the table (accents, symbols, emoji) is treated as wide. */
const DEFAULT_WIDTH = 1000;

/** Bold Arial runs about a tenth wider than regular. */
const BOLD = 1.1;

/** Estimated rendered width of `text` in SVG units. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let total = 0;

  for (const char of text) {
    total += WIDTHS[char] ?? DEFAULT_WIDTH;
  }

  return (total / 1000) * fontSize * (bold ? BOLD : 1);
}

/** Break one paragraph into lines no wider than `width`. */
function wrapParagraph(text: string, fontSize: number, width: number, bold: boolean): string[] {
  const lines: string[] = [];
  let current = "";

  const fits = (candidate: string) => textWidth(candidate, fontSize, bold) <= width;

  for (let word of text.split(/\s+/).filter(Boolean)) {
    // A word wider than a whole line (a URL, say) is broken rather than let
    // run off the card.
    while (!fits(word)) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }

      let cut = word.length - 1;

      while (cut > 1 && !fits(word.slice(0, cut))) {
        cut -= 1;
      }

      lines.push(word.slice(0, Math.max(1, cut)));
      word = word.slice(Math.max(1, cut));
    }

    const candidate = current === "" ? word : `${current} ${word}`;

    if (fits(candidate)) {
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

/** Wrap free text, keeping the person's own line breaks. */
export function wrapLines(text: string, fontSize: number, width = TEXT_W, bold = false): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((paragraph) => wrapParagraph(paragraph, fontSize, width, bold));
}

/** `line` shortened, with an ellipsis, until it fits `width`. */
function ellipsize(line: string, fontSize: number, width: number, bold: boolean): string {
  let kept = line.trimEnd();

  while (kept.length > 0 && textWidth(`${kept}\u2026`, fontSize, bold) > width) {
    kept = kept.slice(0, -1).trimEnd();
  }

  return `${kept}\u2026`;
}

/** The first `max` lines, with the last one ending in an ellipsis when cut. */
function clip(
  lines: string[],
  max: number,
  fontSize: number,
  width = TEXT_W,
  bold = false,
): { lines: string[]; cut: boolean } {
  if (lines.length <= max) {
    return { lines, cut: false };
  }

  if (max <= 0) {
    return { lines: [], cut: true };
  }

  const kept = lines.slice(0, max);
  kept[max - 1] = ellipsize(kept[max - 1], fontSize, width, bold);

  return { lines: kept, cut: true };
}

function pluralDays(count: number): string {
  return `${count} day${count === 1 ? "" : "s"}`;
}

export function layoutRecipeCard(data: RecipeCardData): RecipeCardLayout {
  let y = 92;

  // Title: the biggest size that fits two lines, otherwise the smallest size
  // cut to two lines.
  const titleSizes = [46, 40, 34, 30];
  let titleSize = titleSizes[titleSizes.length - 1];
  let titleLines = wrapLines(data.name.trim(), titleSize, TEXT_W, true);

  for (const size of titleSizes) {
    const wrapped = wrapLines(data.name.trim(), size, TEXT_W, true);

    if (wrapped.length <= 2) {
      titleSize = size;
      titleLines = wrapped;
      break;
    }
  }

  titleLines = clip(titleLines, 2, titleSize, TEXT_W, true).lines;

  const title = {
    fontSize: titleSize,
    lines: titleLines.map((text, index) => ({
      text,
      y: y + titleSize + index * titleSize * 1.06,
    })),
  };

  y += titleSize + (titleLines.length - 1) * titleSize * 1.06 + 20;

  // Meta line: style, ABV and system, up to two lines.
  const metaText = [
    data.style.trim(),
    data.abv.trim() ? `${data.abv.trim()}% ABV` : "",
    data.system.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const metaLines = clip(wrapLines(metaText, 18), 2, 18).lines;
  const meta = metaLines.map((text, index) => ({ text, y: y + 14 + index * 24 }));

  y += metaLines.length > 0 ? metaLines.length * 24 + 14 : 0;

  // Timeline strip.
  const timeline = [{ label: "Ferment", value: pluralDays(data.fermentationDays) }];

  if (data.coldCrashDays > 0) {
    timeline.push({ label: "Cold crash", value: pluralDays(data.coldCrashDays) });
  }

  timeline.push(
    { label: "Condition", value: pluralDays(data.conditioningDays) },
    {
      label: "Total",
      value: pluralDays(data.fermentationDays + data.coldCrashDays + data.conditioningDays),
    },
  );

  const timelineY = y + 8;

  y = timelineY + 78 + 22;

  // Recipe text sections share whatever height is left above the footer.
  const parts: { heading: string; text: string }[] = [];

  if (data.ingredients.trim()) {
    parts.push({ heading: "INGREDIENTS", text: data.ingredients.trim() });
  }

  if (data.method.trim()) {
    parts.push({ heading: "METHOD AND NOTES", text: data.method.trim() });
  }

  const available = FOOTER_TOP - 18 - y;
  const HEADING_BLOCK = 40;
  const GAP = 20;

  const sizes: { size: number; lineHeight: number }[] = [
    { size: 18, lineHeight: 26 },
    { size: 16, lineHeight: 23 },
    { size: 14, lineHeight: 20 },
  ];

  let chosen = sizes[sizes.length - 1];
  let wrapped: string[][] = parts.map((part) => wrapLines(part.text, chosen.size));
  let fits = false;

  for (const candidate of sizes) {
    const lines = parts.map((part) => wrapLines(part.text, candidate.size));
    const needed =
      parts.length * HEADING_BLOCK +
      Math.max(0, parts.length - 1) * GAP +
      lines.reduce((sum, l) => sum + l.length * candidate.lineHeight, 0);

    if (needed <= available) {
      chosen = candidate;
      wrapped = lines;
      fits = true;
      break;
    }
  }

  let truncated = false;

  if (!fits && parts.length > 0) {
    const room =
      available - parts.length * HEADING_BLOCK - Math.max(0, parts.length - 1) * GAP;
    const maxLines = Math.max(0, Math.floor(room / chosen.lineHeight));

    if (parts.length === 1) {
      const result = clip(wrapped[0], maxLines, chosen.size);
      wrapped = [result.lines];
      truncated = result.cut;
    } else {
      const [first, second] = wrapped;
      // Give the shorter section what it needs and the longer one the rest, but
      // never less than half each, so neither disappears.
      const firstMax = Math.min(first.length, Math.max(maxLines - second.length, Math.ceil(maxLines / 2)));
      const secondMax = Math.max(0, maxLines - Math.min(first.length, firstMax));
      const a = clip(first, firstMax, chosen.size);
      const b = clip(second, secondMax, chosen.size);

      wrapped = [a.lines, b.lines];
      truncated = a.cut || b.cut;
    }
  }

  const sections: PlacedLines[] = [];

  parts.forEach((part, index) => {
    const lines = wrapped[index];

    if (lines.length === 0) {
      return;
    }

    const headingY = y;
    const firstBaseline = y + 36;

    sections.push({
      heading: part.heading,
      fontSize: chosen.size,
      lineHeight: chosen.lineHeight,
      headingY,
      lines: lines.map((text, lineIndex) => ({
        text,
        y: firstBaseline + lineIndex * chosen.lineHeight,
      })),
    });

    y += HEADING_BLOCK + lines.length * chosen.lineHeight + GAP;
  });

  return { title, meta, timeline, timelineY, sections, truncated };
}

/** Where the footer begins, so the component and the test agree. */
export const RECIPE_FOOTER_TOP = FOOTER_TOP;
export const RECIPE_MARGIN = MARGIN;

/**
 * The recipe as plain text, for pasting into a post, message or note. It is
 * the same content as the card, but copyable and editable.
 */
export function recipeToText(data: RecipeCardData): string {
  const meta = [
    data.style.trim(),
    data.abv.trim() ? `${data.abv.trim()}% ABV` : "",
    data.system.trim(),
  ].filter(Boolean);

  const timings = [
    `Ferment ${pluralDays(data.fermentationDays)}`,
    data.coldCrashDays > 0 ? `Cold crash ${pluralDays(data.coldCrashDays)}` : "",
    `Condition ${pluralDays(data.conditioningDays)}`,
  ].filter(Boolean);

  const total = data.fermentationDays + data.coldCrashDays + data.conditioningDays;

  const blocks = [
    [data.name.trim(), meta.join(" \u00B7 ")].filter(Boolean).join("\n"),
    `${timings.join(", ")} (${pluralDays(total)} in all)`,
  ];

  if (data.ingredients.trim()) {
    blocks.push(`Ingredients\n${data.ingredients.trim()}`);
  }

  if (data.method.trim()) {
    blocks.push(`Method and notes\n${data.method.trim()}`);
  }

  blocks.push("Made with Tap Planner \u00B7 tap-planner.vercel.app");

  return blocks.join("\n\n");
}
