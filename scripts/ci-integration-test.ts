/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Uses the same @supabase/supabase-js client as the app — auth headers are
 * handled identically to production, so this tests the real RLS + JWT stack.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL            – project API URL (already in CI)
 *   VITE_SUPABASE_ANON_KEY       – public anon key (already in CI)
 *   SUPABASE_TEST_USER_NAME      – email of the pre-created test user
 *   SUPABASE_TEST_USER_PASSWORD  – password for the test user
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.SUPABASE_TEST_USER_NAME!;
const TEST_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD!;

if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const failures: { label: string; msg: string }[] = [];
const created = { areas: [] as string[], projects: [] as string[], tasks: [] as string[] };

function pass(label: string) { console.log(`  ✓ ${label}`); }
function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") return JSON.stringify(err);
  return String(err);
}
function fail(label: string, err: unknown) {
  const msg = errMsg(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function cleanup() {
  console.log("\nCleanup: deleting data created during this run...");
  for (const id of created.tasks) await supabase.from("tasks").delete().eq("id", id);
  for (const id of created.projects) await supabase.from("projects").delete().eq("id", id);
  for (const id of created.areas) await supabase.from("areas").delete().eq("id", id);
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sign in ────────────────────────────────────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authError || !authData.session) {
    console.error(`ABORT: could not sign in as ${TEST_EMAIL}: ${authError?.message ?? "no session"}`);
    process.exit(1);
  }
  const userId = authData.user.id;
  console.log(`Signed in as ${TEST_EMAIL} (${userId})\n`);

  // ── 1. Create area ─────────────────────────────────────────────────────────
  let areaId: string | undefined;
  try {
    const { data, error } = await supabase
      .from("areas")
      .insert({ user_id: userId, name: "CI Test Area", color: "#888888" })
      .select()
      .single();
    if (error) throw error;
    areaId = data.id;
    created.areas.push(areaId!);
    pass("create area");
  } catch (e) { fail("create area", e); }

  // ── 2. Create inbox task (null area + null project — RLS regression) ───────
  let inboxTaskId: string | undefined;
  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert({ user_id: userId, title: "CI inbox task", status: "todo", priority: "none" })
      .select()
      .single();
    if (error) throw error;
    inboxTaskId = data.id;
    created.tasks.push(inboxTaskId!);
    pass("create inbox task (null area, null project)");
  } catch (e) { fail("create inbox task (null area, null project)", e); }

  // ── 3. Complete inbox task (UPDATE — second RLS regression case) ───────────
  if (inboxTaskId) {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", inboxTaskId);
      if (error) throw error;
      pass("complete inbox task");
    } catch (e) { fail("complete inbox task", e); }
  }

  // ── 4. Create area-anchored task ───────────────────────────────────────────
  let areaTaskId: string | undefined;
  if (areaId) {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ user_id: userId, area_id: areaId, title: "CI area task", status: "todo", priority: "none" })
        .select()
        .single();
      if (error) throw error;
      areaTaskId = data.id;
      created.tasks.push(areaTaskId!);
      pass("create area-anchored task");
    } catch (e) { fail("create area-anchored task", e); }
  }

  // ── 5. Create project + project-anchored task ──────────────────────────────
  if (areaId) {
    try {
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({ user_id: userId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" })
        .select()
        .single();
      if (projErr) throw projErr;
      created.projects.push(proj.id);

      const { data: task, error: taskErr } = await supabase
        .from("tasks")
        .insert({ user_id: userId, project_id: proj.id, title: "CI project task", status: "todo", priority: "none" })
        .select()
        .single();
      if (taskErr) throw taskErr;
      created.tasks.push(task.id);
      pass("create project + project-anchored task");
    } catch (e) { fail("create project + project-anchored task", e); }
  }

  // ── 6. Delete own task ─────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      created.tasks = created.tasks.filter((id) => id !== areaTaskId);
      pass("delete own task");
    } catch (e) { fail("delete own task", e); }
  }

  // ── 7. SELECT isolation: cannot see other users' data ─────────────────────
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id")
      .neq("user_id", userId)
      .limit(1);
    if (error) throw error;
    if ((data ?? []).length > 0) throw new Error(`saw ${data!.length} task(s) belonging to other users`);
    pass("SELECT isolation (cannot see other users' tasks)");
  } catch (e) { fail("SELECT isolation", e); }

  // ── Results ────────────────────────────────────────────────────────────────
  await cleanup();
  console.log(`\n${failures.length === 0 ? "All tests passed." : `${failures.length} test(s) failed:`}`);
  for (const f of failures) console.error(`  - ${f.label}: ${f.msg}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
