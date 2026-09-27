// Geometry the image model cannot place reliably is drawn by code on top of its render: callout
// connectors that end exactly on their data mark, and benchmark rules exactly between the items
// they separate. Positions come from the fact-check's blind read of the same image, so the
// overlay lands on what was actually drawn, not on where the prompt asked things to go.

import { put } from "@vercel/blob";
import type { Box, CalloutCheck, Located, PointerVerdict, QaPlan } from "./qa";
import { norm } from "./qa";

type Point = { x: number; y: number }; // 0-1000 image coordinates
type Line = { from: Point; to: Point; dashed?: boolean; dot?: boolean };

const GAP = 8;

const center = (box: Box): Point => ({ x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 });
const union = (boxes: Box[]): Box => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

/** The point on a box's outline closest to `p`, pushed `gap` units outward. */
function edgeToward(box: Box, p: Point, gap = GAP): Point {
  const x = Math.min(Math.max(p.x, box[0]), box[2]);
  const y = Math.min(Math.max(p.y, box[1]), box[3]);
  const dx = p.x - x;
  const dy = p.y - y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: x + (dx / length) * gap, y: y + (dy / length) * gap };
}

function find(positions: Located[], role: string, text: string): Located | undefined {
  return positions.find((item) => item.role === role && norm(item.text) === norm(text));
}

/** Where a callout's connector ends: just outside its anchor's value label, else its label. */
function anchorTarget(callout: CalloutCheck, positions: Located[], plan: QaPlan, from: Box): Point | undefined {
  if (!callout.anchor) return undefined;
  const anchor = callout.anchor;
  const value = positions.find((item) => item.role === "value" && item.ref === anchor);
  const label =
    find(positions, "label", anchor) ?? find(positions, "row", anchor) ?? find(positions, "column", anchor);
  const target = plan.layout === "rows" || plan.layout === "columns" ? (value ?? label) : (label ?? value);
  if (!target) return undefined;
  const c = center(from);
  const box = target.box;
  if (plan.layout === "columns") {
    return c.y < box[1] ? { x: center(box).x, y: box[1] - GAP } : { x: center(box).x, y: box[3] + GAP };
  }
  if (c.x >= box[2]) return { x: box[2] + GAP, y: center(box).y };
  if (c.x <= box[0]) return { x: box[0] - GAP, y: center(box).y };
  return c.y < box[1] ? { x: center(box).x, y: box[1] - GAP } : { x: center(box).x, y: box[3] + GAP };
}

export type Overlay = { lines: Line[] };

/**
 * Connectors for callouts the render left without a (correct) pointer, and the benchmark rule.
 * Returns no lines when nothing needs drawing.
 */
export function planOverlay(
  review: { positions: Located[]; pointers: PointerVerdict[] },
  plan: QaPlan,
): Overlay {
  const lines: Line[] = [];
  const { positions } = review;

  for (const callout of plan.callouts) {
    const box = find(positions, "callout", callout.text)?.box;
    if (!box || !callout.anchor) continue;
    // Keep the model's own pointer when the fact-check found it ends on the anchor.
    if (review.pointers.find((item) => item.callout === callout.text)?.ok) continue;
    const to = anchorTarget(callout, positions, plan, box);
    if (!to) continue;
    const from = edgeToward(box, to, 5);
    if (Math.hypot(to.x - from.x, to.y - from.y) < 14) continue; // already touching
    lines.push({ from, to, dot: true });
  }

  const benchmark = plan.benchmark;
  if (benchmark && (plan.layout === "rows" || plan.layout === "columns")) {
    const rows = plan.labels.flatMap((label) => {
      const item = find(positions, "label", label);
      return item ? [item.box] : [];
    });
    const values = positions.filter((item) => item.role === "value").map((item) => item.box);
    const above = benchmark.above ? find(positions, "label", benchmark.above)?.box : undefined;
    const below = benchmark.below ? find(positions, "label", benchmark.below)?.box : undefined;
    if (rows.length >= 2 && (above || below)) {
      const extent = union([...rows, ...values]);
      if (plan.layout === "rows") {
        const pitch = (extent[3] - extent[1]) / Math.max(1, rows.length);
        const y = above && below ? (center(above).y + center(below).y) / 2 : above ? center(above).y + pitch / 2 : center(below!).y - pitch / 2;
        const label = find(positions, "benchmark", benchmark.label)?.box;
        // Stop the rule short of its label when the label sits on the rule's line.
        const onLine = label && y >= label[1] - GAP && y <= label[3] + GAP && label[0] > extent[0];
        lines.push({ from: { x: extent[0], y }, to: { x: onLine ? label[0] - GAP : extent[2] + GAP, y }, dashed: true });
        if (label && !onLine && Math.abs(center(label).y - y) > (label[3] - label[1]) * 0.8) {
          const end = { x: Math.min(Math.max(center(label).x, extent[0]), extent[2]), y };
          lines.push({ from: edgeToward(label, end, 4), to: end });
        }
      } else {
        const pitch = (extent[2] - extent[0]) / Math.max(1, rows.length);
        const x = above && below ? (center(above).x + center(below).x) / 2 : above ? center(above).x + pitch / 2 : center(below!).x - pitch / 2;
        const label = find(positions, "benchmark", benchmark.label)?.box;
        const onLine = label && x >= label[0] - GAP && x <= label[2] + GAP && label[3] < extent[3];
        lines.push({ from: { x, y: onLine ? label[3] + GAP : extent[1] - GAP }, to: { x, y: extent[3] }, dashed: true });
        if (label && !onLine && Math.abs(center(label).x - x) > (label[2] - label[0]) * 0.8) {
          const end = { x, y: Math.min(Math.max(center(label).y, extent[1]), extent[3]) };
          lines.push({ from: edgeToward(label, end, 4), to: end });
        }
      }
    }
  }
  return { lines };
}

/** Draw the overlay onto the render and publish the result; the render itself is untouched. */
export async function composeOverlay(
  imageUrl: string,
  overlay: Overlay,
  name: string,
): Promise<{ url: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download render for overlay (${response.status}).`);
  const source = Buffer.from(await response.arrayBuffer());
  const { width = 0, height = 0 } = await sharp(source).metadata();
  if (!width || !height) throw new Error("Render has no dimensions.");

  // Ink that reads on the local background: sample the area the lines cross.
  const area = union(overlay.lines.flatMap((line) => [[line.from.x, line.from.y, line.to.x, line.to.y] as Box]));
  const left = Math.floor((Math.max(0, area[0] - 20) / 1000) * width);
  const top = Math.floor((Math.max(0, area[1] - 20) / 1000) * height);
  const stats = await sharp(source)
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.ceil(((area[2] - area[0] + 40) / 1000) * width))),
      height: Math.max(1, Math.min(height - top, Math.ceil(((area[3] - area[1] + 40) / 1000) * height))),
    })
    .stats();
  const [r, g, b] = stats.channels.map((channel) => channel.mean);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  const ink = dark ? "rgba(245,245,240,0.9)" : "rgba(28,28,32,0.85)";

  const stroke = Math.max(2, Math.round(width * 0.0016));
  const px = (p: Point) => ({ x: (p.x / 1000) * width, y: (p.y / 1000) * height });
  const shapes = overlay.lines.map((line) => {
    const a = px(line.from);
    const z = px(line.to);
    const path = `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${z.x.toFixed(1)}" y2="${z.y.toFixed(1)}" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round"${line.dashed ? ` stroke-dasharray="${stroke * 4} ${stroke * 3}"` : ""}/>`;
    const dot = line.dot ? `<circle cx="${z.x.toFixed(1)}" cy="${z.y.toFixed(1)}" r="${stroke * 2.2}" fill="${ink}"/>` : "";
    return path + dot;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join("")}</svg>`;
  const png = await sharp(source).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();

  const blob = await put(`renders/${name.replace(/[^\w-]+/g, "-").slice(0, 80)}.png`, png, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/png",
  });
  return { url: blob.url, width, height };
}
