const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeForHash(child)]),
    );
  }
  return value;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

export async function hashObject(value: unknown): Promise<string> {
  return sha256Hex(stableJson(value));
}

async function hmacSha256(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(signature);
}

export async function deriveTrackingToken(orderId: string, secret: string): Promise<string> {
  return base64Url(await hmacSha256(`order-tracking:${orderId}`, secret));
}

export async function hashTrackingToken(token: string, secret: string): Promise<string> {
  return bytesToHex(await hmacSha256(`tracking-token-hash:${token}`, secret));
}

export function trackingSecret(): string {
  const secret = process.env.ORDER_TRACKING_TOKEN_SECRET ?? process.env.TRACKING_TOKEN_PEPPER;
  if (!secret || secret.length < 32) {
    throw new Error("ORDER_TRACKING_TOKEN_SECRET must contain at least 32 characters");
  }
  return secret;
}
