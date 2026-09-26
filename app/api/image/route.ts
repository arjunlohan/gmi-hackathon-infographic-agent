// Same-origin download proxy for rendered infographics. GMI serves outputs from a public GCS
// bucket without CORS, so the browser cannot save them with a filename directly.
// Only GMI's output bucket is allowed, so this cannot be used as an open proxy.

const ALLOWED_PREFIX = "https://storage.googleapis.com/gmi-video-assests-prod/";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") ?? "";
  if (!url.startsWith(ALLOWED_PREFIX)) {
    return new Response("Unsupported image URL", { status: 400 });
  }
  const name = (searchParams.get("name") ?? "infographic.png").replace(/[^\w.-]/g, "_");

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return new Response("Image unavailable", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
