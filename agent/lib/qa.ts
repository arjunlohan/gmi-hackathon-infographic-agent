// Deterministic half of the fact-check. The vision model only reports what it sees (a blind
// transcription with positions); everything below compares that against the spec in code, so
// the model never grades its own reading and never echoes the text it was told to expect.

export type Box = [number, number, number, number]; // left, top, right, bottom in 0-1000

export type Role =
  | "kicker"
  | "title"
  | "subtitle"
  | "unit"
  | "label"
  | "value"
  | "row"
  | "column"
  | "cell"
  | "axis"
  | "legend"
  | "callout"
  | "source"
  | "footnote"
  | "brand"
  | "benchmark"
  | "text";

/** One string the image must print. `ref` names its data label (value) or row (cell). */
export type ContractItem = { text: string; role: Role; ref?: string; col?: string };

/** A callout and the data element its pointer must end on (none for a general statement). */
export type CalloutCheck = { text: string; anchor?: string };

/** Everything the reviewer needs to check a render, compiled from the spec. */
export type QaPlan = {
  contract: ContractItem[];
  // How data labels are laid out, which decides the order and placement checks.
  layout: "rows" | "columns" | "matrix" | "free";
  // Size comparisons between data marks; `larger` is the true answer for the order shown.
  comparisons: { first: string; second: string; larger: "first" | "second"; ratio: number }[];
  markNoun: string;
  labels: string[];
  callouts: CalloutCheck[];
  // Whether the chart form has a numeric axis; elsewhere tick numbers are invented text.
  axis?: boolean;
  // A reference value (an average, a target) drawn by code as a dashed rule between the rows
  // (or columns) it separates; `above` is the last label beyond it, `below` the first within it.
  benchmark?: { label: string; above?: string; below?: string };
};

/** Where a contract string was found on the image. */
export type Located = { role: Role; text: string; ref?: string; box: Box };

export type Transcribed = { text: string; box: Box; role: string; malformed: boolean };

export type DefectKind =
  | "misspelled"
  | "missing"
  | "invented"
  | "malformed"
  | "misplaced"
  | "order"
  | "magnitude"
  | "callout"
  | "encoding";

export type Defect = {
  kind: DefectKind;
  // 3: a number, value or data encoding is wrong. 2: a name or copy is wrong. 1: cosmetic.
  severity: 1 | 2 | 3;
  message: string;
  // One literal line for the image editor.
  fix: string;
  // Needs a fresh render: an editor cannot reorder or re-lay out a chart.
  structural?: boolean;
  expected?: string;
  found?: string;
  box?: Box;
};

export type MatchResult = { defects: Defect[]; formatNotes: string[]; checks: number; positions: Located[] };

export function norm(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032`]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const squash = (text: string) => norm(text).replace(/\s/g, "");
const hasAlnum = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** Same characters apart from punctuation, currency, grouping commas and unit suffixes. */
function core(text: string): string {
  return squash(text)
    .replace(/(?<!\d)[.-]|[.-](?!\d)/g, "")
    .replace(/[,:;'"*·•()[\]$€£¥%!?]/g, "")
    .replace(/(\d)(bn|mn|[kmbt])(?![a-z])/g, "$1");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  return 1 - levenshtein(x, y) / Math.max(1, x.length, y.length);
}

type Slot = {
  index: number;
  item: Transcribed;
  rest: string; // squashed text not yet claimed by a contract string
  display: string; // the same, as drawn
  used: boolean;
  cx: number;
  cy: number;
};

const VALUE_ROLES = new Set<Role>(["value", "cell"]);
const NUMERIC = /^[\d\s.,%$€£¥<>~+-]*(bn|mn|[kmbt])?$/i;

/** Where a box sits, in words an image editor understands. */
export function where(box?: Box): string {
  if (!box) return "";
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const v = cy < 333 ? "top" : cy < 666 ? "middle" : "bottom";
  const h = cx < 333 ? "left" : cx < 666 ? "center" : "right";
  return v === "middle" && h === "center" ? "center" : `${v} ${h}`;
}

/** Remove one occurrence of `part` from `text`, ignoring case, spacing and quote styles. */
function removeLoosely(text: string, part: string): string {
  const pattern = [...squash(part)]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  try {
    return text.normalize("NFKC").replace(new RegExp(pattern, "i"), " ").replace(/\s+/g, " ");
  } catch {
    return text;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Typical spacing between neighbouring positions (row pitch or column pitch). */
function pitch(positions: number[]): number {
  const sorted = [...positions].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((value, i) => value - sorted[i]).filter((gap) => gap > 2);
  return Math.max(12, median(gaps));
}

function placement(item: ContractItem, plan: QaPlan): string {
  switch (item.role) {
    case "value":
      return plan.layout === "columns"
        ? `above the "${item.ref}" column`
        : plan.layout === "rows"
          ? `at the end of the "${item.ref}" bar`
          : `beside "${item.ref}"`;
    case "cell":
      return `centered in the cell at row "${item.ref}", column "${item.col}"`;
    case "title":
    case "kicker":
    case "subtitle":
      return "in the header at the top";
    case "source":
    case "footnote":
    case "brand":
      return "in the footer at the bottom";
    case "legend":
      return "in the legend";
    default:
      return "where it belongs";
  }
}

/**
 * Match the blind transcription against the text contract:
 *   1. exact matches for headings, labels and copy (longest first), then multi-line joins
 *   2. values and matrix cells by exact text, nearest to where their row or column was found
 *   3. near-misses become misspellings; what is left over is missing or invented
 * Positions also give row order and value placement for free.
 */
export function matchTranscription(texts: Transcribed[], plan: QaPlan): MatchResult {
  const slots: Slot[] = texts.map((item, index) => ({
    index,
    item,
    rest: squash(item.text),
    display: item.text,
    used: !hasAlnum(item.text),
    cx: (item.box[0] + item.box[2]) / 2,
    cy: (item.box[1] + item.box[3]) / 2,
  }));
  const defects: Defect[] = [];
  const formatNotes: string[] = [];
  const matched = new Map<ContractItem, Slot[]>();
  const claim = (item: ContractItem, found: Slot[]) => {
    for (const slot of found) slot.used = true;
    matched.set(item, found);
  };

  const anchors = plan.contract
    .filter((item) => !VALUE_ROLES.has(item.role))
    .sort((a, b) => squash(b.text).length - squash(a.text).length);
  const values = plan.contract.filter((item) => VALUE_ROLES.has(item.role));

  // 1. Headings, labels and copy: exact, then split across consecutive lines, then inside a
  // longer line that merged two strings.
  // A name can be both a row and a column header; column headers run along the top and row
  // headers down the left, so ties go to the topmost or leftmost copy.
  const prefer = (role: Role) => (a: Slot, b: Slot) =>
    role === "column" ? a.cy - b.cy : role === "row" ? a.cx - b.cx : a.index - b.index;
  for (const item of anchors) {
    const target = squash(item.text);
    const slot = slots.filter((s) => !s.used && s.rest === target).sort(prefer(item.role))[0];
    if (slot) claim(item, [slot]);
  }
  for (const item of anchors) {
    if (matched.has(item)) continue;
    const target = squash(item.text);
    search: for (let start = 0; start < slots.length; start += 1) {
      let joined = "";
      for (let end = start; end < Math.min(slots.length, start + 5); end += 1) {
        const last = slots[end];
        if (last.used) break;
        const before = joined;
        joined += last.rest;
        if (joined === target && end > start) {
          claim(item, slots.slice(start, end + 1));
          break search;
        }
        // The string ends partway through a line that carries more text after it.
        if (end > start && joined.startsWith(target) && target.length > before.length) {
          const consumed = target.slice(before.length);
          claim(item, slots.slice(start, end));
          last.rest = last.rest.slice(consumed.length);
          last.display = removeLoosely(last.display, consumed);
          if (!hasAlnum(last.rest)) last.used = true;
          matched.set(item, slots.slice(start, end + 1));
          break search;
        }
        if (!target.startsWith(joined)) break;
      }
    }
  }
  for (const item of anchors) {
    if (matched.has(item)) continue;
    const target = squash(item.text);
    if (target.length < 8 && !item.text.trim().includes(" ")) continue;
    const slot = slots.find((s) => !s.used && s.rest.includes(target));
    if (!slot) continue;
    slot.rest = slot.rest.replace(target, " ");
    slot.display = removeLoosely(slot.display, item.text);
    if (!hasAlnum(slot.rest)) slot.used = true;
    matched.set(item, [slot]);
  }

  // Geometry from the labels that were found.
  const position = (text: string, roles: Role[]) => {
    const item = plan.contract.find((c) => roles.includes(c.role) && c.text === text);
    const slot = item ? matched.get(item)?.[0] : undefined;
    return slot ? { x: slot.cx, y: slot.cy } : undefined;
  };
  const labelRoles: Role[] = plan.layout === "matrix" ? ["row", "column"] : ["label"];
  const located = plan.labels
    .map((label) => ({ label, at: position(label, labelRoles) }))
    .filter((entry): entry is { label: string; at: { x: number; y: number } } => Boolean(entry.at));
  const rowPitch = pitch(
    plan.layout === "matrix"
      ? plan.contract.filter((c) => c.role === "row").flatMap((c) => position(c.text, ["row"])?.y ?? [])
      : located.map((entry) => entry.at.y),
  );
  const colPitch = pitch(
    plan.layout === "matrix"
      ? plan.contract.filter((c) => c.role === "column").flatMap((c) => position(c.text, ["column"])?.x ?? [])
      : located.map((entry) => entry.at.x),
  );

  const expectedAt = (item: ContractItem): { x?: number; y?: number } | undefined => {
    if (item.role === "cell" && item.ref && item.col) {
      const row = position(item.ref, ["row"]);
      const col = position(item.col, ["column"]);
      return row && col ? { x: col.x, y: row.y } : undefined;
    }
    if (item.role !== "value" || !item.ref) return undefined;
    const label = position(item.ref, ["label"]);
    if (!label) return undefined;
    if (plan.layout === "rows") return { y: label.y };
    if (plan.layout === "columns") return { x: label.x };
    return undefined;
  };
  // Distance in row/column pitches; under 0.5 means the value sits in its own row or cell.
  const offset = (slot: Slot, at?: { x?: number; y?: number }) => {
    if (!at) return 0;
    const dy = at.y === undefined ? 0 : Math.abs(slot.cy - at.y) / rowPitch;
    const dx = at.x === undefined ? 0 : Math.abs(slot.cx - at.x) / colPitch;
    return Math.max(dx, dy);
  };
  const nearestLabel = (slot: Slot) => {
    let best: { label: string; d: number } | undefined;
    for (const entry of located) {
      const d =
        plan.layout === "columns" ? Math.abs(slot.cx - entry.at.x) : Math.abs(slot.cy - entry.at.y);
      if (!best || d < best.d) best = { label: entry.label, d };
    }
    return best?.label;
  };

  // 2. Values and cells: the same number can legitimately appear several times, so each goes
  // to the nearest unclaimed copy of its text.
  const pairs: { item: ContractItem; slot: Slot; d: number }[] = [];
  for (const item of values) {
    const target = squash(item.text);
    const at = expectedAt(item);
    for (const slot of slots) {
      if (slot.used || slot.rest !== target) continue;
      pairs.push({ item, slot, d: offset(slot, at) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { item, slot, d } of pairs) {
    if (matched.has(item) || slot.used) continue;
    claim(item, [slot]);
    if (d > 0.6) {
      const other = item.role === "value" ? nearestLabel(slot) : undefined;
      defects.push({
        kind: "misplaced",
        severity: 3,
        structural: true,
        expected: item.text,
        box: slot.item.box,
        message:
          item.role === "cell"
            ? `"${item.text}" (row ${item.ref}, column ${item.col}) is printed in the wrong cell.`
            : `The value "${item.text}" for "${item.ref}" is printed on the ${other ? `"${other}"` : "wrong"} ${plan.layout === "columns" ? "column" : "row"}.`,
        fix: `The ${item.role === "cell" ? `cell at row "${item.ref}", column "${item.col}"` : `value label of "${item.ref}"`} must read "${item.text}".`,
      });
    }
  }

  // 3. Near-misses. Values look for a candidate in their own row or cell first.
  const candidates = () => {
    const list: { text: string; slots: Slot[] }[] = [];
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].used || slots[i].rest !== squash(slots[i].item.text)) continue;
      list.push({ text: slots[i].item.text, slots: [slots[i]] });
      if (i + 1 < slots.length && !slots[i + 1].used) {
        list.push({ text: `${slots[i].item.text} ${slots[i + 1].item.text}`, slots: [slots[i], slots[i + 1]] });
      }
    }
    return list;
  };
  const unmatched = plan.contract.filter((item) => !matched.has(item));
  const near: { item: ContractItem; found: { text: string; slots: Slot[] }; score: number }[] = [];
  for (const item of unmatched) {
    const at = expectedAt(item);
    const short = squash(item.text).length <= 5;
    for (const found of candidates()) {
      if (VALUE_ROLES.has(item.role)) {
        if (found.slots.length > 1) continue;
        if (at ? offset(found.slots[0], at) > 0.5 : similarity(item.text, found.text) < 0.5) continue;
        near.push({ item, found, score: at ? 2 - offset(found.slots[0], at) : similarity(item.text, found.text) });
      } else {
        const score = similarity(item.text, found.text);
        if (score >= (short ? 0.5 : 0.6)) near.push({ item, found, score });
      }
    }
  }
  near.sort((a, b) => b.score - a.score);
  for (const { item, found } of near) {
    if (matched.has(item) || found.slots.some((slot) => slot.used)) continue;
    claim(item, found.slots);
    const box = found.slots[0].item.box;
    if (core(item.text) === core(found.text)) {
      formatNotes.push(`"${item.text}" is printed as "${found.text}" (formatting only).`);
      continue;
    }
    defects.push({
      kind: "misspelled",
      severity: VALUE_ROLES.has(item.role) || /\d/.test(item.text) ? 3 : 2,
      expected: item.text,
      found: found.text,
      box,
      message: `Expected "${item.text}", found "${found.text}".`,
      fix: `Replace the text "${found.text}" with "${item.text}" (${where(box)}${item.role === "value" ? `, the value label of "${item.ref}"` : item.role === "cell" ? `, row "${item.ref}", column "${item.col}"` : ""}).`,
    });
  }

  for (const item of plan.contract) {
    if (matched.has(item)) continue;
    defects.push({
      kind: "missing",
      severity: VALUE_ROLES.has(item.role) || /\d/.test(item.text) ? 3 : 2,
      expected: item.text,
      found: "missing",
      message: `Missing "${item.text}".`,
      fix: `Add the text "${item.text}" ${placement(item, plan)}.`,
    });
  }

  // Malformed glyphs on text that otherwise reads correctly.
  for (const found of matched.values()) {
    for (const slot of found) {
      if (!slot.item.malformed) continue;
      defects.push({
        kind: "malformed",
        severity: 2,
        expected: slot.item.text,
        box: slot.item.box,
        message: `"${slot.item.text}" has malformed or broken letters.`,
        fix: `Redraw the text "${slot.item.text}" (${where(slot.item.box)}) with clean, correctly formed letters, same words, size and color.`,
      });
    }
  }

  // Leftovers are text the brief never asked for. Stray tick numbers are one finding: an
  // unrequested scale is removed as a whole, and it often disagrees with the value labels.
  const ticks: Slot[] = [];
  for (const slot of slots) {
    if (slot.used || !hasAlnum(slot.rest)) continue;
    const text = slot.display.trim();
    const role = slot.item.role;
    if (role === "decoration") continue;
    if (role === "axis" && NUMERIC.test(text)) {
      if (!plan.axis) ticks.push(slot);
      continue;
    }
    if (plan.layout !== "free" && /^#?\d{1,2}[.)]?$/.test(text.trim())) continue; // rank numbers
    if (slot.rest.replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
    const duplicate = plan.contract.some((item) => squash(item.text) === squash(text));
    defects.push({
      kind: "invented",
      severity: /\d/.test(text) ? 3 : 2,
      found: text,
      box: slot.item.box,
      message: duplicate ? `"${text}" is printed twice.` : `Not in the brief: "${text}".`,
      fix: `Remove the ${duplicate ? "extra copy of the " : ""}text "${text}" (${where(slot.item.box)}) and leave that space clean.`,
    });
  }

  if (ticks.length) {
    const box: Box = [
      Math.min(...ticks.map((slot) => slot.item.box[0])),
      Math.min(...ticks.map((slot) => slot.item.box[1])),
      Math.max(...ticks.map((slot) => slot.item.box[2])),
      Math.max(...ticks.map((slot) => slot.item.box[3])),
    ];
    const list = ticks.map((slot) => slot.item.text.trim()).join(", ");
    defects.push({
      kind: "invented",
      severity: 3,
      found: list,
      box,
      message: `An axis scale nobody asked for is drawn (${list}).`,
      fix: `Remove the numeric axis scale and all its tick numbers (${where(box)}); the value labels carry the numbers.`,
    });
  }

  // Row or column order, read off the label positions.
  let checks = plan.contract.length;
  if ((plan.layout === "rows" || plan.layout === "columns") && located.length >= 3) {
    checks += 1;
    const axis = (entry: (typeof located)[number]) => (plan.layout === "rows" ? entry.at.y : entry.at.x);
    const tolerance = (plan.layout === "rows" ? rowPitch : colPitch) * 0.4;
    const inverted = located.some((entry, i) => i > 0 && axis(located[i - 1]) > axis(entry) + tolerance);
    if (inverted) {
      const observed = [...located].sort((a, b) => axis(a) - axis(b)).map((entry) => entry.label);
      defects.push({
        kind: "order",
        severity: 3,
        structural: true,
        message: `${plan.layout === "rows" ? "Rows" : "Columns"} are out of order: drawn as ${observed.join(", ")}.`,
        fix: `${plan.layout === "rows" ? "Rows top to bottom" : "Columns left to right"} must be exactly: ${plan.labels.join(", ")}.`,
      });
    }
  }
  checks += values.length > 0 && plan.layout !== "free" ? 1 : 0;

  const positions: Located[] = [];
  for (const [item, found] of matched) {
    const boxes = found.map((slot) => slot.item.box);
    positions.push({
      role: item.role,
      text: item.text,
      ref: item.ref,
      box: [
        Math.min(...boxes.map((b) => b[0])),
        Math.min(...boxes.map((b) => b[1])),
        Math.max(...boxes.map((b) => b[2])),
        Math.max(...boxes.map((b) => b[3])),
      ],
    });
  }

  return { defects, formatNotes, checks, positions };
}

const NO_POINTER = new Set(["", "none", "no pointer", "nothing", "n/a", "no"]);

/** Callout text is matched loosely: same opening words, or most words in common. */
export function sameCallout(observed: string, expected: string): boolean {
  const a = norm(observed);
  const b = norm(expected);
  if (a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24))) return true;
  const words = new Set(a.split(" "));
  const shared = b.split(" ").filter((word) => words.has(word)).length;
  return shared / Math.max(1, b.split(" ").length) >= 0.6;
}

/** A pointer the render drew, as the vision model saw it. */
export type ObservedPointer = { callout: string; pointsTo: string; tip?: number[] };

/** Whether each callout's own pointer is right: true, false, or null when it has none. */
export type PointerVerdict = { callout: string; ok: boolean | null };

/**
 * Callout connectors are drawn by code after the render, exactly on their anchors, because image
 * models cannot place a pointer tip reliably and editors cannot move one. A pointer the model drew
 * anyway is kept only when its tip lands on the anchor; otherwise it has to go (removal is an edit
 * models do well). The vision model reports where the tip is; which row that is gets decided here
 * from the positions of the labels, because models name the wrong row far more often than they
 * misplace a point.
 */
export function checkPointers(
  pointers: ObservedPointer[],
  callouts: CalloutCheck[],
  positions: Located[],
): { defects: Defect[]; verdicts: PointerVerdict[] } {
  const defects: Defect[] = [];
  const verdicts: PointerVerdict[] = [];
  // Each data element's footprint: its label plus its value (or a matrix header).
  const footprints = new Map<string, Box>();
  for (const item of positions) {
    const key = item.role === "value" ? item.ref : ["label", "row", "column"].includes(item.role) ? item.text : undefined;
    if (!key) continue;
    const box = footprints.get(key);
    footprints.set(
      key,
      box
        ? [Math.min(box[0], item.box[0]), Math.min(box[1], item.box[1]), Math.max(box[2], item.box[2]), Math.max(box[3], item.box[3])]
        : item.box,
    );
  }
  const heights = [...footprints.values()].map((box) => box[3] - box[1]);
  const reach = Math.max(20, median(heights) * 1.5);
  const distance = (box: Box, x: number, y: number) =>
    Math.hypot(Math.max(box[0] - x, 0, x - box[2]), Math.max(box[1] - y, 0, y - box[3]));

  for (const callout of callouts) {
    const observed = pointers.find((item) => sameCallout(item.callout, callout.text));
    if (!observed) continue; // a missing callout is already a text finding
    const named = norm(observed.pointsTo).replace(/^the /, "");
    const hasPointer = observed.tip?.length === 2 || !NO_POINTER.has(named);
    if (!hasPointer) {
      verdicts.push({ callout: callout.text, ok: null });
      continue;
    }
    let ok = false;
    let landsOn = observed.pointsTo;
    if (callout.anchor && observed.tip?.length === 2 && footprints.size > 0) {
      const [x, y] = observed.tip;
      let nearest: { key: string; d: number } | undefined;
      for (const [key, box] of footprints) {
        const d = distance(box, x, y);
        if (!nearest || d < nearest.d) nearest = { key, d };
      }
      ok = nearest?.key === callout.anchor && nearest.d <= reach;
      landsOn = nearest && nearest.d <= reach ? nearest.key : "empty space";
    } else if (callout.anchor) {
      const anchor = norm(callout.anchor);
      ok = named.includes(anchor) || anchor.includes(named);
    }
    verdicts.push({ callout: callout.text, ok });
    if (ok) continue;
    defects.push({
      kind: "callout",
      severity: 3,
      message: callout.anchor
        ? `The callout "${callout.text}" points at ${landsOn === "empty space" ? "empty space" : `"${landsOn}"`} instead of "${callout.anchor}".`
        : `The callout "${callout.text}" is about the whole chart but has a pointer.`,
      fix: `Erase only the pointer, arrow or leader line of the callout "${callout.text}", filling in the background behind it; keep its box and text exactly where they are.`,
    });
  }
  return { defects, verdicts };
}

/**
 * Lines marking an average or threshold are drawn by code, exactly between the right items. One
 * the model drew itself sits wherever it guessed, so it is removed, and the edit names that line
 * alone: a vague "remove the average line" also strips callouts and labels near it.
 */
export function checkReferenceLines(lines: { orientation: string; where: string }[]): Defect[] {
  return lines.map((line) => ({
    kind: "encoding" as const,
    severity: 3 as const,
    message: `The render draws its own ${line.orientation} average or threshold line (${line.where}), not placed by the data.`,
    fix: `Erase only the long ${line.orientation} line that runs across the chart ${line.where}, filling in the background behind it. Keep every bar, label, value, callout box and callout arrow exactly as it is.`,
  }));
}

/** Size comparisons the vision model answered, checked against the data. */
export function checkComparisons(
  answers: { id: number; answer: "first" | "second" | "same" | "unclear" }[],
  plan: QaPlan,
): Defect[] {
  const defects: Defect[] = [];
  plan.comparisons.forEach((pair, id) => {
    const answer = answers.find((item) => item.id === id)?.answer;
    if (!answer || answer === "unclear") return;
    const wrongWay = answer !== "same" && answer !== pair.larger;
    const flat = answer === "same" && pair.ratio >= 1.5;
    if (!wrongWay && !flat) return;
    const big = pair.larger === "first" ? pair.first : pair.second;
    const small = pair.larger === "first" ? pair.second : pair.first;
    defects.push({
      kind: "magnitude",
      severity: 3,
      message: `The "${big}" ${plan.markNoun} should be ${pair.ratio.toFixed(1)}x the "${small}" ${plan.markNoun} but is drawn ${flat ? "the same size" : "smaller"}.`,
      fix: `Make the "${big}" ${plan.markNoun} clearly larger than the "${small}" ${plan.markNoun}, in proportion to their values.`,
    });
  });
  return defects;
}

/** Weighted defect count used to rank drafts: a wrong number outweighs a stray word. */
export function defectWeight(defects: readonly { severity: number }[]): number {
  return defects.reduce((sum, defect) => sum + defect.severity, 0);
}

/** Rank a reviewed draft: every check passing first, then fewer and lighter defects, then design. */
export function rankOf(review: { verdict: string; defects: readonly { severity: number }[]; score: number }): number[] {
  return [review.verdict === "publish" ? 1 : 0, -defectWeight(review.defects), review.score];
}

/** Drafts saved before the structured plan existed carry only a list of strings. */
export function legacyPlan(textContract: string[], callouts: CalloutCheck[] = []): QaPlan {
  return {
    contract: textContract.map((text) => ({ text, role: "text" })),
    layout: "free",
    comparisons: [],
    markNoun: "mark",
    labels: [],
    callouts,
    axis: true,
  };
}
