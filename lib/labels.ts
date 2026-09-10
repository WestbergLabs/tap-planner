/**
 * Style-driven artwork profiles for printable BrewPack labels (`/labels`).
 *
 * Every BrewPack becomes a 4x6 card whose artwork is generated from its style
 * string rather than loaded from an image, so custom recipes and future packs
 * get artwork for free and nothing has to be hosted or downloaded.
 *
 * Matching is keyword based and ordered most specific first: "Coffee Imperial
 * Stout" must match roast before it matches stout, and "Lime Mexican Lager"
 * must match citrus before it matches lager.
 */

/** Which motif is drawn in the artwork panel. */
export type LabelMotif =
  | "hops"
  | "grain"
  | "roast"
  | "citrus"
  | "orchard"
  | "bubbles"
  | "spice";

export type StyleProfile = {
  /** Stable key, handy for tests and for keying React lists. */
  key: string;
  /** Body of the beer. Drives the poured-glass gradient. */
  beerTop: string;
  beerBottom: string;
  /** Head/foam and the ink used for motif linework on top of the beer. */
  foam: string;
  /** Line color for the motif. Must read against `beerTop`. */
  motifInk: string;
  /** Whether label text over the art should be light or dark. */
  onArt: "light" | "dark";
  motif: LabelMotif;
};

type StyleRule = {
  /** Lowercase substrings; any match selects this profile. */
  match: string[];
  profile: StyleProfile;
};

const PROFILES: Record<string, StyleProfile> = {
  seltzer: {
    key: "seltzer",
    beerTop: "#eaf6fb",
    beerBottom: "#bfe2f2",
    foam: "#ffffff",
    motifInk: "#2c7fa3",
    onArt: "dark",
    motif: "bubbles",
  },
  sour: {
    key: "sour",
    beerTop: "#f7c9d6",
    beerBottom: "#e0708f",
    foam: "#fdeef2",
    motifInk: "#8d2f4c",
    onArt: "dark",
    motif: "bubbles",
  },
  cider: {
    key: "cider",
    beerTop: "#f6d67a",
    beerBottom: "#d99b25",
    foam: "#fdf3d9",
    motifInk: "#7d5310",
    onArt: "dark",
    motif: "orchard",
  },
  darkCider: {
    key: "darkCider",
    beerTop: "#b8465f",
    beerBottom: "#6d1f33",
    foam: "#f2d6dc",
    motifInk: "#f7dbe2",
    onArt: "light",
    motif: "orchard",
  },
  citrus: {
    key: "citrus",
    beerTop: "#f8cf5c",
    beerBottom: "#e08a15",
    foam: "#fdf1cf",
    motifInk: "#7a4708",
    onArt: "dark",
    motif: "citrus",
  },
  hazy: {
    key: "hazy",
    beerTop: "#f6b24a",
    beerBottom: "#dd8412",
    foam: "#fdf0da",
    motifInk: "#6f3f06",
    onArt: "dark",
    motif: "hops",
  },
  ipa: {
    key: "ipa",
    beerTop: "#eda537",
    beerBottom: "#c46a10",
    foam: "#fbeed6",
    motifInk: "#5f3406",
    onArt: "dark",
    motif: "hops",
  },
  pale: {
    key: "pale",
    beerTop: "#f4c962",
    beerBottom: "#d99521",
    foam: "#fdf2da",
    motifInk: "#6c4409",
    onArt: "dark",
    motif: "hops",
  },
  wit: {
    key: "wit",
    beerTop: "#fbe6a8",
    beerBottom: "#efc45c",
    foam: "#fffaeb",
    motifInk: "#7c5a15",
    onArt: "dark",
    motif: "grain",
  },
  pilsner: {
    key: "pilsner",
    beerTop: "#fadf82",
    beerBottom: "#e8b42c",
    foam: "#fffaea",
    motifInk: "#75530b",
    onArt: "dark",
    motif: "grain",
  },
  lager: {
    key: "lager",
    beerTop: "#f5cf60",
    beerBottom: "#dda31c",
    foam: "#fdf4dc",
    motifInk: "#6f4d08",
    onArt: "dark",
    motif: "grain",
  },
  amber: {
    key: "amber",
    beerTop: "#d8842d",
    beerBottom: "#9c4d10",
    foam: "#f7e3cb",
    motifInk: "#4a2205",
    onArt: "dark",
    motif: "grain",
  },
  dunkel: {
    key: "dunkel",
    beerTop: "#8a4a1c",
    beerBottom: "#4d2308",
    foam: "#e8d3ba",
    motifInk: "#f2e0cb",
    onArt: "light",
    motif: "grain",
  },
  spiced: {
    key: "spiced",
    beerTop: "#a95a21",
    beerBottom: "#5d2a0a",
    foam: "#efd9bd",
    motifInk: "#f6e5d1",
    onArt: "light",
    motif: "spice",
  },
  stout: {
    key: "stout",
    beerTop: "#4a2a17",
    beerBottom: "#150a04",
    foam: "#e2cbae",
    motifInk: "#e8d5bd",
    onArt: "light",
    motif: "roast",
  },
  belgianDark: {
    key: "belgianDark",
    beerTop: "#733a17",
    beerBottom: "#2d1206",
    foam: "#e9d4b8",
    motifInk: "#efdcc4",
    onArt: "light",
    motif: "spice",
  },
  bitter: {
    key: "bitter",
    beerTop: "#c8802f",
    beerBottom: "#8c4a11",
    foam: "#f4e0c6",
    motifInk: "#472105",
    onArt: "dark",
    motif: "grain",
  },
};

/**
 * Ordered most specific first. The first rule with a matching keyword wins, so
 * roast/citrus/spice qualifiers get to claim a style before the base family
 * ("stout", "lager", "ipa") does.
 */
const RULES: StyleRule[] = [
  { match: ["seltzer"], profile: PROFILES.seltzer },
  { match: ["dark fruit"], profile: PROFILES.darkCider },
  { match: ["cider", "perry"], profile: PROFILES.cider },
  { match: ["sour", "gose", "berliner"], profile: PROFILES.sour },
  { match: ["coffee", "espresso", "mocha"], profile: PROFILES.stout },
  { match: ["pumpkin", "spiced", "winter", "christmas"], profile: PROFILES.spiced },
  { match: ["belgian dark", "dubbel", "quad"], profile: PROFILES.belgianDark },
  { match: ["stout", "porter"], profile: PROFILES.stout },
  { match: ["dunkel", "schwarz", "black"], profile: PROFILES.dunkel },
  {
    match: ["citrus", "grapefruit", "lime", "lemon", "tropical", "mango", "orange"],
    profile: PROFILES.citrus,
  },
  { match: ["hazy", "neipa", "juicy"], profile: PROFILES.hazy },
  { match: ["wit", "weiss", "wheat", "hefe", "blanche"], profile: PROFILES.wit },
  { match: ["oktoberfest", "marzen", "märzen", "amber", "red ale"], profile: PROFILES.amber },
  { match: ["pilsner", "pils"], profile: PROFILES.pilsner },
  { match: ["lager", "helles", "kolsch", "kölsch"], profile: PROFILES.lager },
  { match: ["ipa"], profile: PROFILES.ipa },
  { match: ["pale ale", "pale"], profile: PROFILES.pale },
  { match: ["bitter", "esb", "brown"], profile: PROFILES.bitter },
];

/** Used when a style is empty or matches nothing — a mid-amber all-rounder. */
export const DEFAULT_PROFILE = PROFILES.pale;

/** Pick the artwork profile for a beer style string such as "Hazy IPA". */
export function getStyleProfile(style: string): StyleProfile {
  const needle = style.trim().toLowerCase();

  if (needle === "") {
    return DEFAULT_PROFILE;
  }

  for (const rule of RULES) {
    if (rule.match.some((keyword) => needle.includes(keyword))) {
      return rule.profile;
    }
  }

  return DEFAULT_PROFILE;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Compact date for the card face, e.g. "14 Sep 2026". Empty input stays empty.
 *
 * Month names are hard-coded rather than taken from `Intl`: locale data varies
 * by engine (some render September as "Sept"), and a printed card should not
 * change shape depending on which browser produced it.
 */
export function formatLabelDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day || month < 1 || month > 12) {
    return "";
  }

  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** ABV for the card face. Trims trailing zeros so 6.0 prints as "6%". */
export function formatAbv(abv: string): string {
  const trimmed = abv.trim();

  if (trimmed === "") {
    return "";
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return `${Number(parsed.toFixed(1))}% ABV`;
}
