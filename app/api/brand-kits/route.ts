import { nanoid } from "nanoid";
import { brandKitInputSchema, listBrandKits, saveBrandKit } from "@/agent/lib/brand-kits";
import { getRequestUserId, unauthorized } from "@/lib/request-user";

export async function GET(request: Request) {
  const ownerId = await getRequestUserId(request);
  if (!ownerId) return unauthorized();
  return Response.json({ kits: await listBrandKits(ownerId) });
}

export async function POST(request: Request) {
  const ownerId = await getRequestUserId(request);
  if (!ownerId) return unauthorized();
  const parsed = brandKitInputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const kit = await saveBrandKit({ ...parsed.data, id: `kit_${nanoid(12)}`, ownerId, updatedAt: 0 });
  return Response.json({ kit });
}
