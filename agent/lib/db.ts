// Neon Postgres: the durable memory behind the quality flywheel. Every render's passes and
// defects, every user rating, and every draft land here, and the next render reads back what
// the renderer keeps getting wrong. Images stay in Vercel Blob; this holds the structured record.

import { neon } from "@neondatabase/serverless";

type Row = Record<string, unknown>;
type Query = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

let override: Query | undefined;
let schema: Promise<void> | undefined;

/** Point the module at another Postgres (tests run against a local database). */
export function useQueryForTests(query: Query): void {
  override = query;
  schema = undefined;
}

function sql(): Query {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Connect the Neon database to this project.");
  return neon(url) as unknown as Query;
}

/** Create the tables on first use. Idempotent, so every cold start can run it. */
export function ensureSchema(): Promise<void> {
  schema ??= (async () => {
    const q = sql();
    await q`create table if not exists qa_runs (
      id text primary key,
      session_id text not null,
      principal_id text,
      tool text not null,
      form text,
      format text,
      preset text,
      brand_kit_id text,
      data_points int,
      words int,
      passes int not null,
      verdict text,
      checks_passed int,
      checks_total int,
      output jsonb not null,
      created_at timestamptz not null default now()
    )`;
    await q`create table if not exists qa_passes (
      qa_id text not null references qa_runs(id) on delete cascade,
      pass int not null,
      method text not null,
      verdict text,
      defects jsonb not null default '[]',
      targets text[] not null default '{}',
      resolved text[] not null default '{}',
      drift real,
      error text,
      primary key (qa_id, pass)
    )`;
    await q`create table if not exists qa_feedback (
      id bigserial primary key,
      qa_id text not null,
      draft_id text,
      image_url text,
      user_id text not null,
      rating text not null,
      note text,
      created_at timestamptz not null default now()
    )`;
    await q`create index if not exists qa_runs_form_created on qa_runs (form, created_at desc)`;
    await q`create index if not exists qa_runs_session on qa_runs (session_id)`;
    await q`create index if not exists qa_feedback_qa on qa_feedback (qa_id)`;
    await q`create table if not exists drafts (
      session_id text not null,
      seq int not null,
      data jsonb not null,
      created_at timestamptz not null default now(),
      primary key (session_id, seq)
    )`;
  })().catch((error) => {
    schema = undefined;
    throw error;
  });
  return schema;
}

type PassRecord = {
  pass: number;
  method: string;
  verdict?: string;
  defects?: unknown[];
  targets?: string[];
  resolved?: string[];
  drift?: number;
  error?: string;
};

export type QaRunRecord = {
  qaId: string;
  sessionId: string;
  principalId?: string;
  tool: string;
  meta?: { form?: string; format?: string; preset?: string; brandKitId?: string; dataPoints?: number; words?: number };
  verdict?: string;
  checks?: { passed: number; total: number };
  passes: PassRecord[];
  output: unknown;
};

/** Record one finished render. Safe to repeat: hooks are at-least-once. */
export async function saveQaRun(run: QaRunRecord): Promise<void> {
  await ensureSchema();
  const q = sql();
  const meta = run.meta ?? {};
  await q`insert into qa_runs (id, session_id, principal_id, tool, form, format, preset, brand_kit_id, data_points, words, passes, verdict, checks_passed, checks_total, output)
    values (${run.qaId}, ${run.sessionId}, ${run.principalId ?? null}, ${run.tool}, ${meta.form ?? null}, ${meta.format ?? null}, ${meta.preset ?? null}, ${meta.brandKitId ?? null}, ${meta.dataPoints ?? null}, ${meta.words ?? null}, ${run.passes.length}, ${run.verdict ?? null}, ${run.checks?.passed ?? null}, ${run.checks?.total ?? null}, ${JSON.stringify(run.output)})
    on conflict (id) do nothing`;
  for (const pass of run.passes) {
    await q`insert into qa_passes (qa_id, pass, method, verdict, defects, targets, resolved, drift, error)
      values (${run.qaId}, ${pass.pass}, ${pass.method}, ${pass.verdict ?? null}, ${JSON.stringify(pass.defects ?? [])}, ${pass.targets ?? []}, ${pass.resolved ?? []}, ${pass.drift ?? null}, ${pass.error ?? null})
      on conflict (qa_id, pass) do nothing`;
  }
}

export async function saveQaFeedback(feedback: {
  qaId: string;
  draftId?: string;
  imageUrl?: string;
  userId: string;
  rating: "up" | "down";
  note?: string;
}): Promise<void> {
  await ensureSchema();
  await sql()`insert into qa_feedback (qa_id, draft_id, image_url, user_id, rating, note)
    values (${feedback.qaId}, ${feedback.draftId ?? null}, ${feedback.imageUrl ?? null}, ${feedback.userId}, ${feedback.rating}, ${feedback.note ?? null})`;
}

/** Store a draft under the next version number of its chat (v1, v2, ...). */
export async function insertDraft(sessionId: string, data: Record<string, unknown>): Promise<number> {
  await ensureSchema();
  const q = sql();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rows = await q`insert into drafts (session_id, seq, data)
        select ${sessionId}, coalesce(max(seq), 0) + 1, ${JSON.stringify(data)}::jsonb from drafts where session_id = ${sessionId}
        returning seq`;
      const seq = Number(rows[0].seq);
      await q`update drafts set data = jsonb_set(data, '{id}', to_jsonb(${`v${seq}`}::text)) where session_id = ${sessionId} and seq = ${seq}`;
      return seq;
    } catch (error) {
      // Two drafts saved at once can race for the same number; take the next one.
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Could not save the draft.");
}

export async function findDraft(sessionId: string, seq: number): Promise<{ data: unknown } | { known: number[] }> {
  await ensureSchema();
  const rows = await sql()`select seq, data from drafts where session_id = ${sessionId} order by seq`;
  const row = rows.find((item) => Number(item.seq) === seq);
  return row ? { data: row.data } : { known: rows.map((item) => Number(item.seq)) };
}

/** What past renders say about a chart form: how often each defect shows up, and which fixes work. */
export type FormTrackRecord = {
  form: string;
  runs: number;
  // Share of first renders that passed every check.
  firstPassClean: number;
  // Share of runs whose first render had each defect kind.
  firstPassKinds: Record<string, number>;
  // Attempts and successes by fix method and defect kind.
  fixes: Record<string, { attempts: number; fixed: number }>;
};

export async function formTrackRecord(form: string, days = 60): Promise<FormTrackRecord> {
  await ensureSchema();
  const q = sql();
  const [totals] = await q`select count(*)::int as runs,
      count(*) filter (where p.verdict = 'publish' and not exists (
        select 1 from qa_feedback f where f.qa_id = r.id and f.rating = 'down'))::int as clean
    from qa_runs r join qa_passes p on p.qa_id = r.id and p.pass = 1
    where r.form = ${form} and r.created_at > now() - make_interval(days => ${days})`;
  const kinds = await q`select d->>'kind' as kind, count(distinct r.id)::int as runs
    from qa_runs r join qa_passes p on p.qa_id = r.id and p.pass = 1, jsonb_array_elements(p.defects) d
    where r.form = ${form} and r.created_at > now() - make_interval(days => ${days})
    group by 1`;
  const fixes = await q`select p.method, t.kind, count(*)::int as attempts,
      count(*) filter (where t.kind = any(p.resolved))::int as fixed
    from qa_runs r join qa_passes p on p.qa_id = r.id, unnest(p.targets) as t(kind)
    where r.form = ${form} and p.error is null and r.created_at > now() - make_interval(days => ${days})
    group by 1, 2`;
  const runs = Number(totals?.runs ?? 0);
  return {
    form,
    runs,
    firstPassClean: runs ? Number(totals.clean) / runs : 0,
    firstPassKinds: Object.fromEntries(kinds.map((row) => [String(row.kind), runs ? Number(row.runs) / runs : 0])),
    fixes: Object.fromEntries(
      fixes.map((row) => [`${row.method}:${row.kind}`, { attempts: Number(row.attempts), fixed: Number(row.fixed) }]),
    ),
  };
}

/**
 * First-pass success of every chart form, for choosing forms the renderer can actually draw. A
 * draft the user rated down never counts as a success, whatever the fact-check said: people are
 * the ground truth the automated check is measured against.
 */
export async function formScoreboard(
  days = 60,
): Promise<{ form: string; runs: number; clean: number; final: number; rejected: number }[]> {
  await ensureSchema();
  const rows = await sql()`with rated as (
      select qa_id, bool_or(rating = 'down') as down from qa_feedback group by qa_id
    )
    select r.form, count(*)::int as runs,
      count(*) filter (where p.verdict = 'publish' and not coalesce(f.down, false))::int as clean,
      count(*) filter (where r.verdict = 'publish' and not coalesce(f.down, false))::int as final,
      count(*) filter (where f.down)::int as rejected
    from qa_runs r join qa_passes p on p.qa_id = r.id and p.pass = 1
    left join rated f on f.qa_id = r.id
    where r.form is not null and r.created_at > now() - make_interval(days => ${days})
    group by 1 order by 2 desc`;
  return rows.map((row) => ({
    form: String(row.form),
    runs: Number(row.runs),
    clean: Number(row.clean),
    final: Number(row.final),
    rejected: Number(row.rejected),
  }));
}
