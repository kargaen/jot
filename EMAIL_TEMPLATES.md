# Jot Email Templates

These templates keep Jot recognizable even when images are blocked by default.
The main brand signals are:

- warm amber accent color
- clean heading + short copy
- tagline: `Think it. Jot it. Do it.`
- one strong CTA
- optional logo at the bottom

## Sender

Recommended sender name:

```text
Jot
```

Recommended sender address:

```text
noreply@jot.karga.dk
```

## Shared Shell

Use this visual structure for every auth email:

```html
<div style="margin:0;padding:0;background:#f5f5f4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e5e4;">
      <div style="height:8px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>

      <div style="padding:36px 32px 28px 32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1c1917;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;margin-bottom:14px;">
          Jot
        </div>

        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.15;font-weight:800;color:#1c1917;">
          {{HEADLINE}}
        </h1>

        <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#57534e;">
          Think it. Jot it. Do it.
        </p>

        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#44403c;">
          {{BODY_COPY}}
        </p>

        <p style="margin:0 0 24px 0;">
          <a
            href="{{CTA_HREF}}"
            style="display:inline-block;padding:14px 22px;border-radius:12px;background:#f59e0b;color:#1c1917;text-decoration:none;font-size:15px;font-weight:800;"
          >
            {{CTA_LABEL}}
          </a>
        </p>

        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#78716c;">
          If the button does not work, use this link instead:
        </p>

        <p style="margin:0 0 28px 0;font-size:13px;line-height:1.7;word-break:break-all;">
          <a href="{{FALLBACK_HREF}}" style="color:#d97706;text-decoration:underline;">
            {{FALLBACK_LABEL}}
          </a>
        </p>

        {{SECONDARY_COPY}}

        <div style="padding-top:18px;border-top:1px solid #e7e5e4;margin-top:20px;">
          <p style="margin:0 0 16px 0;font-size:12px;line-height:1.6;color:#a8a29e;">
            {{FOOTNOTE}}
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
```

## Confirm Signup

Subject:

```text
Confirm your Jot account
```

Body:

```html
<div style="margin:0;padding:0;background:#f5f5f4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e5e4;">
      <div style="height:8px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
      <div style="padding:36px 32px 28px 32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1c1917;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;margin-bottom:14px;">Jot</div>
        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.15;font-weight:800;color:#1c1917;">Confirm your Jot account</h1>
        <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#57534e;">Think it. Jot it. Do it.</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#44403c;">One quick click and you're in. Confirm your email to continue in Jot.</p>
        <p style="margin:0 0 24px 0;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#f59e0b;color:#1c1917;text-decoration:none;font-size:15px;font-weight:800;">Open Jot</a>
        </p>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#78716c;">If the button does not work, use this link instead:</p>
        <p style="margin:0 0 28px 0;font-size:13px;line-height:1.7;word-break:break-all;">
          <a href="{{ .ConfirmationURL }}" style="color:#d97706;text-decoration:underline;">{{ .ConfirmationURL }}</a>
        </p>
        <div style="padding-top:18px;border-top:1px solid #e7e5e4;margin-top:20px;">
          <p style="margin:0 0 16px 0;font-size:12px;line-height:1.6;color:#a8a29e;">If you did not create a Jot account, you can safely ignore this email.</p>
          <div style="text-align:center;">
            <img src="https://kargaen.github.io/jot/icon.png" alt="Jot" width="44" height="44" style="display:block;margin:0 auto 10px auto;border-radius:12px;" />
            <div style="font-size:12px;color:#a8a29e;">Jot</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

## Magic Link

Subject:

```text
Your Jot sign-in link
```

Main copy:

```text
Use this secure link to sign in to Jot.
```

CTA label:

```text
Open Jot
```

## Reset Password

Subject:

```text
Reset your Jot password
```

Main copy:

```text
Use the link below to choose a new password for your Jot account.
```

CTA label:

```text
Reset password
```

Footnote:

```text
If you did not request a password reset, you can safely ignore this email.
```

## Invite User

Subject:

```text
You’ve been invited to Jot
```

Main copy:

```text
You’ve been invited to join Jot. Confirm your email or open the app to continue.
```

CTA label:

```text
Open Jot
```

## Confirm Email Change

Subject:

```text
Confirm your new Jot email
```

Main copy:

```text
Confirm this email address to finish updating your Jot account.
```

CTA label:

```text
Confirm email change
```

## Reauthentication

Subject:

```text
Confirm it’s you
```

Main copy:

```text
Use the code or link below to continue with this sensitive action in Jot.
```

CTA label:

```text
Continue in Jot
```

## Notes

- `{{ .ConfirmationURL }}` is the easiest safe default for most auth mails.
- If you later need server-side verification or more custom redirect logic, switch to `{{ .TokenHash }}` plus your own verification endpoint.
- Keep the logo at the bottom so blocked images do not hurt the core message.
- Brand recognition should come primarily from color, typography, wording, and the tagline.
