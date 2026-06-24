/**
 * RLS ladder: a strict, dependency-ordered diagnostic for the 42501 INSERT
 * failure on `areas`. Each rung depends on the previous one; execution stops
 * at the FIRST failing rung, and that rung names the broken layer.
 *
 * Run it exactly like the CI integration test (same client, same headers as the
 * app, so it exercises the real RLS + JWT stack):
 *
 *   VITE_SUPABASE_URL            – project API URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY – publishable (anon-privilege) key
 *   SUPABASE_TEST_USER_NAME      – email of the pre-created test user
 *   SUPABASE_TEST_USER_PASSWORD  – password for the test user
 *
 *   npx tsx scripts/rls-ladder.ts
 *
 * The rungs:
 *   0. env vars present + client constructed
 *   1. test user signs in -> real session (session not null, capture user.id)
 *   1b. IDENTITY PROBE: what does auth.uid() actually resolve to in the DB for
 *       THIS request? (compared against the token's `sub`). This is the rung
 *       that distinguishes "DB is healthy but request identity is wrong" from a
 *       real policy/grant problem. See note below.
 *   2. authenticated SELECT on areas succeeds
 *   3. authenticated INSERT into areas (user_id set to the signed-in id);
 *      on failure, print the FULL error object (message, details, hint, code).
 *
 * Note on the identity probe: create_area is SECURITY DEFINER, so its *success*
 * proves nothing about the table-layer RLS path. We are NOT using it as a health
 * signal. We call it only to read back the row it wrote, whose user_id is
 * literally `auth.uid()` as the database computed it for this request. If that
 * value does not equal the signed-in user's id, then `WITH CHECK (user_id =
 * auth.uid())` on a direct insert is guaranteed to fail no matter what the
 * client sends -- and the broken layer is JWT verification / request identity,
 * not the policy or the grants.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const TEST_EMAIL = process.env.SUPABASE_TEST_USER_NAME!;
const TEST_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD!;

function fullError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return JSON.stringify(
      { code: e.code, message: e.message, details: e.details, hint: e.hint },
      null,
      2,
    );
  }
  return String(err);
}

/** Stop the ladder. The first failing rung names the broken layer. */
function die(rung: string, detail: string): never {
  console.error(`\n✗ FIRST FAILING RUNG: ${rung}`);
  console.error(detail);
  console.error("\nLadder halted. Diagnose this rung before moving on.");
  process.exit(1);
}

async function run() {
  // ── Rung 0: env + client ──────────────────────────────────────────────────
  const missing = [
    ["VITE_SUPABASE_URL", SUPABASE_URL],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", ANON_KEY],
    ["SUPABASE_TEST_USER_NAME", TEST_EMAIL],
    ["SUPABASE_TEST_USER_PASSWORD", TEST_PASSWORD],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    die("0 (env vars / client)", `Missing env vars: ${missing.join(", ")}`);
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  console.log(`✓ rung 0: env present, client constructed (${SUPABASE_URL})`);

  // ── Rung 1: sign in -> real session ───────────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authError || !authData.session) {
    die("1 (sign in)", `signInWithPassword failed: ${fullError(authError ?? "no session")}`);
  }
  const userId = authData.user.id;
  const accessToken = authData.session.access_token;
  const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  console.log(`✓ rung 1: signed in as ${TEST_EMAIL}`);
  console.log(`    user.id      = ${userId}`);
  console.log(`    JWT sub      = ${claims.sub}`);
  console.log(`    JWT role     = ${claims.role}`);
  if (claims.sub !== userId) {
    die("1 (sign in)", `JWT sub (${claims.sub}) != user.id (${userId}) -- token identity is inconsistent.`);
  }

  // Confirm the session is live in the client before any data call.
  const { data: sessionCheck } = await supabase.auth.getSession();
  if (!sessionCheck.session) die("1 (sign in)", "getSession() returned null right after sign-in.");

  // ── Rung 1b: IDENTITY PROBE -- what is auth.uid() in the DB for this req? ──
  // create_area inserts a row with user_id = auth.uid(); we read that back.
  let probedUid: string | undefined;
  let probeAreaId: string | undefined;
  const { data: probe, error: probeError } = await supabase
    .rpc("create_area", { p_name: `__rls_ladder_probe_${Date.now()}`, p_color: "#000000" })
    .single<{ id: string; user_id: string }>();
  if (probeError) {
    console.log(`    (identity probe via create_area errored: ${fullError(probeError)})`);
  } else if (probe) {
    probedUid = probe.user_id;
    probeAreaId = probe.id;
    console.log(`    auth.uid() in DB (via create_area row) = ${probedUid}`);
  }
  if (probedUid && probedUid !== userId) {
    // Clean up the probe row best-effort before halting.
    if (probeAreaId) await supabase.from("areas").delete().eq("id", probeAreaId);
    die(
      "1b (request identity)",
      `auth.uid() resolved to ${probedUid} but the signed-in user is ${userId}.\n` +
        `The database never sees this request as the test user, so\n` +
        `WITH CHECK (user_id = auth.uid()) on a direct insert can never pass.\n` +
        `Broken layer: JWT verification / request identity (PostgREST), NOT the\n` +
        `policy or grants -- those are correct.`,
    );
  }
  if (probedUid === userId) {
    console.log(`✓ rung 1b: auth.uid() == signed-in user.id (request identity is correct)`);
  }

  // ── Rung 2: authenticated SELECT on areas ─────────────────────────────────
  const { error: selectError } = await supabase.from("areas").select("id").limit(1);
  if (selectError) {
    die("2 (authenticated SELECT on areas)", fullError(selectError));
  }
  console.log("✓ rung 2: authenticated SELECT on areas succeeded");

  // ── Rung 3: authenticated INSERT into areas (user_id explicit) ────────────
  const { data: inserted, error: insertError } = await supabase
    .from("areas")
    .insert({ user_id: userId, name: `__rls_ladder_insert_${Date.now()}`, color: "#111111" })
    .select()
    .single();
  if (insertError) {
    die(
      "3 (authenticated INSERT into areas)",
      `Insert payload user_id = ${userId} (== signed-in user).\n${fullError(insertError)}`,
    );
  }
  console.log(`✓ rung 3: authenticated INSERT into areas succeeded (id=${inserted.id})`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (inserted?.id) await supabase.from("areas").delete().eq("id", inserted.id);
  if (probeAreaId) await supabase.from("areas").delete().eq("id", probeAreaId);

  console.log("\nAll rungs passed. The table-layer INSERT path is healthy.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Unexpected error (not a rung failure):", err);
  process.exit(1);
});
