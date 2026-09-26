// Brand kits: a publication's logo, palette, fonts, notes and past graphics, applied to every
// render in a chat that selects the kit. Stored in Vercel Blob because Hy Image needs public
// reference URLs anyway. Each save writes a new version file (brand-kits/<id>/<timestamp>.json)
// and deletes older ones, so reads go through list() and never hit a stale CDN copy.

import { del, list, put } from "@vercel/blob";
import { generateText } from "ai";
import { z } from "zod";

const PREFIX = "brand-kits/";
export const MAX_REFERENCES = 4; // Hy accepts 5 reference images; one slot stays for the logo.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const brandKitInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  publicationName: z.string().trim().max(60).optional(),
  logoUrl: z.url().optional(),
  colors: z.array(hex).max(6).default([]),
  headingFont: z.string().trim().max(60).optional(),
  bodyFont: z.string().trim().max(60).optional(),
  preferredStyle: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(600).optional(),
  referenceUrls: z.array(z.url()).max(MAX_REFERENCES).default([]),
});

export type BrandKitInput = z.infer<typeof brandKitInputSchema>;
export type BrandKit = BrandKitInput & {
  id: string;
  ownerId: string;
  updatedAt: number;
  // Written description of the past graphics' look. Hy gets this text, never the images:
  // sending past graphics as reference images leaks their labels and numbers into new renders.
  styleSummary?: string;
  styleSummaryFor?: string[];
};

/** Muse Spark studies the past graphics once, when the kit is saved. */
export async function describeHouseStyle(referenceUrls: string[]): Promise<string | undefined> {
  if (referenceUrls.length === 0) return undefined;
  const images = await Promise.all(
    referenceUrls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not read reference ${url}`);
      return {
        type: "file" as const,
        mediaType: response.headers.get("content-type") ?? "image/jpeg",
        data: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );
  const { text } = await generateText({
    model: "meta/muse-spark-1.3-contributor",
    reasoning: "low",
    abortSignal: AbortSignal.timeout(90_000),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "These are past infographics from one publication. Write a house-style guide (90-140 words) an illustrator could follow to make a new graphic that looks like part of the same series. Cover: background color and texture, headline and label typography (weight, case, serif or sans, condensed or not), how color is used on data marks and accents, layout conventions (alignment, margins, rules, callout style), and illustration or photo treatment. Describe only the look. Never mention any subject, word, number, country, or chart content that appears in them. Plain prose, no lists, no preamble.",
          },
          ...images,
        ],
      },
    ],
  });
  return text.trim().slice(0, 1200) || undefined;
}

async function latestVersionUrl(id: string): Promise<{ url: string; stale: string[] } | undefined> {
  const { blobs } = await list({ prefix: `${PREFIX}${id}/` });
  if (blobs.length === 0) return undefined;
  const sorted = [...blobs].sort((a, b) => b.pathname.localeCompare(a.pathname));
  return { url: sorted[0].url, stale: sorted.slice(1).map((blob) => blob.url) };
}

export async function getBrandKit(id: string): Promise<BrandKit | undefined> {
  if (!/^[\w-]{6,64}$/.test(id)) return undefined;
  const latest = await latestVersionUrl(id);
  if (!latest) return undefined;
  const response = await fetch(latest.url, { cache: "no-store" });
  return response.ok ? ((await response.json()) as BrandKit) : undefined;
}

export async function saveBrandKit(kit: BrandKit): Promise<BrandKit> {
  const saved = { ...kit, updatedAt: Date.now() };
  const referencesChanged =
    JSON.stringify(kit.styleSummaryFor ?? []) !== JSON.stringify(kit.referenceUrls);
  if (referencesChanged) {
    try {
      saved.styleSummary = await describeHouseStyle(kit.referenceUrls);
      saved.styleSummaryFor = kit.referenceUrls;
    } catch {
      // Save the kit anyway; the summary is retried on the next save.
      saved.styleSummary = undefined;
      saved.styleSummaryFor = undefined;
    }
  }
  await put(`${PREFIX}${kit.id}/${String(saved.updatedAt).padStart(15, "0")}.json`, JSON.stringify(saved), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  const latest = await latestVersionUrl(kit.id);
  if (latest?.stale.length) await del(latest.stale);
  return saved;
}

export async function listBrandKits(ownerId: string): Promise<BrandKit[]> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor });
    for (const blob of page.blobs) ids.add(blob.pathname.slice(PREFIX.length).split("/")[0]);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const kits = await Promise.all([...ids].map((id) => getBrandKit(id)));
  return kits
    .filter((kit): kit is BrandKit => kit?.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteBrandKit(id: string): Promise<void> {
  const { blobs } = await list({ prefix: `${PREFIX}${id}/` });
  if (blobs.length) await del(blobs.map((blob) => blob.url));
}

/**
 * How a kit shapes a render: the house style (replacing the preset), palette, type, and the logo
 * as the only reference image.
 */
export function brandKitDirection(kit: BrandKit): {
  style: string;
  logoInstruction?: string;
  referenceImages: string[];
} {
  const [accent, ...others] = kit.colors;
  const style = [
    kit.styleSummary ? `House style of ${kit.publicationName ?? kit.name}: ${kit.styleSummary}` : "",
    kit.notes ? `Editor's notes: ${kit.notes}` : "",
    kit.colors.length
      ? `Brand palette, use only these plus neutral black, white and grays: primary accent ${accent}${others.length ? `, supporting ${others.join(", ")}` : ""}. The accent marks the most important data; the lightest brand color works as the background when the house style calls for a light page.`
      : "",
    kit.headingFont ? `Headline typeface: ${kit.headingFont} (or the closest match).` : "",
    kit.bodyFont ? `Body and label typeface: ${kit.bodyFont} (or the closest match).` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    style,
    logoInstruction: kit.logoUrl
      ? "Reproduce the publication logo from the reference image small and faithfully in the bottom-left corner, exactly once. It is the only logo and the only brand mark on the page; do not repeat it or its words anywhere else."
      : undefined,
    referenceImages: kit.logoUrl ? [kit.logoUrl] : [],
  };
}
