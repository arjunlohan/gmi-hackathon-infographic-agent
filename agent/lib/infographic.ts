// The infographic spec the agent writes, and the compiler that turns it into a Hy Image prompt.
// Keeping the prompt structure in code (not in the model's head) is what makes output quality
// repeatable: every render gets the same canvas rules, text contract, and anti-hallucination guard.

import { z } from "zod";
import { type BrandKit, brandKitDirection } from "./brand-kits";
import type { HySize } from "./gmi";
import type { CalloutCheck, ContractItem, QaPlan } from "./qa";

export type { CalloutCheck } from "./qa";

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
    "Classroom chalkboard atmosphere: dark slate background with faint chalk doodles and eraser smudges at low opacity, with no legible writing. Kicker in widely letter-spaced uppercase sans, headline in a large high-contrast Didone serif (Didot / Playfair feel) in chalk white. Data marks are solid, saturated category colors with thin white separators and clean white sans labels. A photographic subject may be composited in the foreground.",
  illustrated_map:
    "Rich illustrated editorial style on a deep muted teal background with fine paper grain and soft vignette. Headline pairs a letter-spaced uppercase kicker with one big flowing brush-script word in white. Diverging palette from muted sea-green (low) through slate to deep crimson (high). Regions and shapes have subtle inner shadows and dark outlines. One symbolic 3D prop related to the topic, with no text on it, sits near the headline.",
  material_texture:
    "Tactile concept piece: the data marks themselves are physically made from the real material the data measures, shot from directly above in soft daylight on a warm off-white paper background. The headline is set in crisp, heavy printed type with every letter cleanly formed; the material stays in the chart and hero. Divisions between shapes are thin warm-tan lines. Labels and values printed in bold condensed sans-serif in dark ink on the paper, beside the material rather than on it.",
  clean_light:
    "Calm newsletter-ready editorial layout on a warm off-white background (#f6f3ee). Kicker in small letter-spaced caps in the accent color, headline in a bold modern serif in near-black. One accent color (deep vermilion #d9432b) highlights the key data; every other mark in graphite and soft warm grays. Fine hairline gridlines, generous whitespace, simple flat vector icons, no clutter.",
  neon_tech:
    "Futuristic tech-report aesthetic: very dark indigo background with a faint dot grid. Headline in wide geometric sans in white with the accent word in a cyan-to-magenta gradient. Data marks glow softly in cyan, violet and magenta against the dark; value labels in crisp white monospace-style numerals. Subtle glassmorphism panels for callouts.",
} as const;

const FORM_LAYOUTS = {
  ranked_bar:
    "Horizontal bar chart ranked from largest at the top to smallest at the bottom. Each row: category label left-aligned beside the bar, value label in bold just past the end of the bar, outside it. Bar lengths strictly proportional to the values on a shared zero baseline; a short bar is never lengthened to fit its label.",
  column:
    "Vertical column chart. Category labels under each column, value label in bold just above each column, outside it. Column heights strictly proportional to the values on a shared zero baseline; a short column is never lengthened to fit its label.",
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
  label: z.string().max(40).describe("Category or row name exactly as it should be printed"),
  value: z
    .string()
    .max(16)
    .describe("Value exactly as it should be printed, in the same format and precision as the other values"),
  numeric: z.number().optional().describe("Raw number used for proportions, in the same unit for every point"),
  group: z.string().optional().describe("Group / region / color category, if any"),
  highlight: z.boolean().optional().describe("True for the one or two points the story is about"),
});

export const infographicSpecSchema = z.object({
  format: z.enum(FORMAT_KEYS).describe(
    Object.entries(FORMATS)
      .map(([key, value]) => `${key}: ${value.label}`)
      .join("; "),
  ),
  kicker: z.string().max(40).optional().describe("Small line above the headline that frames it"),
  title: z.string().max(48).describe("Headline, 2-6 punchy words naming the subject"),
  accentWord: z.string().optional().describe("One word from the title to set in the accent color"),
  subtitle: z
    .string()
    .max(130)
    .describe("Measure, unit, geography and year"),
  chart: z.object({
    form: z.enum(FORM_KEYS),
    unit: z.string().max(40).optional().describe("Unit note if not in subtitle"),
    data: z
      .array(dataPoint)
      .max(40)
      .describe("Every data point to print, in display order. Keep to <=25 for legibility; aggregate the tail into 'Other'."),
    matrix: z
      .object({
        rowHeader: z.string().describe("What rows mean"),
        columnHeader: z.string().describe("What columns mean"),
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
    benchmark: z
      .object({
        label: z.string().max(40).describe("Printed label: the reference's name and value"),
        numeric: z.number().describe("The reference value on the same scale as the data"),
      })
      .optional()
      .describe(
        "A reference value such as an average or target (ranked_bar, column, table, pictogram, timeline only). The graphic leaves a gap between the items above and below it and prints the label there. Never describe reference or average lines in layoutNotes.",
      ),
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
          .max(110)
          .describe("The annotation as printed, a true statement from the source"),
        anchor: z
          .string()
          .optional()
          .describe(
            "The exact data label (or matrix row/column) this note is about; the note is placed right beside that element, with no pointer. Omit for a statement about the whole chart.",
          ),
      }),
    )
    .max(3)
    .optional()
    .describe("0-3 short annotations, each tied to one data element or to none"),
  hero: z
    .string()
    .optional()
    .describe("Hero illustration / visual metaphor specific to this topic, and where it sits. No real people's likenesses."),
  style: z.object({
    preset: z.enum(PRESET_KEYS),
    artDirection: z
      .string()
      .optional()
      .describe("Topic-specific art direction layered on the preset: palette tweaks, material, texture, props, composition"),
  }),
  source: z.string().max(150).describe("Source line naming the publisher, report and year"),
  footnote: z.string().max(220).optional().describe("Short methodology note, one sentence"),
  brandKitId: z
    .string()
    .optional()
    .describe("Brand kit id from the user's [Brief]. The tool applies its palette, fonts, logo, publication name and reference graphics."),
  fileName: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+){0,2}$/)
    .optional()
    .describe("Download file name: 1-3 lowercase words in kebab-case describing the graphic, e.g. 'topic-measure'"),
  brandMark: z
    .string()
    .max(40)
    .optional()
    .describe("Publisher or newsletter name for the bottom corner. Only when the user gave one; never a placeholder."),
});


export type InfographicSpec = z.infer<typeof infographicSpecSchema>;

/** What a render was asked to do, logged with every QA record so failures can be grouped. */
export type RenderMeta = {
  form: string;
  format: string;
  preset: string;
  brandKitId?: string;
  dataPoints: number;
  strings: number;
  words: number;
};

export type CompiledInfographic = {
  prompt: string;
  size: HySize;
  // Style references (brand logo) sent with every fresh render.
  referenceImages: string[];
  fileName: string;
  // What the reviewer checks the render against.
  qa: QaPlan;
  meta: RenderMeta;
};

// Printed-word budgets per canvas. Dense text is where image models misspell and drop words
// (even Qwen-Image filtered dense and tiny text out of its training data), so a spec over budget
// is sent back to the agent to trim before any render is spent on it.
const WORD_BUDGET: Record<FormatKey, number> = { portrait: 200, square: 220, landscape: 220, tall: 260 };

// Layout of the data labels, which decides the reviewer's order and placement checks.
const FORM_LAYOUT: Partial<Record<FormKey, QaPlan["layout"]>> = {
  ranked_bar: "rows",
  table: "rows",
  pictogram: "rows",
  column: "columns",
  timeline: "columns",
  heatmap_matrix: "matrix",
};

// Forms whose marks encode magnitude by length or area, and what to call a mark.
const MARK_NOUN: Partial<Record<FormKey, string>> = {
  ranked_bar: "bar",
  column: "column",
  bubble: "circle",
  treemap: "tile",
  donut: "segment",
  pictogram: "row of icons",
};

/**
 * Normalize printed copy to plain characters. Image models spell from character-level text
 * encoders, so curly quotes, Unicode minus signs, en or em dashes and non-breaking spaces are
 * a cheap source of odd glyphs and false mismatches.
 */
export function cleanCopy(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\s*[\u2013\u2014]\s*/g, (match) => (match.trim() === match ? "-" : " - "))
    .replace(/[\u2010\u2011\u2012\u2212]/g, "-")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpec(spec: InfographicSpec): InfographicSpec {
  const c = (text?: string) => (text === undefined ? undefined : cleanCopy(text));
  const { chart } = spec;
  return {
    ...spec,
    kicker: c(spec.kicker),
    title: cleanCopy(spec.title),
    accentWord: c(spec.accentWord),
    subtitle: cleanCopy(spec.subtitle),
    source: cleanCopy(spec.source),
    footnote: c(spec.footnote),
    brandMark: c(spec.brandMark),
    callouts: spec.callouts?.map((callout) => ({ text: cleanCopy(callout.text), anchor: c(callout.anchor) })),
    chart: {
      ...chart,
      unit: c(chart.unit),
      data: chart.data.map((point) => ({ ...point, label: cleanCopy(point.label), value: cleanCopy(point.value) })),
      legend: chart.legend?.map((item) => ({ ...item, label: cleanCopy(item.label) })),
      benchmark: chart.benchmark && { ...chart.benchmark, label: cleanCopy(chart.benchmark.label) },
      matrix: chart.matrix && {
        ...chart.matrix,
        rowHeader: cleanCopy(chart.matrix.rowHeader),
        columnHeader: cleanCopy(chart.matrix.columnHeader),
        rows: chart.matrix.rows.map(cleanCopy),
        columns: chart.matrix.columns.map(cleanCopy),
        cells: chart.matrix.cells.map((row) => row.map(cleanCopy)),
      },
    },
  };
}

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
    // Row and column names are quoted once in the header lists; here they are plain references.
    return rows.map(
      (row, r) =>
        `Row ${row}: ${columns
          .map((col, c) => `${col} ${cells[r]?.[c] && cells[r][c] !== "n/a" ? `"${cells[r][c]}"` : cells[r]?.[c] === "n/a" ? "(no data, gray)" : "(empty)"}`)
          .join(", ")}`,
    );
  }
  return chart.data.map((point, index) => {
    const extras = [
      point.group ? (chart.form === "treemap" ? `belongs to group "${point.group}"` : `colored by its group, ${point.group} (not printed)`) : "",
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

/** Every printed string with its role, in reading order. */
function buildContract(spec: InfographicSpec, callouts: CalloutCheck[], brandMark?: string): ContractItem[] {
  const { chart } = spec;
  const items: (ContractItem | undefined)[] = [
    spec.kicker ? { text: spec.kicker, role: "kicker" } : undefined,
    { text: spec.title, role: "title" },
    { text: spec.subtitle, role: "subtitle" },
    chart.unit ? { text: chart.unit, role: "unit" } : undefined,
    ...(chart.matrix
      ? [
          { text: chart.matrix.rowHeader, role: "axis" as const },
          { text: chart.matrix.columnHeader, role: "axis" as const },
          ...chart.matrix.rows.map((text) => ({ text, role: "row" as const })),
          ...chart.matrix.columns.map((text) => ({ text, role: "column" as const })),
          ...chart.matrix.rows.flatMap((row, r) =>
            chart.matrix!.columns.flatMap((col, c) => {
              const cell = chart.matrix!.cells[r]?.[c];
              return cell && cell !== "n/a" ? [{ text: cell, role: "cell" as const, ref: row, col }] : [];
            }),
          ),
        ]
      : chart.data.flatMap((point) => [
          { text: point.label, role: "label" as const },
          { text: point.value, role: "value" as const, ref: point.label },
        ])),
    ...(chart.legend?.map((item) => ({ text: item.label, role: "legend" as const })) ?? []),
    ...(chart.form === "treemap" && !chart.matrix
      ? [...new Set(chart.data.flatMap((point) => (point.group ? [point.group] : [])))].map((text) => ({ text, role: "legend" as const }))
      : []),
    chart.benchmark ? { text: chart.benchmark.label, role: "benchmark" as const } : undefined,
    ...callouts.map((callout) => ({ text: callout.text, role: "callout" as const })),
    { text: spec.source, role: "source" },
    spec.footnote ? { text: spec.footnote, role: "footnote" } : undefined,
    brandMark ? { text: brandMark, role: "brand" } : undefined,
  ];
  return items.filter((item): item is ContractItem => Boolean(item?.text.trim()));
}

/** Pairs of marks whose sizes differ clearly, for the reviewer's which-is-bigger questions. */
function buildComparisons(spec: InfographicSpec): QaPlan["comparisons"] {
  if (!MARK_NOUN[spec.chart.form]) return [];
  const points = spec.chart.data
    .filter((point) => typeof point.numeric === "number" && point.numeric > 0)
    .sort((a, b) => (b.numeric ?? 0) - (a.numeric ?? 0));
  const pairs: QaPlan["comparisons"] = [];
  for (let i = 0; i + 1 < points.length && pairs.length < 10; i += 1) {
    const big = points[i];
    const small = points[i + 1];
    const ratio = (big.numeric ?? 0) / (small.numeric ?? 1);
    if (ratio < 1.15) continue;
    // Alternate which one is asked first so a "first" bias cannot pass every question.
    pairs.push(
      pairs.length % 2 === 0
        ? { first: big.label, second: small.label, larger: "first", ratio }
        : { first: small.label, second: big.label, larger: "second", ratio },
    );
  }
  return pairs;
}

const TENTHS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * The scale of a bar or column chart in words: the image model stretches short bars to fit their
 * labels unless told how short they are. Words, not digits, so no new number gets printed.
 */
function proportionNote(spec: InfographicSpec): string {
  const { form, data } = spec.chart;
  if (form !== "ranked_bar" && form !== "column") return "";
  if (data.length < 2 || data.some((point) => typeof point.numeric !== "number" || point.numeric <= 0)) return "";
  const longest = data.reduce((a, b) => ((b.numeric ?? 0) > (a.numeric ?? 0) ? b : a));
  const shortest = data.reduce((a, b) => ((b.numeric ?? 0) < (a.numeric ?? 0) ? b : a));
  const ratio = (shortest.numeric ?? 0) / (longest.numeric ?? 1);
  if (ratio > 0.85) return "";
  const tenths = Math.round(ratio * 10);
  const share = tenths === 0 ? "less than one tenth" : tenths === 1 ? "about one tenth" : `about ${TENTHS[tenths]} tenths`;
  const mark = form === "column" ? "column" : "bar";
  return `Scale check: the ${shortest.label} ${mark} is ${share} as long as the ${longest.label} ${mark}, and every ${mark} in between is in exact proportion.`;
}

/** The items a benchmark falls between, in display order. */
function benchmarkPlacement(spec: InfographicSpec): QaPlan["benchmark"] {
  const { benchmark, data, form } = spec.chart;
  if (!benchmark) return undefined;
  const layout = FORM_LAYOUT[form];
  if (layout !== "rows" && layout !== "columns") {
    throw new Error(
      `A benchmark line needs a ranked_bar, column, table, pictogram or timeline chart, not ${form}. Put the reference value in a callout instead.`,
    );
  }
  if (data.some((point) => typeof point.numeric !== "number")) {
    throw new Error("A benchmark line needs the numeric value of every data point. Add `numeric` to each point.");
  }
  // Items beyond the benchmark come first in a ranked chart; the rule goes after the last of them.
  const beyond = data.filter((point) => (point.numeric ?? 0) > benchmark.numeric);
  const within = data.filter((point) => (point.numeric ?? 0) <= benchmark.numeric);
  return { label: benchmark.label, above: beyond.at(-1)?.label, below: within[0]?.label };
}

export function compileInfographic(input: InfographicSpec, kit?: BrandKit): CompiledInfographic {
  const spec = cleanSpec(input);
  const format = FORMATS[spec.format];
  const { chart } = spec;
  const brandMark = spec.brandMark ?? kit?.publicationName;
  const preset =
    kit?.preferredStyle && kit.preferredStyle in STYLE_PRESETS
      ? (kit.preferredStyle as PresetKey)
      : spec.style.preset;
  const kitDirection = kit ? brandKitDirection(kit) : undefined;
  const callouts = checkedCallouts(spec);
  const contract = buildContract(spec, callouts, brandMark);
  const benchmark = benchmarkPlacement(spec);
  const across = FORM_LAYOUT[chart.form] === "columns" ? "columns" : "rows";

  const words = contract.reduce((sum, item) => sum + item.text.split(/\s+/).filter(Boolean).length, 0);
  const budget = WORD_BUDGET[spec.format];
  if (words > budget) {
    throw new Error(
      `This spec prints ${words} words; the ${spec.format} canvas holds about ${budget} before labels start to break. Trim it: shorten the footnote, subtitle and callouts, drop a callout, or aggregate the smallest data points into "Other". Then call generate_infographic again.`,
    );
  }

  const canvasHeight = Number(format.size.split("x")[1]);
  const minLabel = Math.round(canvasHeight * 0.016);
  const minFooter = Math.round(canvasHeight * 0.013);
  const markNoun = chart.matrix ? "row or column" : "data mark";

  const sections = [
    `A premium, publication-quality editorial data-journalism infographic: strict grid, refined typography, generous whitespace. ${format.label.split(",")[0]} canvas. Clear visual hierarchy: headline first, then the chart, then annotations, then the footer.`,

    // A brand kit is the style: it replaces the preset unless the kit names a preset to build on.
    `STYLE: ${
      kitDirection?.style && !kit?.preferredStyle
        ? kitDirection.style
        : `${STYLE_PRESETS[preset]}${kitDirection?.style ? ` ${kitDirection.style}` : ""}`
    }${spec.style.artDirection ? ` Topic art direction: ${spec.style.artDirection}` : ""}`,

    [
      "HEADER (top-left, left-aligned):",
      spec.kicker ? `- Kicker in small letter-spaced caps: "${spec.kicker}"` : "",
      `- Headline, very large and bold, dominant on the page: "${spec.title}"${spec.accentWord ? `, with its word ${spec.accentWord} set in the accent color` : ""}`,
      `- Subtitle in regular weight on at most two lines: "${spec.subtitle}"`,
    ]
      .filter(Boolean)
      .join("\n"),

    [
      `MAIN CHART: ${FORM_LAYOUTS[chart.form]}`,
      chart.layoutNotes ? `Arrangement notes (describe placement only, print none of these words): ${chart.layoutNotes}` : "",
      chart.unit ? `Unit note printed near the chart: "${chart.unit}"` : "",
      chart.matrix
        ? `Row axis title "${chart.matrix.rowHeader}", column axis title "${chart.matrix.columnHeader}". Rows top to bottom: ${chart.matrix.rows.map((r) => `"${r}"`).join(", ")}. Columns left to right: ${chart.matrix.columns.map((c) => `"${c}"`).join(", ")}. Cell values by row:`
        : "Data, in this exact order, each printed with its label and value label:",
      ...dataLines(spec),
      proportionNote(spec),
      chart.legend?.length
        ? `Legend: ${chart.legend.map((item) => `"${item.label}" = ${item.color}`).join("; ")}`
        : "",
      benchmark
        ? `Reference value: leave a clear gap between the ${benchmark.above ?? "first"} and ${benchmark.below ?? "last"} ${across} and print "${benchmark.label}" in small type at the ${across === "rows" ? "right end" : "top"} of that gap. Draw no line for it.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),

    callouts.length
      ? [
          "CALLOUTS: small annotation boxes, text exactly as quoted, in open space that covers no bar, label or value. Draw no pointer, arrow, tail or leader line on any callout: each note sits directly beside what it describes.",
          ...callouts.map((callout) =>
            callout.anchor
              ? `- "${callout.text}": placed close beside the ${callout.anchor} ${markNoun}, level with it.`
              : `- "${callout.text}": a free-standing note; it refers to the chart as a whole.`,
          ),
        ].join("\n")
      : "",

    spec.hero ? `HERO VISUAL: ${spec.hero.replace(/[.\s]+$/, "")}. It must never cover labels, values or the headline.` : "",

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

    chart.form === "line" ? "" : "No numeric axis, scale or tick numbers: every value is printed as its own label.",
    "Draw no average, target or threshold lines of your own.",

    `TYPE SIZES: labels, value labels and callouts at least ${minLabel}px tall; source and footnote at least ${minFooter}px tall. Nothing smaller.`,

    `TEXT RULES: Render every quoted string above exactly as written, spelled correctly and fully legible, each exactly once${chart.matrix ? " (cell values repeat only where the data repeats)" : ""}. Do not add any other words, numbers, percentages, dates, labels or logos that are not quoted above. No lorem ipsum, no pseudo-text, no watermark. Crisp vector-sharp typography, strong contrast, aligned grid, consistent spacing, all content inside a 5% safe margin.`,
  ].filter(Boolean);

  const layout = FORM_LAYOUT[chart.form] ?? "free";
  return {
    prompt: sections.join("\n\n"),
    size: format.size,
    referenceImages: kitDirection?.referenceImages ?? [],
    fileName: spec.fileName ?? slugify(spec.title),
    qa: {
      contract,
      layout: chart.matrix ? "matrix" : layout === "matrix" ? "free" : layout,
      comparisons: buildComparisons(spec),
      markNoun: MARK_NOUN[chart.form] ?? "mark",
      labels: chart.matrix ? [...chart.matrix.rows, ...chart.matrix.columns] : chart.data.map((point) => point.label),
      callouts,
      axis: chart.form === "line",
      benchmark,
    },
    meta: {
      form: chart.form,
      format: spec.format,
      preset,
      brandKitId: spec.brandKitId,
      dataPoints: chart.matrix ? chart.matrix.rows.length * chart.matrix.columns.length : chart.data.length,
      strings: contract.length,
      words,
    },
  };
}
