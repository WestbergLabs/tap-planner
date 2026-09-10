import type { LabelMotif } from "@/lib/labels";

/**
 * Motif linework for a printable label, drawn inside a normalized 100x100 box
 * so the card can place and scale each motif identically.
 *
 * Every motif is stroke-only in a single ink color: it stays legible on a
 * cheap mono laser printer and costs almost no toner.
 */
export default function LabelArt({
  motif,
  ink,
}: {
  motif: LabelMotif;
  ink: string;
}) {
  const stroke = {
    fill: "none",
    stroke: ink,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (motif) {
    case "hops":
      return (
        <g {...stroke}>
          {/* Stem, then a teardrop cone silhouette tapering to a point. */}
          <path d="M50 10v14" />
          <path d="M50 24c20 3 26 22 23 38-3 17-14 30-23 30s-20-13-23-30c-3-16 3-35 23-38Z" />
          {/* Bracts: rows of downward arcs, each row narrower than the last,
              with short ticks splitting them into individual scales. */}
          <path d="M29 41c8 9 34 9 42 0" />
          <path d="M30 56c8 9 32 9 40 0" />
          <path d="M34 71c7 8 25 8 32 0" />
          <path d="M50 24v13M39 47v7M61 47v7M50 61v8M40 76v6M60 76v6" />
          {/* Leaf on the stem. */}
          <path d="M50 18c-7-8-17-9-24-4 4 9 15 12 24 4Z" />
        </g>
      );

    case "grain":
      return (
        <g {...stroke}>
          <path d="M50 94V26" />
          {/* Paired grains climbing the stalk. */}
          <path d="M50 30c8-6 15-4 18 2-4 7-12 8-18 3Z" />
          <path d="M50 30c-8-6-15-4-18 2 4 7 12 8 18 3Z" />
          <path d="M50 46c8-6 15-4 18 2-4 7-12 8-18 3Z" />
          <path d="M50 46c-8-6-15-4-18 2 4 7 12 8 18 3Z" />
          <path d="M50 62c8-6 15-4 18 2-4 7-12 8-18 3Z" />
          <path d="M50 62c-8-6-15-4-18 2 4 7 12 8 18 3Z" />
          <path d="M50 26c-3-8-1-14 3-18 3 6 2 13-3 18Z" />
        </g>
      );

    case "roast":
      return (
        <g {...stroke}>
          {/* Two roasted beans, one behind the other. */}
          <ellipse cx="42" cy="44" rx="20" ry="27" transform="rotate(-24 42 44)" />
          <path d="M42 19c-8 12-8 38 0 50" transform="rotate(-24 42 44)" />
          <ellipse cx="63" cy="66" rx="16" ry="22" transform="rotate(-24 63 66)" />
          <path d="M63 46c-6 10-6 30 0 40" transform="rotate(-24 63 66)" />
        </g>
      );

    case "citrus":
      return (
        <g {...stroke}>
          <circle cx="50" cy="52" r="34" />
          <circle cx="50" cy="52" r="27" />
          {/* Eight segment dividers. */}
          <path d="M50 25v54M23 52h54M31 33l38 38M69 33 31 71" />
          <path d="M50 18c-4-7-2-12 2-15 3 5 2 11-2 15Z" />
        </g>
      );

    case "orchard":
      return (
        <g {...stroke}>
          {/* Apple/pear silhouette with a stem and leaf. */}
          <path d="M50 30c-6-6-16-8-23-2-9 8-8 26-1 40 5 10 13 20 24 20s19-10 24-20c7-14 8-32-1-40-7-6-17-4-23 2Z" />
          <path d="M50 30V14" />
          <path d="M50 20c7-8 16-9 23-5-3 9-13 13-23 5Z" />
        </g>
      );

    case "bubbles":
      return (
        <g {...stroke}>
          <circle cx="38" cy="30" r="13" />
          <circle cx="66" cy="46" r="9" />
          <circle cx="34" cy="62" r="10" />
          <circle cx="58" cy="76" r="6" />
          <circle cx="72" cy="22" r="5" />
          <circle cx="24" cy="86" r="4" />
          <circle cx="50" cy="50" r="3" />
        </g>
      );

    case "spice":
      return (
        <g {...stroke}>
          {/* Star anise: eight pods around a small center. */}
          <circle cx="50" cy="52" r="8" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path
              key={angle}
              d="M50 44c-5-8-4-18 0-24 4 6 5 16 0 24Z"
              transform={`rotate(${angle} 50 52)`}
            />
          ))}
        </g>
      );
  }
}
