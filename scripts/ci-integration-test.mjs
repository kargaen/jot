/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Uses a permanent debug user (jot-debug@karga.dk) that is pre-created once
 * and never deleted. CI signs in with the anon key + password, runs CRUD tests,
 * then deletes only the data created during the run. Exactly mirrors how the
 * real Jot client communicates with the database — RLS is fully enforced.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL            – project API URL (already in CI)
 *   VITE_SUPABASE_ANON_KEY       – public anon key (already in CI)
 *   SUPABASE_DEBUG_USER_PASSWORD – password for jot-debug@karga.dk (new secret)
 *
 * One-time setup: create jot-debug@karga.dk in the Supabase Auth dashboard
 * or via the app's sign-up flow and confirm the email. After that this test
 * runs indefinitely without any manual intervention.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const DEBUG_PASSWORD = process.env.SUPABASE_DEBUG_USER_PASSWORD;
const DEBUG_EMAIL = "jot-debug@karga.dk";

if (!SUPABASE_URL || !ANON_KEY || !DEBUG_PASSWORD) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_DEBUG_USER_PASSWORD");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const failures = [];
const createdIds = { areas: [], projects: [], tasks: [] };

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function cleanup(userId) {
  console.log("\nCleanup: deleting data created during this run...");
  if (createdIds.tasks.length) {
    const { error } = await db.from("tasks").delete().in("id", createdIds.tasks);
    if (error) console.warn("  cleanup tasks:", error.message);
  }
  if (createdIds.projects.length) {
    const { error } = await db.from("projects").delete().in("id", createdIds.projects);
    if (error) console.warn("  cleanup projects:", error.message);
  }
  if (createdIds.areas.length) {
    const { error } = await db.from("areas").delete().in("id", createdIds.areas);
    if (error) console.warn("  cleanup areas:", error.message);
  }
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sign in — anon key + password, exactly like the real app ─────────────
  const { data: session, error: signInErr } = await db.auth.signInWithPassword({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
  });
  if (signInErr) {
    console.error(`ABORT: could not sign in as ${DEBUG_EMAIL}: ${signInErr.message}`);
    console.error("Ensure the account exists and the email is confirmed.");
    process.exit(1);
  }
  const userId = session.user.id;
  console.log(`Signed in as ${DEBUG_EMAIL} (${userId})\n`);

  // All calls below use db with the live JWT — RLS fully enforced.

  // ── 1. Create area ────────────────────────────────────────────────────────
  let areaId;
  try {
    const { data, error } = await db
      .from("areas")
      .insert({ user_id: userId, name: "CI Test Area", color: "#888888" })
      .select("id").single();
    if (error) throw error;
    areaId = data.id;
    createdIds.areas.push(areaId);
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
    createdIds.tasks.push(inboxTaskId);
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
      createdIds.tasks.push(areaTaskId);
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
      createdIds.projects.push(proj.id);

      const { data: task, error: taskErr } = await db
        .from("tasks")
        .insert({ user_id: userId, project_id: proj.id, title: "CI project task", status: "todo", priority: "none" })
        .select("id").single();
      if (taskErr) throw taskErr;
      createdIds.tasks.push(task.id);
      pass("create project + project-anchored task");
    } catch (e) { fail("create project + project-anchored task", e); }
  }

  // ── 6. Delete own task ────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      const { error } = await db.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      createdIds.tasks = createdIds.tasks.filter((id) => id !== areaTaskId);
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
  await cleanup(userId);
  console.log(`\n${failures.length === 0 ? "All tests passed." : `${failures.length} test(s) failed:`}`);
  for (const f of failures) console.error(`  - ${f.label}: ${f.msg}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  await cleanup();
  process.exit(1);
});
