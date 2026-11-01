import crypto from "node:crypto";

const PROOF_VERSION = "v1";

interface ShareProofSource {
  id: string;
  token: string;
  password_hash: string | null;
}

/**
 * Proof that a visitor supplied a share link's password. Stateless: an HMAC
 * over the share's stable identity, keyed by the share's stored password
 * hash. That key never leaves the server's database, so the proof cannot be
 * forged from the link alone, and changing the share's password changes the
 * hash and invalidates every outstanding proof.
 */
export function createShareProof(share: ShareProofSource): string {
  if (!share.password_hash) {
    throw new Error("Cannot prove a password the share does not have.");
  }
  const mac = crypto
    .createHmac("sha256", share.password_hash)
    .update(`${PROOF_VERSION}.${share.id}.${share.token}`)
    .digest("hex");
  return `${PROOF_VERSION}.${mac}`;
}

export function verifyShareProof(
  share: ShareProofSource,
  proof: string | null | undefined,
): boolean {
  if (!share.password_hash || typeof proof !== "string" || !proof) {
    return false;
  }
  const expected = createShareProof(share);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const proofBuffer = Buffer.from(proof, "utf8");
  if (expectedBuffer.length !== proofBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, proofBuffer);
}
