/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Behaves exactly like a real Jot client:
 *   - uses the anon key + user JWT for all data operations (RLS enforced)
 *   - uses the Supabase Management API (SUPABASE_ACCESS_TOKEN) only for
 *     creating and deleting the debug auth user — no service role key needed
 *
 * Required env vars (all already present in CI):
 *   VITE_SUPABASE_URL        – project API URL
 *   VITE_SUPABASE_ANON_KEY   – public anon key (same as the app uses)
 *   SUPABASE_ACCESS_TOKEN    – Management API token (used for user lifecycle)
 *   SUPABASE_PROJECT_REF     – project ref (used for Management API URL)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const DEBUG_EMAIL = "jot-ci-debug@jot.test";
const DEBUG_PASSWORD = "ci-debug-password-jot-2026!";

if (!SUPABASE_URL || !ANON_KEY || !MGMT_TOKEN || !PROJECT_REF) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF");
  process.exit(1);
}

const mgmtHeaders = { "Authorization": `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" };

let debugUserId = null;
const failures = [];

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

async function mgmt(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${path}`, {
    method,
    headers: mgmtHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Management API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function cleanup() {
  if (!debugUserId) return;
  console.log("\nCleanup: removing debug user...");
  try { await mgmt("DELETE", `/auth/users/${debugUserId}`); } catch (e) { console.warn("  cleanup: delete user failed:", e.message); }
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sanity check: debug user must not already exist ───────────────────────
  const existing = await mgmt("GET", `/auth/users?email=${encodeURIComponent(DEBUG_EMAIL)}`);
  if (existing?.users?.length > 0) {
    console.error(
      `ABORT: ${DEBUG_EMAIL} already exists. ` +
      "A previous CI run may have failed to clean up. Delete the user via the Supabase dashboard."
    );
    process.exit(1);
  }

  // ── Create debug user via Management API (skips email confirmation) ───────
  const created = await mgmt("POST", "/auth/users", {
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
    email_confirm: true,
  });
  debugUserId = created.id;
  console.log(`Debug user created: ${debugUserId}\n`);

  // ── Sign in as the debug user — exactly like the real app ─────────────────
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await db.auth.signInWithPassword({ email: DEBUG_EMAIL, password: DEBUG_PASSWORD });
  if (signInErr) {
    fail("sign in as debug user", signInErr);
    await cleanup();
    process.exit(1);
  }

  // From this point db behaves exactly like the Jot client — anon key + live JWT.

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
