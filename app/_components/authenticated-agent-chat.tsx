import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AgentChat } from "./agent-chat";
import { AccountControl, SignIn } from "./web-chat-auth";

export async function AuthenticatedAgentChat({
  sessionId,
  sessionless,
}: {
  readonly sessionId?: string;
  readonly sessionless?: boolean;
}) {
  // The sidebar persists its open state in this cookie; read it so the first paint matches.
  const sidebarDefaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  if (process.env.NODE_ENV === "development") {
    return (
      <AgentChat
        sessionId={sessionId}
        sessionless={sessionless}
        sidebarDefaultOpen={sidebarDefaultOpen}
      />
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <SignIn />;

  return (
    <AgentChat
      account={
        <AccountControl
          email={session.user.email}
          image={session.user.image}
          name={session.user.name}
        />
      }
      sessionId={sessionId}
      sessionless={sessionless}
      sidebarDefaultOpen={sidebarDefaultOpen}
    />
  );
}
