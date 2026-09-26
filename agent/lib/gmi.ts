// Minimal client for GMI Cloud's request-queue API, used to run Hy Image 3.5 preview.
// Docs: GET https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/models/hy-image-v3.5-preview

const BASE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";
export const HY_IMAGE_MODEL = "hy-image-v3.5-preview";

// Hy Image is synchronous (10-60s) but the queue can still hand back a non-terminal status.
const REQUEST_TIMEOUT_MS = 150_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 180_000;

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

export type HySize =
  | "1152x1536"
  | "1440x2560"
  | "2048x2048"
  | "2560x1440"
  | "1920x1080"
  | "1080x1920";

export type GeneratedImage = {
  requestId: string;
  url: string;
  width: number;
  height: number;
};

type QueueResponse = {
  request_id: string;
  // Observed in-flight values include "queued", "dispatched" and "processing".
  status: string;
  outcome?: {
    error?: string;
    media_urls?: { url: string; width?: number; height?: number }[];
  };
};

function apiKey(): string {
  const key = process.env.GMI_API_KEY;
  if (!key) throw new Error("GMI_API_KEY is not set. Add it to .env.local or the Vercel project.");
  return key;
}

async function call(path: string, init: RequestInit, signal?: AbortSignal): Promise<QueueResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? detail;
    } catch {}
    throw new Error(`GMI Cloud returned ${response.status}: ${detail}`);
  }
  return JSON.parse(body) as QueueResponse;
}

export async function generateHyImage(
  input: { prompt: string; size: HySize; referenceImages?: string[]; seed?: number },
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const payload: Record<string, unknown> = { prompt: input.prompt, size: input.size };
  if (input.referenceImages?.length) payload.image = input.referenceImages.slice(0, 5);
  if (input.seed) payload.seed = input.seed;

  let result = await call(
    "",
    { method: "POST", body: JSON.stringify({ model: HY_IMAGE_MODEL, payload }) },
    signal,
  );

  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (!TERMINAL_STATUSES.has(result.status)) {
    if (Date.now() > deadline) {
      throw new Error(`Hy Image request ${result.request_id} is still ${result.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    result = await call(`/${result.request_id}`, { method: "GET" }, signal);
  }

  const media = result.outcome?.media_urls?.[0];
  if (result.status !== "success" || !media) {
    throw new Error(
      `Hy Image request ${result.request_id} ${result.status}: ${result.outcome?.error ?? "no image returned"}`,
    );
  }

  const [width, height] = input.size.split("x").map(Number);
  return {
    requestId: result.request_id,
    url: media.url,
    width: media.width ?? width,
    height: media.height ?? height,
  };
}
