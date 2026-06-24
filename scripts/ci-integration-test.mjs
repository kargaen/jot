/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Uses raw fetch against the PostgREST API with explicit Authorization header.
 * This is the most direct test of the RLS + JWT stack — no client library
 * abstraction that could silently override auth headers.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL            – project API URL (already in CI)
 *   VITE_SUPABASE_ANON_KEY       – public anon key (already in CI)
 *   SUPABASE_TEST_USER_NAME      – email of the pre-created test user
 *   SUPABASE_TEST_USER_PASSWORD  – password for the test user
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.SUPABASE_TEST_USER_NAME;
const TEST_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD");
  process.exit(1);
}

const failures = [];
const createdIds = { areas: [], projects: [], tasks: [] };

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  const msg = err?.message ?? String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failures.push({ label, msg });
}

// Raw PostgREST call — bypasses the JS client entirely.
async function rest(method, table, body, accessToken, params = "") {
  const headers = {
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

async function cleanup(accessToken) {
  console.log("\nCleanup: deleting data created during this run...");
  try {
    for (const id of createdIds.tasks) {
      await rest("DELETE", "tasks", null, accessToken, `?id=eq.${id}`);
    }
    for (const id of createdIds.projects) {
      await rest("DELETE", "projects", null, accessToken, `?id=eq.${id}`);
    }
    for (const id of createdIds.areas) {
      await rest("DELETE", "areas", null, accessToken, `?id=eq.${id}`);
    }
  } catch (e) {
    console.warn("  cleanup warning:", e.message);
  }
  console.log("Cleanup done.");
}

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sign in via Supabase Auth REST API ────────────────────────────────────
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const authBody = await authRes.json();
  if (!authRes.ok || !authBody.access_token) {
    console.error(`ABORT: could not sign in as ${TEST_EMAIL}: ${authBody.error_description ?? authBody.msg ?? JSON.stringify(authBody)}`);
    console.error("Ensure the account exists and the email is confirmed.");
    process.exit(1);
  }
  const accessToken = authBody.access_token;
  const userId = authBody.user.id;
  console.log(`Signed in as ${TEST_EMAIL} (${userId})`);

  // Decode JWT payload to confirm sub claim and expiry
  const jwtPayload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  console.log(`JWT sub=${jwtPayload.sub} role=${jwtPayload.role} exp=${new Date(jwtPayload.exp * 1000).toISOString()}`);
  if (jwtPayload.sub !== userId) {
    console.error(`ABORT: JWT sub does not match user.id`);
    process.exit(1);
  }

  // Verify token is accepted by auth service
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    console.error(`ABORT: /auth/v1/user rejected token (${meRes.status})`);
    process.exit(1);
  }
  const meBody = await meRes.json();
  console.log(`Auth confirmed: id=${meBody.id} email_confirmed=${!!meBody.email_confirmed_at}\n`);

  // ── 1. Create area ────────────────────────────────────────────────────────
  let areaId;
  try {
    const rows = await rest("POST", "areas", { user_id: userId, name: "CI Test Area", color: "#888888" }, accessToken);
    areaId = rows[0].id;
    createdIds.areas.push(areaId);
    pass("create area");
  } catch (e) { fail("create area", e); }

  // ── 2. Create inbox task (null area + null project — the RLS regression) ──
  let inboxTaskId;
  try {
    const rows = await rest("POST", "tasks", { user_id: userId, title: "CI inbox task", status: "todo", priority: "none" }, accessToken);
    inboxTaskId = rows[0].id;
    createdIds.tasks.push(inboxTaskId);
    pass("create inbox task (null area, null project)");
  } catch (e) { fail("create inbox task (null area, null project)", e); }

  // ── 3. Complete inbox task (UPDATE — the second RLS regression case) ──────
  if (inboxTaskId) {
    try {
      await rest("PATCH", "tasks", { status: "completed", completed_at: new Date().toISOString() }, accessToken, `?id=eq.${inboxTaskId}`);
      pass("complete inbox task");
    } catch (e) { fail("complete inbox task", e); }
  }

  // ── 4. Create area-anchored task ──────────────────────────────────────────
  let areaTaskId;
  if (areaId) {
    try {
      const rows = await rest("POST", "tasks", { user_id: userId, area_id: areaId, title: "CI area task", status: "todo", priority: "none" }, accessToken);
      areaTaskId = rows[0].id;
      createdIds.tasks.push(areaTaskId);
      pass("create area-anchored task");
    } catch (e) { fail("create area-anchored task", e); }
  }

  // ── 5. Create project + project-anchored task ─────────────────────────────
  if (areaId) {
    try {
      const projRows = await rest("POST", "projects", { user_id: userId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" }, accessToken);
      const projId = projRows[0].id;
      createdIds.projects.push(projId);
      const taskRows = await rest("POST", "tasks", { user_id: userId, project_id: projId, title: "CI project task", status: "todo", priority: "none" }, accessToken);
      createdIds.tasks.push(taskRows[0].id);
      pass("create project + project-anchored task");
    } catch (e) { fail("create project + project-anchored task", e); }
  }

  // ── 6. Delete own task ────────────────────────────────────────────────────
  if (areaTaskId) {
    try {
      await rest("DELETE", "tasks", null, accessToken, `?id=eq.${areaTaskId}`);
      createdIds.tasks = createdIds.tasks.filter((id) => id !== areaTaskId);
      pass("delete own task");
    } catch (e) { fail("delete own task", e); }
  }

  // ── 7. SELECT isolation: cannot see other users' data ────────────────────
  try {
    const rows = await rest("GET", `tasks?user_id=neq.${userId}&limit=1`, null, accessToken);
    if (rows.length > 0) throw new Error(`saw ${rows.length} task(s) belonging to other users`);
    pass("SELECT isolation (cannot see other users' tasks)");
  } catch (e) { fail("SELECT isolation", e); }

  // ── Results ───────────────────────────────────────────────────────────────
  await cleanup(accessToken);
  console.log(`\n${failures.length === 0 ? "All tests passed." : `${failures.length} test(s) failed:`}`);
  for (const f of failures) console.error(`  - ${f.label}: ${f.msg}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
