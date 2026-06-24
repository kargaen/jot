/**
 * CI integration test: full CRUD cycle against the production Supabase project
 * using a dedicated debug user with a real JWT, exercising the same RLS path
 * the app uses. The debug user is created fresh, tested, then deleted.
 *
 * Required env vars:
 *   SUPABASE_URL              – project API URL
 *   SUPABASE_SERVICE_ROLE_KEY – service role key (admin ops + cleanup)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEBUG_EMAIL = "jot-ci-debug@jot.test";
const DEBUG_PASSWORD = "ci-debug-password-jot-2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let debugUserId = null;
let failures = [];

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function cleanup() {
  if (!debugUserId) return;
  console.log("\nCleanup: removing debug user and all their data...");
  // Delete data in dependency order; ignore errors (best-effort cleanup).
  await admin.from("task_tags").delete().eq("task_id", debugUserId).throwOnError().catch(() => {});
  const { data: tasks } = await admin.from("tasks").select("id").eq("user_id", debugUserId);
  if (tasks?.length) {
    const ids = tasks.map((t) => t.id);
    await admin.from("task_tags").delete().in("task_id", ids).throwOnError().catch(() => {});
    await admin.from("tasks").delete().in("id", ids).throwOnError().catch(() => {});
  }
  await admin.from("project_members").delete().eq("owner_user_id", debugUserId).throwOnError().catch(() => {});
  await admin.from("projects").delete().eq("user_id", debugUserId).throwOnError().catch(() => {});
  await admin.from("area_members").delete().eq("owner_user_id", debugUserId).throwOnError().catch(() => {});
  await admin.from("areas").delete().eq("user_id", debugUserId).throwOnError().catch(() => {});
  await admin.auth.admin.deleteUser(debugUserId);
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sanity check: debug user must not already exist ───────────────────────
  const { data: existing } = await admin.auth.admin.listUsers();
  const alreadyExists = existing?.users?.some((u) => u.email === DEBUG_EMAIL);
  if (alreadyExists) {
    console.error(
      `ABORT: ${DEBUG_EMAIL} already exists in auth.users. ` +
      "A previous CI run may have failed to clean up. Remove the user manually before re-running."
    );
    process.exit(1);
  }

  // ── Create debug user ─────────────────────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error("ABORT: failed to create debug user:", createErr?.message);
    process.exit(1);
  }
  debugUserId = created.user.id;
  console.log(`Debug user created: ${debugUserId}\n`);

  // ── Sign in as debug user (get real JWT) ──────────────────────────────────
  const user = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInErr } = await user.auth.signInWithPassword({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
  });
  if (signInErr || !session?.session) {
    fail("sign in as debug user", signInErr);
    await cleanup();
    process.exit(1);
  }

  // Use the anon key + user JWT. PostgREST uses the JWT role (authenticated)
  // so auth.uid() resolves correctly and RLS is enforced.
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  // ── 1. Create area ────────────────────────────────────────────────────────
  let areaId;
  try {
    const { data, error } = await db
      .from("areas")
      .insert({ user_id: debugUserId, name: "CI Test Area", color: "#888888" })
      .select("id")
      .single();
    if (error) throw error;
    areaId = data.id;
    pass("create area");
  } catch (e) {
    fail("create area", e);
  }

  // ── 2. Create inbox task (no area, no project — the RLS regression case) ──
  let inboxTaskId;
  try {
    const { data, error } = await db
      .from("tasks")
      .insert({ user_id: debugUserId, title: "CI inbox task", status: "todo", priority: "none" })
      .select("id")
      .single();
    if (error) throw error;
    inboxTaskId = data.id;
    pass("create inbox task (null area, null project)");
  } catch (e) {
    fail("create inbox task (null area, null project)", e);
  }

  // ── 3. Complete inbox task (UPDATE — the other RLS regression case) ───────
  if (inboxTaskId) {
    try {
      const { error } = await db
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", inboxTaskId);
      if (error) throw error;
      pass("complete inbox task");
    } catch (e) {
      fail("complete inbox task", e);
    }
  }

  // ── 4. Create area-anchored task ──────────────────────────────────────────
  let areaTaskId;
  if (areaId) {
    try {
      const { data, error } = await db
        .from("tasks")
        .insert({ user_id: debugUserId, area_id: areaId, title: "CI area task", status: "todo", priority: "none" })
        .select("id")
        .single();
      if (error) throw error;
      areaTaskId = data.id;
      pass("create area-anchored task");
    } catch (e) {
      fail("create area-anchored task", e);
    }
  }

  // ── 5. Create project + project-anchored task ─────────────────────────────
  let projectTaskId;
  if (areaId) {
    try {
      const { data: proj, error: projErr } = await db
        .from("projects")
        .insert({ user_id: debugUserId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" })
        .select("id")
        .single();
      if (projErr) throw projErr;

      const { data: task, error: taskErr } = await db
        .from("tasks")
        .insert({ user_id: debugUserId, project_id: proj.id, title: "CI project task", status: "todo", priority: "none" })
        .select("id")
        .single();
      if (taskErr) throw taskErr;
      projectTaskId = task.id;
      pass("create project + project-anchored task");
    } catch (e) {
      fail("create project + project-anchored task", e);
    }
  }

  // ── 6. Delete own task ────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      const { error } = await db.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      pass("delete own task");
    } catch (e) {
      fail("delete own task", e);
    }
  }

  // ── 7. SELECT isolation: cannot see other users' tasks ────────────────────
  try {
    // Query tasks not owned by the debug user — RLS should return 0 rows.
    const { data, error } = await db
      .from("tasks")
      .select("id")
      .neq("user_id", debugUserId)
      .limit(1);
    if (error) throw error;
    if (data.length > 0) throw new Error(`saw ${data.length} tasks belonging to other users`);
    pass("SELECT isolation (cannot see other users' tasks)");
  } catch (e) {
    fail("SELECT isolation (cannot see other users' tasks)", e);
  }

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
