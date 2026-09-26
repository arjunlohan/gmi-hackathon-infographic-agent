import { put } from "@vercel/blob";
import { getRequestUserId, unauthorized } from "@/lib/request-user";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
// Server uploads are capped by the 4.5 MB function body limit on Vercel.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getRequestUserId(request))) return unauthorized();
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Images must be under 4 MB." }, { status: 400 });
  }
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
  const blob = await put(`brand-kit-assets/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return Response.json({ url: blob.url });
}
