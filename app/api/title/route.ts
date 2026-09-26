import { generateText } from "ai";
import { getRequestUserId, unauthorized } from "@/lib/request-user";

// Short chat titles for the sidebar, generated once per chat at low reasoning effort.
export async function POST(request: Request) {
  if (!(await getRequestUserId(request))) return unauthorized();
  const { text } = (await request.json()) as { text?: string };
  const source = (text ?? "").trim().slice(0, 3000);
  if (!source) return Response.json({ error: "No text" }, { status: 400 });

  const { text: raw } = await generateText({
    model: "meta/muse-spark-1.3-contributor",
    reasoning: "low",
    maxOutputTokens: 400,
    prompt: `Write a title of 2 to 5 words for a chat that starts with the request below. Name the topic of the infographic, not the action (e.g. "Top Fertilizer Exporters", "PISA Math Rankings"). Title Case. No quotes, no trailing punctuation, no emoji. Reply with the title only.\n\nRequest:\n${source}`,
  });
  const title = raw.split("\n")[0].replace(/^["'\s]+|["'.\s]+$/g, "").slice(0, 60);
  return Response.json({ title: title || null });
}
