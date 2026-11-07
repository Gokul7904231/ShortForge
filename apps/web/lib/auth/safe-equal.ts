import crypto from "node:crypto";

/** Constant-time string comparison for secret material. Returns false if either side is empty. */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
