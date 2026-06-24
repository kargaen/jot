/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Uses a permanent test user (SUPABASE_TEST_USER_NAME) that is pre-created once
 * and never deleted. CI signs in, runs CRUD tests with the live JWT explicitly
 * set in the Authorization header (the same way the real app communicates with
 * the database), then deletes only the data created during the run.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL            – project API URL (already in CI)
 *   VITE_SUPABASE_ANON_KEY       – public anon key (already in CI)
 *   SUPABASE_TEST_USER_NAME      – email of the pre-created test user
 *   SUPABASE_TEST_USER_PASSWORD  – password for the test user
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.SUPABASE_TEST_USER_NAME;
const TEST_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD");
  process.exit(1);
}

const failures = [];
const created = { areas: [], projects: [], tasks: [] };

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function cleanup(db) {
  console.log("\nCleanup: deleting data created during this run...");
  if (created.tasks.length) {
    const { error } = await db.from("tasks").delete().in("id", created.tasks);
    if (error) console.warn("  cleanup tasks:", error.message);
  }
  if (created.projects.length) {
    const { error } = await db.from("projects").delete().in("id", created.projects);
    if (error) console.warn("  cleanup projects:", error.message);
  }
  if (created.areas.length) {
    const { error } = await db.from("areas").delete().in("id", created.areas);
    if (error) console.warn("  cleanup areas:", error.message);
  }
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sign in — anon key + password, exactly like the real app ─────────────
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr || !authData?.session) {
    console.error(`ABORT: could not sign in as ${TEST_EMAIL}: ${signInErr?.message ?? "no session returned"}`);
    console.error("Ensure the account exists and the email is confirmed.");
    process.exit(1);
  }
  const userId = authData.user.id;
  const accessToken = authData.session.access_token;
  console.log(`Signed in as ${TEST_EMAIL} (${userId})\n`);

  // Authenticated client: anon key + explicit JWT header.
  // This is exactly how PostgREST receives requests from the real Jot app.
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // ── 1. Create area ────────────────────────────────────────────────────────
  let areaId;
  try {
    const { data, error } = await db
      .from("areas")
      .insert({ user_id: userId, name: "CI Test Area", color: "#888888" })
      .select("id").single();
    if (error) throw error;
    areaId = data.id;
    created.areas.push(areaId);
    pass("create area");
  } catch (e) { fail("create area", e); }

  // ── 2. Create inbox task (null area + null project — the RLS regression) ──
  let inboxTaskId;
  try {
    const { data, error } = await db
      .from("tasks")
      .insert({ user_id: userId, title: "CI inbox task", status: "todo", priority: "none" })
      .select("id").single();
    if (error) throw error;
    inboxTaskId = data.id;
    created.tasks.push(inboxTaskId);
    pass("create inbox task (null area, null project)");
  } catch (e) { fail("create inbox task (null area, null project)", e); }

  // ── 3. Complete inbox task (UPDATE — the second RLS regression case) ──────
  if (inboxTaskId) {
    try {
      const { error } = await db
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", inboxTaskId);
      if (error) throw error;
      pass("complete inbox task");
    } catch (e) { fail("complete inbox task", e); }
  }

  // ── 4. Create area-anchored task ──────────────────────────────────────────
  let areaTaskId;
  if (areaId) {
    try {
      const { data, error } = await db
        .from("tasks")
        .insert({ user_id: userId, area_id: areaId, title: "CI area task", status: "todo", priority: "none" })
        .select("id").single();
      if (error) throw error;
      areaTaskId = data.id;
      created.tasks.push(areaTaskId);
      pass("create area-anchored task");
    } catch (e) { fail("create area-anchored task", e); }
  }

  // ── 5. Create project + project-anchored task ─────────────────────────────
  if (areaId) {
    try {
      const { data: proj, error: projErr } = await db
        .from("projects")
        .insert({ user_id: userId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" })
        .select("id").single();
      if (projErr) throw projErr;
      created.projects.push(proj.id);

      const { data: task, error: taskErr } = await db
        .from("tasks")
        .insert({ user_id: userId, project_id: proj.id, title: "CI project task", status: "todo", priority: "none" })
        .select("id").single();
      if (taskErr) throw taskErr;
      created.tasks.push(task.id);
      pass("create project + project-anchored task");
    } catch (e) { fail("create project + project-anchored task", e); }
  }

  // ── 6. Delete own task ────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      const { error } = await db.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      created.tasks = created.tasks.filter((id) => id !== areaTaskId);
      pass("delete own task");
    } catch (e) { fail("delete own task", e); }
  }

  // ── 7. SELECT isolation: cannot see other users' data ────────────────────
  try {
    const { data, error } = await db.from("tasks").select("id").neq("user_id", userId).limit(1);
    if (error) throw error;
    if (data.length > 0) throw new Error(`saw ${data.length} task(s) belonging to other users`);
    pass("SELECT isolation (cannot see other users' tasks)");
  } catch (e) { fail("SELECT isolation", e); }

  // ── Results ───────────────────────────────────────────────────────────────
  await cleanup(db);
  console.log(`\n${failures.length === 0 ? "All tests passed." : `${failures.length} test(s) failed:`}`);
  for (const f of failures) console.error(`  - ${f.label}: ${f.msg}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
