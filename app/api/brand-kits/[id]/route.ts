import { brandKitInputSchema, deleteBrandKit, getBrandKit, saveBrandKit } from "@/agent/lib/brand-kits";
import { getRequestUserId, unauthorized } from "@/lib/request-user";

type Context = { params: Promise<{ id: string }> };

async function ownedKit(request: Request, context: Context) {
  const ownerId = await getRequestUserId(request);
  if (!ownerId) return { error: unauthorized() };
  const kit = await getBrandKit((await context.params).id);
  if (!kit || kit.ownerId !== ownerId) {
    return { error: Response.json({ error: "Brand kit not found" }, { status: 404 }) };
  }
  return { kit };
}

export async function PUT(request: Request, context: Context) {
  const { kit, error } = await ownedKit(request, context);
  if (error) return error;
  const parsed = brandKitInputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  return Response.json({ kit: await saveBrandKit({ ...kit, ...parsed.data }) });
}

export async function DELETE(request: Request, context: Context) {
  const { kit, error } = await ownedKit(request, context);
  if (error) return error;
  await deleteBrandKit(kit.id);
  return Response.json({ ok: true });
}
