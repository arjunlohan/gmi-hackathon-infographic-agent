# Plate · infographic studio

Chat an idea, paste an article or URL, or upload a document (PDF, text, CSV, image). Plate finds the story, designs a publication-grade infographic for a blog, newsletter, or article, renders it with **Hy Image 3.5 preview on GMI Cloud**, fact-checks every label with a vision pass, fixes what is wrong, and hands back the graphic with key takeaways, a caption, and alt text.

Built on [eve](https://eve.dev) (Vercel's agent framework) with **Meta Muse Spark 1.3 Contributor** (`meta/muse-spark-1.3-contributor`) through the AI SDK and AI Gateway.

## How it works

```
input (chat · paste · URL · upload)
  → Muse Spark: find the story, pick chart form, format and style, write a structured spec
  → generate_infographic: spec compiled into a Hy Image prompt with a text contract → GMI Cloud
  → vision review (Muse Spark, clean context): transcribe every label, diff against the contract
  → edit_infographic (reference-guided Hy edit) or regenerate, at most 3 renders
  → deliver: image + takeaways + caption + alt text
```

| Piece | File |
| --- | --- |
| Model and agent config | `agent/agent.ts` |
| Editorial workflow and rules | `agent/instructions.md` |
| Spec schema, style presets, prompt compiler | `agent/lib/infographic.ts` |
| GMI Cloud request-queue client | `agent/lib/gmi.ts` |
| Vision fact-check | `agent/lib/review.ts` |
| Render, then review pipeline | `agent/lib/render.ts` |
| Tools | `agent/tools/generate_infographic.ts`, `agent/tools/edit_infographic.ts` |
| GMI MCP connection (catalog, pricing, history) | `agent/connections/gmi.ts` |
| Brand kits (Blob store, style summaries, prompt direction) | `agent/lib/brand-kits.ts`, `app/api/brand-kits/*` |
| Studio UI and sidebar | `app/_components/*`, `components/app-sidebar.tsx`, `components/nav-actions.tsx` |

Why a compiler instead of free-form prompts: every string on the graphic comes from typed spec fields, so the reviewer can check the render against an exact list of what should be printed. That catches the classic image-model failures: misspelled names, dropped units, invented statistics, stray labels.

### Brand kits

A brand kit holds a publication's name, logo, palette, fonts, house-style notes and up to 4 past graphics. Pick one in the composer (or from the sidebar) and every render in that chat follows it; the chat remembers its kit.

- Past graphics are never sent to Hy Image. Sending them as reference images leaked their labels and numbers into new renders in testing. Instead, when a kit is saved, Muse Spark studies them once and writes a content-free house-style guide that replaces the style preset in the prompt.
- The logo is the only reference image, and it is the single brand mark on the page.
- Kits and assets live in the Vercel Blob store `plate-brand-kits` (`BLOB_READ_WRITE_TOKEN`), scoped to the signed-in user.

### Chats

The sidebar lists chats with AI-generated titles (Muse Spark, low effort), favorites, rename, copy link, copy transcript, trash, and search over titles and conversation text (⌘K). eve has no session-listing API, so this index is kept per browser; the conversations themselves are durable on the server.

### GMI Cloud: API key and MCP

- **Rendering** uses the API key (`GMI_API_KEY`) against `POST /api/v1/ie/requestqueue/apikey/requests` with model `hy-image-v3.5-preview`.
- **The GMI MCP server** (`https://mcp.gmicloud.ai/mcp`) is OAuth-only and rejects API keys. It is wired through Vercel Connect (connector `mcp.gmicloud.ai/gmi-cloud`, already attached to the Vercel project) with read-only tools: model search, pricing estimates, generation history, balance, and docs. Each user signs in to GMI once when the agent first uses it.
- For Claude Code during development: `claude mcp add --transport http gmi https://mcp.gmicloud.ai/mcp`.

## Run locally

```bash
pnpm install          # pnpm 10 (npx pnpm@10 install if your global pnpm is older)
vercel env pull .env.local   # VERCEL_OIDC_TOKEN (AI Gateway) and BLOB_READ_WRITE_TOKEN; re-run when the OIDC token expires (about 12h)
echo "GMI_API_KEY=..." >> .env.local
pnpm dev              # http://localhost:3000
```

`eve invoke --url http://localhost:3000 "<prompt>"` runs a turn headless; `eve traces` shows the last run.

## Deploy

```bash
vercel env add GMI_API_KEY production
eve deploy
```

Production requires sign-in with Vercel (Better Auth), as scaffolded by eve.

## Hackathon entry (Type & Layout track)

Workflow description for the submission: a two-model agent. Muse Spark 1.3 reads the source, picks the single story and the chart form, and writes a typed design spec (headline, data labels, callouts, visual metaphor, style preset). The spec compiles into a Hy Image 3.5 prompt with a strict text contract. After every render, a separate Muse Spark vision pass transcribes the image and diffs it against the contract; wrong or invented labels are fixed with Hy's reference-guided editing, or the graphic is regenerated.

## Known limits

- Hy reference edits occasionally fail upstream with `Backend error (400)` for a specific image, after about 2 minutes. The agent falls back to a fresh render.
- Muse Spark 1.3 **Contributor** is the low-cost tier whose usage Meta may use to improve its products. Do not upload confidential documents; switch to `meta/muse-spark-1.3` in `agent/agent.ts` and `agent/lib/review.ts` for that.
- Dense charts (more than about 25 labels, or 10 by 10 matrices) push Hy's text rendering; the agent trims to the top N or aggregates.
