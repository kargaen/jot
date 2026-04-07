import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ← Replace with the domain you verified in Resend
const FROM_ADDRESS = "Jot <noreply@jot.karga.dk>";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record as {
      id: string;
      area_id: string;
      invited_email: string;
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the area name and its owner
    const { data: area, error: areaErr } = await supabase
      .from("areas")
      .select("name, user_id")
      .eq("id", record.area_id)
      .single();
    if (areaErr || !area) throw new Error(`Area lookup failed: ${areaErr?.message}`);

    // Fetch the inviter's email
    const { data: inviterData, error: inviterErr } = await supabase.auth.admin
      .getUserById(area.user_id);
    if (inviterErr || !inviterData?.user) throw new Error(`Inviter lookup failed: ${inviterErr?.message}`);
    const inviterEmail = inviterData.user.email ?? "Someone";

    // Check whether the invitee already has an account
    const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const isExistingUser = allUsers?.users.some((u) => u.email === record.invited_email) ?? false;

    const { subject, html } = isExistingUser
      ? buildExistingUserEmail(inviterEmail, area.name)
      : buildNewUserEmail(inviterEmail, area.name);

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: record.invited_email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }

    console.log(`[send-space-invite] sent to ${record.invited_email} (existing=${isExistingUser})`);
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("[send-space-invite] failed:", err instanceof Error ? err.message : String(err));
    return new Response("error", { status: 500 });
  }
});

// ─── Email templates ──────────────────────────────────────────────────────────

function buildExistingUserEmail(inviterEmail: string, spaceName: string) {
  return {
    subject: `${inviterEmail} shared "${spaceName}" with you on Jot`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 16px">You've been added to a space</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px">
          <strong>${inviterEmail}</strong> has shared the
          <strong>${spaceName}</strong> space with you in Jot.
          Open the app and go to Preferences → Sharing to accept.
        </p>
        <p style="font-size:12px;color:#999;margin:0">
          You received this because your email was used to share a Jot space.
        </p>
      </div>
    `,
  };
}

function buildNewUserEmail(inviterEmail: string, spaceName: string) {
  return {
    subject: `${inviterEmail} invited you to Jot`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 16px">You've been invited to Jot</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px">
          <strong>${inviterEmail}</strong> wants to share the
          <strong>${spaceName}</strong> space with you.
          Think it. Jot it. Do it.
        </p>
        <p style="font-size:12px;color:#999;margin:0">
          You received this because your email was used to share a Jot space.
          If this wasn't you, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}
