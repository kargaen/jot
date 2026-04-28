import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOT_WEBSITE_URL = Deno.env.get("JOT_WEBSITE_URL") ?? "https://kargaen.github.io/jot/";

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

    const { data: area, error: areaErr } = await supabase
      .from("areas")
      .select("name, user_id")
      .eq("id", record.area_id)
      .single();
    if (areaErr || !area) throw new Error(`Area lookup failed: ${areaErr?.message}`);

    const { data: inviterData, error: inviterErr } = await supabase.auth.admin
      .getUserById(area.user_id);
    if (inviterErr || !inviterData?.user) throw new Error(`Inviter lookup failed: ${inviterErr?.message}`);
    const inviterEmail = inviterData.user.email ?? "Someone";

    const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const isExistingUser = allUsers?.users.some((u) => u.email === record.invited_email) ?? false;

    const { subject, html } = isExistingUser
      ? buildExistingUserEmail(inviterEmail, area.name)
      : buildNewUserEmail(inviterEmail, area.name);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
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

function renderShell(input: {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  footnote: string;
}) {
  return `
    <div style="margin:0;padding:0;background:#f5f5f4;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e5e4;">
          <div style="height:8px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
          <div style="padding:36px 32px 28px 32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1c1917;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;margin-bottom:14px;">
              Jot
            </div>
            <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.15;font-weight:800;color:#1c1917;">
              ${input.headline}
            </h1>
            <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#57534e;">
              Think it. Jot it. Do it.
            </p>
            <div style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#44403c;">
              ${input.body}
            </div>
            <p style="margin:0 0 24px 0;">
              <a
                href="${input.ctaHref}"
                style="display:inline-block;padding:14px 22px;border-radius:12px;background:#f59e0b;color:#1c1917;text-decoration:none;font-size:15px;font-weight:800;"
              >${input.ctaLabel}</a>
            </p>
            <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#78716c;">
              If the button does not work, use this link instead:
            </p>
            <p style="margin:0 0 28px 0;font-size:13px;line-height:1.7;word-break:break-all;">
              <a href="${input.ctaHref}" style="color:#d97706;text-decoration:underline;">
                ${input.ctaHref}
              </a>
            </p>
            <div style="padding-top:18px;border-top:1px solid #e7e5e4;margin-top:20px;">
              <p style="margin:0 0 16px 0;font-size:12px;line-height:1.6;color:#a8a29e;">
                ${input.footnote}
              </p>
              <div style="text-align:center;">
                <img
                  src="https://kargaen.github.io/jot/icon.png"
                  alt="Jot"
                  width="44"
                  height="44"
                  style="display:block;margin:0 auto 10px auto;border-radius:12px;"
                />
                <div style="font-size:12px;color:#a8a29e;">Jot</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildExistingUserEmail(inviterEmail: string, spaceName: string) {
  return {
    subject: `${inviterEmail} shared "${spaceName}" with you on Jot`,
    html: renderShell({
      headline: "You've been added to a shared space",
      body: `
        <p style="margin:0;">
          <strong>${inviterEmail}</strong> has shared the <strong>${spaceName}</strong> space with you in Jot.
          Open the app, sign in, and go to Preferences -> Sharing to accept.
        </p>
      `,
      ctaLabel: "Open Jot",
      ctaHref: JOT_WEBSITE_URL,
      footnote: "You received this because your email was used to share a Jot space.",
    }),
  };
}

function buildNewUserEmail(inviterEmail: string, spaceName: string) {
  return {
    subject: `${inviterEmail} invited you to Jot`,
    html: renderShell({
      headline: "You've been invited to Jot",
      body: `
        <p style="margin:0 0 14px 0;">
          <strong>${inviterEmail}</strong> wants to share the <strong>${spaceName}</strong> space with you.
        </p>
        <p style="margin:0;">
          Open Jot on this device, create your account there, then confirm your email and accept the invite from Preferences -> Sharing.
        </p>
      `,
      ctaLabel: "Open Jot",
      ctaHref: JOT_WEBSITE_URL,
      footnote: "You received this because your email was used to share a Jot space. If this was not you, you can safely ignore this email.",
    }),
  };
}
