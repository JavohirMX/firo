import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(
    password,
    salt,
    SCRYPT_KEYLEN,
    SCRYPT_OPTIONS,
  );
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

export function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): boolean {
  try {
    const key = crypto.scryptSync(
      password,
      salt,
      SCRYPT_KEYLEN,
      SCRYPT_OPTIONS,
    );
    const hashBuffer = Buffer.from(hash, "hex");
    if (key.length !== hashBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(key, hashBuffer);
  } catch {
    return false;
  }
}

/** 256-bit CSPRNG session token */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** 128-bit CSPRNG capability token */
export function generateShareToken(): string {
  // 128 bits = 16 bytes. Base64url is URL-safe and compact.
  return crypto.randomBytes(16).toString("base64url");
}

export function generateId(): string {
  return crypto.randomBytes(16).toString("hex");
}

let dummyCredentials: { hash: string; salt: string } | null = null;

/**
 * Per-process random credentials used to run a real scrypt verification when
 * a login names an unknown user, so the response time does not reveal whether
 * the username exists. Random per process so the dummy itself is no oracle.
 */
export function getDummyPasswordCredentials(): { hash: string; salt: string } {
  if (!dummyCredentials) {
    dummyCredentials = hashPassword(crypto.randomBytes(32).toString("hex"));
  }
  return dummyCredentials;
}
