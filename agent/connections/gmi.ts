import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

// GMI Cloud's official MCP server. It is OAuth-only (API keys are rejected), so each user
// signs in once through Vercel Connect. Generation itself runs through the API-key tools;
// this connection is read-only: model catalog, pricing quotes, generation history, docs.
export default defineMcpClientConnection({
  url: "https://mcp.gmicloud.ai/mcp",
  description:
    "GMI Cloud account: browse image/video/audio models and their parameters, price a generation before running it, list recent generations and their status, check balance, search GMI docs.",
  auth: connect("mcp.gmicloud.ai/gmi-cloud"),
  tools: {
    allow: [
      "search_models",
      "get_model",
      "estimate_generation",
      "list_generations",
      "get_generation",
      "get_account_summary",
      "search_docs",
    ],
  },
});
