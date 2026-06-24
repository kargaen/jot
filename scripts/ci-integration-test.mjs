/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * User lifecycle (create/delete) uses the service role key — the only reason
 * it's needed is to bypass email confirmation. All data operations use the
 * anon key + a real user JWT, exactly like the Jot client does.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL          – project API URL (already in CI)
 *   VITE_SUPABASE_ANON_KEY     – public anon key (already in CI)
 *   SUPABASE_SERVICE_ROLE_KEY  – service role key (for user create/delete only)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEBUG_EMAIL = "jot-ci-debug@jot.test";
const DEBUG_PASSWORD = "ci-debug-password-jot-2026!";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Admin client — used only for user create/delete.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let debugUserId = null;
const failures = [];

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function cleanup() {
  if (!debugUserId) return;
  console.log("\nCleanup: removing debug user...");
  const { error } = await admin.auth.admin.deleteUser(debugUserId);
  if (error) console.warn("  cleanup: delete user failed:", error.message);
  else console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Create debug user (service role, email confirmation bypassed) ─────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
    email_confirm: true,
  });
  if (createErr) {
    if (createErr.message.includes("already been registered") || createErr.message.includes("already exists")) {
      console.error(`ABORT: ${DEBUG_EMAIL} already exists. A previous CI run may have failed to clean up. Delete the user via the Supabase dashboard.`);
    } else {
      console.error("ABORT: failed to create debug user:", createErr.message);
    }
    process.exit(1);
  }
  debugUserId = created.user.id;
  console.log(`Debug user created: ${debugUserId}\n`);

  // ── Sign in as debug user — anon key + JWT, exactly like the real app ─────
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await db.auth.signInWithPassword({ email: DEBUG_EMAIL, password: DEBUG_PASSWORD });
  if (signInErr) {
    fail("sign in as debug user", signInErr);
    await cleanup();
    process.exit(1);
  }

  // All calls below use db — anon key + live JWT, RLS fully enforced.

  // ── 1. Create area ────────────────────────────────────────────────────────
  let areaId;
  try {
    const { data, error } = await db
      .from("areas")
      .insert({ user_id: debugUserId, name: "CI Test Area", color: "#888888" })
      .select("id").single();
    if (error) throw error;
    areaId = data.id;
    pass("create area");
  } catch (e) { fail("create area", e); }

  // ── 2. Create inbox task (null area + null project — the RLS regression) ──
  let inboxTaskId;
  try {
    const { data, error } = await db
      .from("tasks")
      .insert({ user_id: debugUserId, title: "CI inbox task", status: "todo", priority: "none" })
      .select("id").single();
    if (error) throw error;
    inboxTaskId = data.id;
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
        .insert({ user_id: debugUserId, area_id: areaId, title: "CI area task", status: "todo", priority: "none" })
        .select("id").single();
      if (error) throw error;
      areaTaskId = data.id;
      pass("create area-anchored task");
    } catch (e) { fail("create area-anchored task", e); }
  }

  // ── 5. Create project + project-anchored task ─────────────────────────────
  if (areaId) {
    try {
      const { data: proj, error: projErr } = await db
        .from("projects")
        .insert({ user_id: debugUserId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" })
        .select("id").single();
      if (projErr) throw projErr;
      const { error: taskErr } = await db
        .from("tasks")
        .insert({ user_id: debugUserId, project_id: proj.id, title: "CI project task", status: "todo", priority: "none" })
        .select("id").single();
      if (taskErr) throw taskErr;
      pass("create project + project-anchored task");
    } catch (e) { fail("create project + project-anchored task", e); }
  }

  // ── 6. Delete own task ────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      const { error } = await db.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      pass("delete own task");
    } catch (e) { fail("delete own task", e); }
  }

  // ── 7. SELECT isolation: cannot see other users' data ────────────────────
  try {
    const { data, error } = await db.from("tasks").select("id").neq("user_id", debugUserId).limit(1);
    if (error) throw error;
    if (data.length > 0) throw new Error(`saw ${data.length} task(s) belonging to other users`);
    pass("SELECT isolation (cannot see other users' tasks)");
  } catch (e) { fail("SELECT isolation", e); }

  // ── Results ───────────────────────────────────────────────────────────────
  await cleanup();
  console.log(`\n${failures.length === 0 ? "All tests passed." : `${failures.length} test(s) failed:`}`);
  for (const f of failures) console.error(`  - ${f.label}: ${f.msg}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  await cleanup();
  process.exit(1);
});


