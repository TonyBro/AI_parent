// Telegram Mini App initData validation (backend)
// Based on Telegram docs: validate hash = HMAC_SHA256(data_check_string, secret_key)
// where secret_key = HMAC_SHA256("WebAppData", bot_token)

function parseInitData(initData: string): Map<string, string> {
  const m = new Map<string, string>();
  const params = new URLSearchParams(initData);
  params.forEach((v, k) => m.set(k, v));
  return m;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBuf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const dataBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
  return new Uint8Array(sig);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function validateTelegramInitData(params: {
  initData: string;
  botToken: string;
  maxAgeSeconds?: number;
}): Promise<{ ok: true; user: any; raw: Map<string, string> } | { ok: false; reason: string }> {
  const parsed = parseInitData(params.initData);
  const providedHash = parsed.get("hash");
  if (!providedHash) return { ok: false, reason: "Missing hash" };

  const pairs: string[] = [];
  for (const [k, v] of parsed.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), new TextEncoder().encode(params.botToken));
  const computed = await hmacSha256(secretKey, new TextEncoder().encode(dataCheckString));
  const computedHex = hex(computed);
  if (computedHex !== providedHash) return { ok: false, reason: "Bad hash" };

  const authDateStr = parsed.get("auth_date");
  if (authDateStr && params.maxAgeSeconds) {
    const authDate = Number(authDateStr) * 1000;
    if (!Number.isFinite(authDate)) return { ok: false, reason: "Bad auth_date" };
    if (Date.now() - authDate > params.maxAgeSeconds * 1000) return { ok: false, reason: "initData expired" };
  }

  const userJson = parsed.get("user");
  const user = userJson ? JSON.parse(userJson) : null;
  return { ok: true, user, raw: parsed };
}


