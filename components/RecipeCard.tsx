import {
  CARD_H,
  CARD_W,
  RECIPE_CUT_NOTE,
  RECIPE_CUT_NOTE_Y,
  RECIPE_FOOTER_TOP,
  RECIPE_MARGIN,
  layoutRecipeCard,
  type RecipeCardData,
} from "@/lib/recipeCard";

/**
 * A shareable recipe card, drawn entirely as one SVG (see lib/recipeCard.ts for
 * the layout). Like the label cards it uses literal colours and a system font:
 * the card is exported as an image, and CSS variables do not exist once an SVG
 * leaves the page.
 */
export default function RecipeCard({ data }: { data: RecipeCardData }) {
  const layout = layoutRecipeCard(data);
  const inner = CARD_W - RECIPE_MARGIN * 2;
  const gap = 10;
  const boxWidth = (inner - gap * (layout.timeline.length - 1)) / layout.timeline.length;

  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Recipe card for ${data.name}`}
      style={{ display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <rect width={CARD_W} height={CARD_H} fill="#ffffff" />
      <rect width={CARD_W} height={14} fill="#b75c2b" />

      <text
        x={RECIPE_MARGIN}
        y={62}
        fontSize="14"
        fontWeight="700"
        letterSpacing="3"
        fill="#b75c2b"
      >
        RECIPE
      </text>

      {layout.title.lines.map((line) => (
        <text
          key={line.y}
          x={RECIPE_MARGIN}
          y={line.y}
          fontSize={layout.title.fontSize}
          fontWeight="700"
          fill="#1d1c1a"
        >
          {line.text}
        </text>
      ))}

      {layout.meta.map((line) => (
        <text key={line.y} x={RECIPE_MARGIN} y={line.y} fontSize="18" fill="#6f6a61">
          {line.text}
        </text>
      ))}

      {layout.timeline.map((item, index) => (
        <g
          key={item.label}
          transform={`translate(${RECIPE_MARGIN + index * (boxWidth + gap)}, ${layout.timelineY})`}
        >
          <rect width={boxWidth} height={78} rx={10} fill="#faf6ef" stroke="#d8d1c5" />
          <text x={14} y={28} fontSize="12" fontWeight="700" letterSpacing="1.5" fill="#6f6a61">
            {item.label.toUpperCase()}
          </text>
          <text x={14} y={58} fontSize="20" fontWeight="700" fill="#1d1c1a">
            {item.value}
          </text>
        </g>
      ))}

      {layout.sections.map((section) => (
        <g key={section.heading}>
          <text
            x={RECIPE_MARGIN}
            y={section.headingY + 14}
            fontSize="13"
            fontWeight="700"
            letterSpacing="2"
            fill="#b75c2b"
          >
            {section.heading}
          </text>

          {section.lines.map((line) => (
            <text
              key={line.y}
              x={RECIPE_MARGIN}
              y={line.y}
              fontSize={section.fontSize}
              fill="#1d1c1a"
            >
              {line.text}
            </text>
          ))}
        </g>
      ))}

      {layout.truncated && (
        <text
          x={RECIPE_MARGIN}
          y={RECIPE_CUT_NOTE_Y}
          fontSize="13"
          fontStyle="italic"
          fill="#6f6a61"
        >
          {RECIPE_CUT_NOTE}
        </text>
      )}

      <line
        x1={RECIPE_MARGIN}
        x2={CARD_W - RECIPE_MARGIN}
        y1={RECIPE_FOOTER_TOP}
        y2={RECIPE_FOOTER_TOP}
        stroke="#d8d1c5"
      />
      <text x={RECIPE_MARGIN} y={RECIPE_FOOTER_TOP + 34} fontSize="14" fill="#6f6a61">
        Made with Tap Planner · tap-planner.vercel.app
      </text>

      <rect y={CARD_H - 14} width={CARD_W} height={14} fill="#b75c2b" />
    </svg>
  );
}
