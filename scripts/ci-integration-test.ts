/**
 * CI integration test: full CRUD cycle against the production Supabase project.
 *
 * Uses the same @supabase/supabase-js client as the app — auth headers are
 * handled identically to production, so this tests the real RLS + JWT stack.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL            – project API URL (already in CI)
 *   VITE_SUPABASE_PUBLISHABLE_KEY       – public anon key (already in CI)
 *   SUPABASE_TEST_USER_NAME      – email of the pre-created test user
 *   SUPABASE_TEST_USER_PASSWORD  – password for the test user
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const TEST_EMAIL = process.env.SUPABASE_TEST_USER_NAME!;
const TEST_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD!;

if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_TEST_USER_NAME, SUPABASE_TEST_USER_PASSWORD");
  process.exit(1);
}

// Intercept fetch to log exactly what Authorization header reaches PostgREST.
let _nextLogLabel: string | null = null;
const _origFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (_nextLogLabel && url.includes("/rest/v1")) {
    const authHeader = (init?.headers as Record<string, string>)?.["Authorization"]
      ?? (init?.headers instanceof Headers ? init.headers.get("Authorization") : null)
      ?? "(none)";
    const tokenSuffix = authHeader === "(none)" ? "(none)" : authHeader.slice(-12);
    console.log(`  [fetch] ${_nextLogLabel} → Authorization ends with: ...${tokenSuffix}`);
    _nextLogLabel = null;
  }
  return _origFetch(input as RequestInfo, init);
};

// Single client used for both auth and data operations.
// With persistSession: false the session lives in memory; the client
// automatically attaches the Bearer token to every PostgREST request.
const authClient = createClient(SUPABASE_URL, ANON_KEY, {
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

async function run() {
  console.log(`Running CRUD integration tests against ${SUPABASE_URL}\n`);

  // ── Sign in ────────────────────────────────────────────────────────────────
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authError || !authData.session) {
    console.error(`ABORT: could not sign in as ${TEST_EMAIL}: ${authError?.message ?? "no session"}`);
    process.exit(1);
  }
  const userId = authData.user.id;
  const accessToken = authData.session.access_token;
  const jwt = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  console.log(`Signed in as ${TEST_EMAIL} (${userId})`);
  console.log(`JWT role=${jwt.role} sub=${jwt.sub} email_confirmed=${!!authData.user.email_confirmed_at}`);
  console.log(`[token ends] session=...${accessToken.slice(-12)}  anon=...${ANON_KEY.slice(-12)}`);

  // Confirm session is live in the client before any CRUD call.
  const { data: sessionCheck } = await authClient.auth.getSession();
  console.log(`getSession after login: session=${sessionCheck.session ? "present" : "null"} user=${sessionCheck.session?.user?.id ?? "none"}\n`);

  // Use the same client for data operations — its in-memory session carries
  // the Bearer token automatically on every PostgREST request.
  const db = authClient;

  async function cleanup() {
    console.log("\nCleanup: deleting data created during this run...");
    for (const id of created.tasks) await db.from("tasks").delete().eq("id", id);
    for (const id of created.projects) await db.from("projects").delete().eq("id", id);
    for (const id of created.areas) await db.from("areas").delete().eq("id", id);
    console.log("Cleanup done.");
  }

  // ── 0. Diagnostic: verify auth.uid() via create_area RPC (SECURITY DEFINER) ─
  // If this fails with "Not authenticated", auth.uid() is NULL — JWT not verified.
  // If this succeeds, auth.uid() works in SECURITY DEFINER but may still fail in RLS.
  _nextLogLabel = "create_area RPC";
  try {
    const { data: rpcData, error: rpcError } = await db
      .rpc("create_area", { p_name: "CI Diagnostic Area", p_color: "#888888" });
    if (rpcError) {
      console.log(`  [diag] create_area RPC error: ${errMsg(rpcError)}`);
    } else {
      console.log(`  [diag] create_area RPC success (auth.uid() works in SECURITY DEFINER): id=${rpcData?.id}`);
      // IDENTITY PROBE: create_area stores user_id = auth.uid(), so the row it
      // returns tells us exactly who the DB thinks we are for THIS request.
      // If this != userId, WITH CHECK (user_id = auth.uid()) on a direct insert
      // can never pass -- the broken layer is request identity, not the policy.
      const dbUid = (rpcData as { user_id?: string } | null)?.user_id;
      console.log(`  [diag] IDENTITY: signed-in user.id=${userId}  auth.uid() in DB=${dbUid}  match=${dbUid === userId}`);
      if (rpcData?.id) {
        created.areas.push(rpcData.id);
        // Use this area for subsequent tests instead of re-creating
      }
    }
  } catch (e) { console.log(`  [diag] create_area RPC threw: ${errMsg(e)}`); }

  // ── DIAG: live DIRECT-table insert probe via feedback ──────────────────────
  // feedback has user_id DEFAULT auth.uid() and INSERT policy
  // WITH CHECK (auth.uid() = user_id), TO authenticated. Unlike create_area,
  // this is NOT SECURITY DEFINER, so it exercises the exact live
  // authenticated + RLS path that the areas insert uses. If THIS succeeds, a
  // direct authenticated insert whose WITH CHECK tests auth.uid() works live,
  // and the areas failure is areas-specific. If THIS also fails with 42501,
  // the live direct-insert auth.uid() path is broken across the board.
  _nextLogLabel = "feedback INSERT (direct-table probe)";
  try {
    const { data, error } = await db
      .from("feedback")
      .insert({ text: "rls direct-insert probe" })
      .select("id,user_id")
      .single();
    if (error) throw error;
    console.log(`  [diag] feedback direct insert OK: stored user_id=${data.user_id} match=${data.user_id === userId}`);
    await db.from("feedback").delete().eq("id", data.id);
  } catch (e) {
    console.log(`  [diag] feedback direct insert FAILED: ${errMsg(e)}`);
  }

  // ── DIAG: isolate INSERT WITH CHECK from the RETURNING/SELECT policy ────────
  // .insert().select() does INSERT ... RETURNING, which must ALSO satisfy the
  // SELECT policy. areas_select/tasks_select use can_access_area/can_access_task;
  // feedback_select is `true`. If a bare insert (no RETURNING) SUCCEEDS while
  // the .select() variant 42501s, the failing layer is the SELECT-after-insert
  // policy, not the INSERT WITH CHECK.
  _nextLogLabel = "areas INSERT (no RETURNING)";
  try {
    const { error } = await db
      .from("areas")
      .insert({ user_id: userId, name: "CI diag no-return area", color: "#888888" });
    console.log(`  [diag] areas bare insert (no RETURNING): ${error ? "FAILED " + errMsg(error) : "OK"}`);
    if (!error) {
      // It was inserted (RLS bypass not involved); remove it.
      await db.from("areas").delete().eq("name", "CI diag no-return area").eq("user_id", userId);
    }
  } catch (e) { console.log(`  [diag] areas bare insert threw: ${errMsg(e)}`); }

  // Does an explicit (client-sent) user_id break feedback the way it might areas?
  try {
    const { data, error } = await db
      .from("feedback")
      .insert({ text: "rls explicit-user probe", user_id: userId })
      .select("id,user_id")
      .single();
    console.log(`  [diag] feedback insert w/ explicit user_id + RETURNING: ${error ? "FAILED " + errMsg(error) : "OK user_id=" + data.user_id}`);
    if (!error) await db.from("feedback").delete().eq("id", data.id);
  } catch (e) { console.log(`  [diag] feedback explicit-user probe threw: ${errMsg(e)}`); }

  // ── 1. Create area ─────────────────────────────────────────────────────────
  let areaId: string | undefined;
  _nextLogLabel = "areas INSERT";
  try {
    const { data, error } = await db
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
    const { data, error } = await db
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
      const { error } = await db
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
      const { data, error } = await db
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
      const { data: proj, error: projErr } = await db
        .from("projects")
        .insert({ user_id: userId, area_id: areaId, name: "CI Project", color: "#888888", status: "active" })
        .select()
        .single();
      if (projErr) throw projErr;
      created.projects.push(proj.id);

      const { data: task, error: taskErr } = await db
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
      const { error } = await db.from("tasks").delete().eq("id", areaTaskId);
      if (error) throw error;
      created.tasks = created.tasks.filter((id) => id !== areaTaskId);
      pass("delete own task");
    } catch (e) { fail("delete own task", e); }
  }

  // ── 7. SELECT isolation: cannot see other users' data ─────────────────────
  try {
    const { data, error } = await db
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
