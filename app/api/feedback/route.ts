import { z } from "zod";
import { saveQaFeedback } from "@/agent/lib/qa-log";
import { getRequestUserId, unauthorized } from "@/lib/request-user";

const feedbackSchema = z.object({
  qaId: z.string().min(3).max(200),
  draftId: z.string().max(20).optional(),
  imageUrl: z.url().max(2000).optional(),
  rating: z.enum(["up", "down"]),
  note: z.string().trim().max(600).optional(),
});

// Thumbs up or down on a finished infographic, stored next to its QA record.
export async function POST(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid feedback" }, { status: 400 });
  try {
    await saveQaFeedback({ ...parsed.data, userId });
  } catch (error) {
    console.error("saving feedback failed", error);
    return Response.json({ error: "Feedback storage is unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
