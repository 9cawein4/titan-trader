import crypto from "crypto";

const IV_LENGTH = 16;

export function getEncryptionKeyHex(): string {
  return process.env.TITAN_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
}

export function encryptSecret(text: string): string {
  const keyHex = getEncryptionKeyHex();
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(keyHex.slice(0, 64), "hex");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptSecret(text: string): string {
  try {
    const keyHex = getEncryptionKeyHex();
    const parts = text.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const key = Buffer.from(keyHex.slice(0, 64), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

export function hmacSignPayload(data: string): string {
  const keyHex = getEncryptionKeyHex();
  return crypto.createHmac("sha256", keyHex.slice(0, 32)).update(data).digest("hex");
}
