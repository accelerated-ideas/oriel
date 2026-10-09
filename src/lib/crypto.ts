import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for third-party credentials (e.g. a customer's Stripe key).
function encryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set (32+ characters)");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(payload: string) {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

// Short-lived signed tokens that tie a browser session to one conversation.
function sessionSecret() {
  const secret = process.env.WIDGET_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("WIDGET_SESSION_SECRET must be set (32+ characters)");
  return secret;
}

export type SessionClaims = {
  conversationId: string;
  agentId: string;
  // Expiry, seconds since epoch.
  exp: number;
};

export function signSession(claims: Omit<SessionClaims, "exp">, ttlSeconds = 60 * 60 * 6) {
  const body: SessionClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySession(token: unknown): SessionClaims | null {
  if (typeof token !== "string") return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.conversationId || !claims.agentId) return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

// Signed, expiring tokens for anything else that round-trips through the browser
// (e.g. OAuth state). `purpose` stops a token minted for one use being replayed in another.
export function signToken(purpose: string, payload: Record<string, unknown>, ttlSeconds: number) {
  const body = { ...payload, purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyToken<T extends Record<string, unknown>>(purpose: string, token: unknown): T | null {
  if (typeof token !== "string") return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T & { purpose?: string; exp?: number };
    if (body.purpose !== purpose || !body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

