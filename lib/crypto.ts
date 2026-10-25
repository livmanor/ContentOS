import crypto from "crypto";

if (typeof window !== "undefined") {
  throw new Error("lib/crypto is server-only and cannot be executed in the browser");
}

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENC_KEY;
  if (!keyHex) {
    throw new Error("TOKEN_ENC_KEY environment variable is not defined");
  }

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENC_KEY must be a 64-hex character (32 bytes) string, got ${key.length} bytes`
    );
  }

  return key;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: iv:tag:ciphertext (all components base64 encoded).
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypts a ciphertext in the format iv:tag:ciphertext (base64) using AES-256-GCM.
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");

  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted text format. Expected iv:tag:ciphertext"
    );
  }

  const [ivB64, tagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  if (iv.length !== 12) {
    throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
