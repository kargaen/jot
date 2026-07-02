// Conduit API token format: "jot_" + 32 random bytes, base64url-encoded.
// Generated and hashed client-side (WebCrypto) — the plaintext is shown to
// the user once and never sent anywhere except in their own Authorization
// header; only the sha-256 hash is persisted (src/services/backend/supabase.service.ts).

const TOKEN_PREFIX = "jot_";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface GeneratedApiToken {
  plaintext: string;
  hash: string;
}

export async function generateApiToken(): Promise<GeneratedApiToken> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = TOKEN_PREFIX + toBase64Url(bytes);
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}
