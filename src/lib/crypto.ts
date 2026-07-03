import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM for secrets at rest (Tradovate credentials in Neon).
 *
 * The key derives from TRADOVATE_ENCRYPTION_KEY when set, otherwise from
 * VOLTIS_SESSION_SECRET, hashed to exactly 32 bytes. Ciphertext is packed as
 * base64(iv | authTag | data) — GCM authenticates, so tampering fails decrypt.
 */

function encryptionKey(): Buffer | null {
  const secret =
    process.env.TRADOVATE_ENCRYPTION_KEY ?? process.env.VOLTIS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  return createHash("sha256").update(secret).digest();
}

export function isSecretStoreConfigured() {
  return encryptionKey() !== null;
}

export function encryptSecret(plaintext: string): string | null {
  const key = encryptionKey();
  if (!key) {
    return null;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptSecret(packed: string): string | null {
  const key = encryptionKey();
  if (!key) {
    return null;
  }
  try {
    const raw = Buffer.from(packed, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
