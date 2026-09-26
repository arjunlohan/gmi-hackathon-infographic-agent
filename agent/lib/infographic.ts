// The infographic spec the agent writes, and the compiler that turns it into a Hy Image prompt.
// Keeping the prompt structure in code (not in the model's head) is what makes output quality
// repeatable: every render gets the same canvas rules, text contract, and anti-hallucination guard.

import { z } from "zod";
import { type BrandKit, brandKitDirection } from "./brand-kits";
import type { HySize } from "./gmi";

export const FORMATS = {
  portrait: { size: "1152x1536", label: "3:4 portrait, article body / blog post" },
  tall: { size: "1440x2560", label: "9:16 tall, long scroll or social story" },
  square: { size: "2048x2048", label: "1:1 square, newsletter or social feed" },
  landscape: { size: "2560x1440", label: "16:9 landscape, blog header or slide" },
} as const satisfies Record<string, { size: HySize; label: string }>;

export const STYLE_PRESETS = {
  dark_editorial:
    "Flat editorial data-journalism design on a near-black charcoal-navy background (#20202b). Header framed by thin dotted hairline rules above and below. Headline in heavy geometric sans-serif (Futura Bold / Gotham Black feel) in pure white; subtitle in regular grotesk sans in light gray. Data encoded with a warm heat scale: lemon yellow, amber, orange, vermilion red. Crisp flat shapes, no gradients on data, dark numerals on light fills and white numerals on dark fills.",
  cinematic_hero:
    "Dark cinematic magazine poster. Deep navy-to-black background with a soft spotlight vignette and subtle film grain. One large, dramatically lit photorealistic 3D hero object anchors one side and slightly overlaps the chart area without covering any label. Headline set huge in tall condensed sans-serif (Bebas Neue / Oswald feel), stacked over two or three lines, with the accent word in electric yellow and the rest in white. Data marks in saturated sky blue with bold white value labels; the single most important data point highlighted in electric yellow.",
  chalkboard:
    "Classroom chalkboard atmosphere: dark slate background with faint hand-drawn chalk formulas, doodles and eraser smudges at low opacity. Kicker in widely letter-spaced uppercase sans, headline in a large high-contrast Didone serif (Didot / Playfair feel) in chalk white. Data marks are solid, saturated category colors with thin white separators and clean white sans labels. A photographic subject may be composited in the foreground.",
  illustrated_map:
    "Rich illustrated editorial style on a deep muted teal background with fine paper grain and soft vignette. Headline pairs a letter-spaced uppercase kicker with one big flowing brush-script word in white. Diverging palette from muted sea-green (low) through slate to deep crimson (high). Regions and shapes have subtle inner shadows and dark outlines. One symbolic 3D prop related to the topic (with a price tag or label if relevant) sits near the headline.",
  material_texture:
    "Tactile concept piece: the data graphic itself is physically made from a real material tied to the topic (for example soil, coins, grain, stone, fabric), shot from directly above in soft daylight on a warm off-white paper background. The headline letters are sculpted or embossed out of the same material. Divisions between shapes are thin warm-tan lines. Labels printed in bold condensed off-white sans-serif with a faint drop shadow for legibility.",
  clean_light:
    "Calm newsletter-ready editorial layout on a warm off-white background (#f6f3ee). Kicker in small letter-spaced caps in the accent color, headline in a bold modern serif in near-black. One accent color (deep vermilion #d9432b) highlights the key data; every other mark in graphite and soft warm grays. Fine hairline gridlines, generous whitespace, simple flat vector icons, no clutter.",
  neon_tech:
    "Futuristic tech-report aesthetic: very dark indigo background with a faint dot grid. Headline in wide geometric sans in white with the accent word in a cyan-to-magenta gradient. Data marks glow softly in cyan, violet and magenta against the dark; value labels in crisp white monospace-style numerals. Subtle glassmorphism panels for callouts.",
} as const;

const FORM_LAYOUTS = {
  ranked_bar:
    "Horizontal bar chart ranked from largest at the top to smallest at the bottom. Each row: category label left-aligned beside the bar, value label in bold at the end of the bar. Bar lengths strictly proportional to the values on a shared zero baseline.",
  column:
    "Vertical column chart. Category labels under each column, value label in bold above each column. Column heights strictly proportional to the values on a shared zero baseline.",
  heatmap_matrix:
    "Matrix / heatmap table. Row headers on the left, column headers across the top rotated about 45 degrees. Each cell is a square filled with the color of its value band from the legend, with the value printed centered inside. Empty cells left blank. Legend row of colored band chips above the matrix.",
  choropleth_map:
    "Map where each region is filled with the color of its value band from the legend. The region abbreviation and its value label are printed inside the region; small regions use short leader lines to labels placed just outside. Legend or color-scale bar near the headline marking the lowest and highest values.",
  treemap:
    "Treemap of adjacent rectangles whose areas are proportional to the values, grouped into blocks by group. Each tile shows its name in bold caps and its value below. Group names run along the outer edges of each block.",
  donut:
    "Donut chart with segments proportional to the values, labels with percentages placed around the ring with short leader lines, and the headline number in the center.",
  line:
    "Line chart with time on the horizontal axis and values on the vertical axis, clear axis labels, the latest value and notable peaks annotated directly on the line.",
  stat_cards:
    "Grid of bold stat cards. Each card shows one big number and a short label underneath, with a small simple icon.",
  comparison:
    "Side-by-side comparison with two or three columns, each with a header and matching rows of values so the reader compares across.",
  timeline:
    "Timeline with dated milestones placed in order along a single axis, each with a short label.",
  pictogram:
    "Pictogram / icon array where each icon stands for a fixed unit, rows of icons per category with the value label beside each row.",
  bubble:
    "Proportional circles whose areas match the values, each labeled with name and value, packed or arranged in a row from largest to smallest.",
  process_flow:
    "Step-by-step flow diagram with numbered steps connected by arrows, each step with a short title and one line of description.",
  table:
    "Styled data table with a bold header row, zebra striping, right-aligned numbers and a highlighted top row.",
  other: "Layout as described in the art direction.",
} as const;

type FormKey = keyof typeof FORM_LAYOUTS;
const FORM_KEYS = Object.keys(FORM_LAYOUTS) as [FormKey, ...FormKey[]];
type PresetKey = keyof typeof STYLE_PRESETS;
const PRESET_KEYS = Object.keys(STYLE_PRESETS) as [PresetKey, ...PresetKey[]];
type FormatKey = keyof typeof FORMATS;
const FORMAT_KEYS = Object.keys(FORMATS) as [FormatKey, ...FormatKey[]];

const dataPoint = z.object({
  label: z.string().describe("Category or row name exactly as it should be printed, e.g. 'Russia'"),
  value: z
    .string()
    .describe("Value exactly as it should be printed, with unit/format, e.g. '23.2M', '$864M', '612'"),
  numeric: z.number().optional().describe("Raw number used for proportions, e.g. 23.2"),
  group: z.string().optional().describe("Group / region / color category, if any"),
  highlight: z.boolean().optional().describe("True for the one or two points the story is about"),
});

export const infographicSpecSchema = z.object({
  format: z.enum(FORMAT_KEYS).describe(
    Object.entries(FORMATS)
      .map(([key, value]) => `${key}: ${value.label}`)
      .join("; "),
  ),
  kicker: z.string().optional().describe("Small line above the headline, e.g. 'THE WORLD'S TOP' or 'RANKED:'"),
  title: z.string().describe("Headline, 2-6 punchy words, e.g. 'Fertilizer Exporters'"),
  accentWord: z.string().optional().describe("One word from the title to set in the accent color"),
  subtitle: z
    .string()
    .describe("Measure, unit, geography and year, e.g. 'Average PISA math score of 15-year-olds, 2025'"),
  chart: z.object({
    form: z.enum(FORM_KEYS),
    unit: z.string().optional().describe("Unit note if not in subtitle, e.g. 'in USD billions'"),
    data: z
      .array(dataPoint)
      .max(40)
      .describe("Every data point to print, in display order. Keep to <=25 for legibility; aggregate the tail into 'Other'."),
    matrix: z
      .object({
        rowHeader: z.string().describe("What rows mean, e.g. 'Exporter'"),
        columnHeader: z.string().describe("What columns mean, e.g. 'Importer'"),
        rows: z.array(z.string()),
        columns: z.array(z.string()),
        cells: z
          .array(z.array(z.string()))
          .describe("cells[row][col] as printed; '' for empty/diagonal, 'n/a' for no data"),
      })
      .optional()
      .describe("Only for heatmap_matrix; replaces data"),
    legend: z
      .array(z.object({ label: z.string(), color: z.string().describe("color name or hex") }))
      .optional(),
    layoutNotes: z
      .string()
      .optional()
      .describe("Arrangement only (e.g. 'outlier bar broken with a // marker'). Never put words to print here; printed text belongs in callouts or footnote."),
  }),
  callouts: z
    .array(
      z.object({
        text: z
          .string()
          .describe("The annotation as printed, a true statement from the source, e.g. 'Vietnam grows mostly robusta'"),
        anchor: z
          .string()
          .optional()
          .describe(
            "The exact data label (or matrix row/column) this note is about; its pointer ends on that element. Omit for a statement about the whole chart, which then gets no pointer.",
          ),
      }),
    )
    .max(3)
    .optional()
    .describe("0-3 short annotations, each tied to one data element or to none"),
  hero: z
    .string()
    .optional()
    .describe("Hero illustration / visual metaphor and where it sits, e.g. 'pile of dark soil with green sprouts, lower right'. No real people's likenesses."),
  style: z.object({
    preset: z.enum(PRESET_KEYS),
    artDirection: z
      .string()
      .optional()
      .describe("Topic-specific art direction layered on the preset: palette tweaks, material, texture, props, composition"),
  }),
  source: z.string().describe("Source line, e.g. 'Source: FAO (2024)'"),
  footnote: z.string().optional().describe("Short methodology note, one sentence"),
  brandKitId: z
    .string()
    .optional()
    .describe("Brand kit id from the user's [Brief]. The tool applies its palette, fonts, logo, publication name and reference graphics."),
  fileName: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+){0,2}$/)
    .optional()
    .describe("Download file name: 1-3 lowercase words in kebab-case describing the graphic, e.g. 'fertilizer-exporters', 'ceo-pay'"),
  brandMark: z
    .string()
    .optional()
    .describe("Publisher or newsletter name for the bottom corner. Only when the user gave one; never a placeholder."),
});

export type InfographicSpec = z.infer<typeof infographicSpecSchema>;

/** A callout and the data element its pointer must end on (none for a general statement). */
export type CalloutCheck = { text: string; anchor?: string };

export type CompiledInfographic = {
  prompt: string;
  size: HySize;
  // Style references (brand logo and past graphics) sent with every fresh render.
  referenceImages: string[];
  fileName: string;
  // Every string that must appear on the image, verbatim. Used by the reviewer.
  textContract: string[];
  // Data the reviewer checks visual encoding against.
  dataSummary: string;
  // Where each callout must point. Used by the reviewer.
  callouts: CalloutCheck[];
};

/** Callouts with their anchors resolved to printed labels; an unknown anchor is a spec error. */
function checkedCallouts(spec: InfographicSpec): CalloutCheck[] {
  const labels = spec.chart.matrix
    ? [...spec.chart.matrix.rows, ...spec.chart.matrix.columns]
    : spec.chart.data.map((point) => point.label);
  return (spec.callouts ?? []).map(({ text, anchor }) => {
    if (!anchor?.trim()) return { text };
    const match = labels.find((label) => label.trim().toLowerCase() === anchor.trim().toLowerCase());
    if (!match) {
      throw new Error(
        `Callout "${text}" is anchored to "${anchor}", which is not a data label. Use one of: ${labels.map((label) => `"${label}"`).join(", ")}, or omit the anchor for a statement about the whole chart.`,
      );
    }
    return { text, anchor: match };
  });
}

function dataLines(spec: InfographicSpec): string[] {
  const { chart } = spec;
  if (chart.form === "heatmap_matrix" && chart.matrix) {
    const { rows, columns, cells } = chart.matrix;
    return rows.map(
      (row, r) =>
        `Row "${row}": ${columns
          .map((col, c) => `${col}=${cells[r]?.[c] ? `"${cells[r][c]}"` : "(empty)"}`)
          .join(", ")}`,
    );
  }
  return chart.data.map((point, index) => {
    const extras = [
      point.group ? `belongs to group "${point.group}"` : "",
      point.highlight ? "emphasized in the accent color" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `${index + 1}. "${point.label}" with value label "${point.value}"${extras ? `; ${extras}` : ""}`;
  });
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-");
  return slug || "infographic";
}

export function compileInfographic(spec: InfographicSpec, kit?: BrandKit): CompiledInfographic {
  const format = FORMATS[spec.format];
  const { chart } = spec;
  const brandMark = spec.brandMark ?? kit?.publicationName;
  const preset =
    kit?.preferredStyle && kit.preferredStyle in STYLE_PRESETS
      ? (kit.preferredStyle as PresetKey)
      : spec.style.preset;
  const kitDirection = kit ? brandKitDirection(kit) : undefined;
  const callouts = checkedCallouts(spec);

  const textContract = [
    spec.kicker,
    spec.title,
    spec.subtitle,
    chart.unit,
    ...(chart.matrix
      ? [
          chart.matrix.rowHeader,
          chart.matrix.columnHeader,
          ...chart.matrix.rows,
          ...chart.matrix.columns,
          ...chart.matrix.cells.flat().filter((cell) => cell && cell !== "n/a"),
        ]
      : chart.data.flatMap((point) => [point.label, point.value])),
    ...(chart.legend?.map((item) => item.label) ?? []),
    ...callouts.map((callout) => callout.text),
    spec.source,
    spec.footnote,
    brandMark,
  ].filter((text): text is string => Boolean(text && text.trim()));

  const sections = [
    `A premium, publication-quality editorial infographic in the tradition of Visual Capitalist and The Economist graphics desk. ${format.label.split(",")[0]} canvas. Clear visual hierarchy: headline first, then the chart, then annotations, then the footer.`,

    // A brand kit is the style: it replaces the preset unless the kit names a preset to build on.
    `STYLE: ${
      kitDirection?.style && !kit?.preferredStyle
        ? kitDirection.style
        : `${STYLE_PRESETS[preset]}${kitDirection?.style ? ` ${kitDirection.style}` : ""}`
    }${spec.style.artDirection ? ` Topic art direction: ${spec.style.artDirection}` : ""}`,

    [
      "HEADER (top-left, left-aligned):",
      spec.kicker ? `- Kicker in small letter-spaced caps: "${spec.kicker}"` : "",
      `- Headline, very large and bold, dominant on the page: "${spec.title}"${spec.accentWord ? ` with the word "${spec.accentWord}" in the accent color` : ""}`,
      `- Subtitle in small regular weight: "${spec.subtitle}"`,
    ]
      .filter(Boolean)
      .join("\n"),

    [
      `MAIN CHART: ${FORM_LAYOUTS[chart.form]}`,
      chart.layoutNotes ? `Arrangement notes (describe placement only, print none of these words): ${chart.layoutNotes}` : "",
      chart.unit ? `Unit note printed near the chart: "${chart.unit}"` : "",
      chart.matrix
        ? `Row axis title "${chart.matrix.rowHeader}", column axis title "${chart.matrix.columnHeader}". Rows top to bottom: ${chart.matrix.rows.map((r) => `"${r}"`).join(", ")}. Columns left to right: ${chart.matrix.columns.map((c) => `"${c}"`).join(", ")}. Cell values:`
        : "Data, in this exact order, each printed with its label and value label:",
      ...dataLines(spec),
      chart.legend?.length
        ? `Legend: ${chart.legend.map((item) => `"${item.label}" = ${item.color}`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),

    callouts.length
      ? [
          "CALLOUTS: small annotation boxes, text exactly as quoted. Each pointer, tail or leader line must end precisely on the element named, never on a neighboring row, bar or point:",
          ...callouts.map((callout) =>
            callout.anchor
              ? `- "${callout.text}": placed right beside "${callout.anchor}", its pointer ending exactly on the "${callout.anchor}" ${chart.matrix ? "row or column" : "data mark"}.`
              : `- "${callout.text}": a free-standing note in open space with no pointer, tail or leader line; it refers to the chart as a whole.`,
          ),
        ].join("\n")
      : "",

    spec.hero ? `HERO VISUAL: ${spec.hero}. It must never cover labels, values or the headline.` : "",

    [
      "FOOTER (bottom, small type):",
      `- "${spec.source}"`,
      spec.footnote ? `- "${spec.footnote}"` : "",
      kitDirection?.logoInstruction
        ? `- ${kitDirection.logoInstruction}${brandMark ? ` The logo reads "${brandMark}".` : ""}`
        : brandMark
          ? `- Brand mark in bold caps at the bottom corner: "${brandMark}"`
          : "",
    ]
      .filter(Boolean)
      .join("\n"),

    "TEXT RULES: Render every quoted string above exactly as written, spelled correctly, fully legible, each exactly once. Do not add any other words, numbers, percentages, dates, labels or logos that are not quoted above. No lorem ipsum, no pseudo-text, no watermark. Crisp vector-sharp typography, strong contrast, aligned grid, consistent spacing, all content inside a 5% safe margin.",
  ].filter(Boolean);

  const dataSummary = chart.matrix
    ? `Matrix ${chart.matrix.rowHeader} x ${chart.matrix.columnHeader}:\n${dataLines(spec).join("\n")}`
    : chart.data
        .map(
          (point) =>
            `${point.label}: ${point.value}${point.numeric !== undefined ? ` (${point.numeric})` : ""}`,
        )
        .join("\n");

  return {
    prompt: sections.filter(Boolean).join("\n\n"),
    size: format.size,
    referenceImages: kitDirection?.referenceImages ?? [],
    fileName: spec.fileName ?? slugify(spec.title),
    textContract,
    callouts,
    dataSummary: `Chart form: ${chart.form}\n${dataSummary}${chart.legend?.length ? `\nLegend: ${chart.legend.map((item) => `${item.label}=${item.color}`).join(", ")}` : ""}`,
  };
}
