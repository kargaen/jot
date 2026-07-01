/**
 * Measures end-to-end latency of the app's DB operations against the real
 * Supabase project, using the same @supabase/supabase-js client + queries as
 * the app. Turns "the app feels slow" into p50/p95 numbers per operation.
 *
 * Required env vars (same as the CI integration test):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
 *   SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD
 * Optional:
 *   MEASURE_ITER  – iterations per op (default 20)
 *
 * Run: npx tsx scripts/measure-db-latency.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const EMAIL = process.env.SUPABASE_TEST_USER_NAME!;
const PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD!;
const ITER = Number(process.env.MEASURE_ITER ?? 20);

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.error("Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD");
  process.exit(1);
}

const samples = new Map<string, number[]>();
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const arr = samples.get(label) ?? [];
    arr.push(performance.now() - start);
    samples.set(label, arr);
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function report(): void {
  console.log(`\n${"op".padEnd(16)} ${"n".padStart(4)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"max".padStart(8)}  (ms)`);
  for (const [label, values] of samples) {
    const s = [...values].sort((a, b) => a - b);
    console.log(
      `${label.padEnd(16)} ${String(s.length).padStart(4)} ${pct(s, 0.5).toFixed(0).padStart(8)} ${pct(s, 0.95).toFixed(0).padStart(8)} ${s[s.length - 1].toFixed(0).padStart(8)}`,
    );
  }
}

async function run(): Promise<void> {
  console.log(`Measuring against ${SUPABASE_URL} — ${ITER} iterations/op\n`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // login (a few times to get a distribution)
  let userId = "";
  for (let i = 0; i < Math.min(5, ITER); i++) {
    const { data, error } = await timed("login", () =>
      client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }),
    );
    if (error || !data.session) {
      console.error(`ABORT: sign in failed: ${error?.message ?? "no session"}`);
      process.exit(1);
    }
    userId = data.user.id;
  }
  await timed("getSession", () => client.auth.getSession());

  const db = client;
  const createdTasks: string[] = [];

  // load — the app's four parallel queries (fetchAreas/Projects/Tags/AllTasks)
  for (let i = 0; i < ITER; i++) {
    await timed("load", () =>
      Promise.all([
        db.from("areas").select("*").order("sort_order"),
        db.from("projects").select("*").eq("status", "active").order("sort_order"),
        db.from("tags").select("*"),
        db.from("tasks").select("*, task_tags(tag_id, tags(*))").eq("status", "todo").order("sort_order"),
      ]),
    );
  }

  // single-row round-trip baseline (isolates raw RTT from load size)
  for (let i = 0; i < ITER; i++) {
    await timed("ping(1row)", () => db.from("tasks").select("id").limit(1));
  }

  // create
  for (let i = 0; i < ITER; i++) {
    const { data, error } = await timed("create", () =>
      db.from("tasks").insert({ user_id: userId, title: `measure ${Date.now()}-${i}`, status: "todo", priority: "none" }).select().single(),
    );
    if (error) { console.error("create failed:", error.message); break; }
    createdTasks.push(data.id);
  }

  // complete
  for (const id of createdTasks) {
    await timed("complete", () =>
      db.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id),
    );
  }

  // delete (also cleans up)
  for (const id of createdTasks) {
    await timed("delete", () => db.from("tasks").delete().eq("id", id));
  }

  report();
  process.exit(0);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
