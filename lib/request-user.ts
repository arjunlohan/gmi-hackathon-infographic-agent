import { auth } from "@/lib/auth";

// Same trust model as the chat page: open in local development, signed-in users in deployments.
export async function getRequestUserId(request: Request): Promise<string | null> {
  if (process.env.NODE_ENV === "development") return "local-dev";
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export function unauthorized(): Response {
  return Response.json({ error: "Sign in required" }, { status: 401 });
}
