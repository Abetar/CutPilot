
import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import { isAuthenticated } from "@/lib/auth";

/**
 * CutPilot Mobile Companion Authentication
 *
 * Server-side only.
 * Validates the Android Bearer token.
 */

export function isValidMobileToken(
  request: Request
): boolean {
  const expectedToken =
    process.env.CUTPILOT_MOBILE_TOKEN;

  if (
    !expectedToken ||
    !/^[a-f0-9]{64}$/.test(expectedToken)
  ) {
    return false;
  }

  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return false;
  }

  const match = /^Bearer ([a-fA-F0-9]{64})$/.exec(
    authorization.trim()
  );

  if (!match) {
    return false;
  }

  // Compare fixed-length hashes to avoid
  // exposing timing differences.
  const expectedHash = createHash("sha256")
    .update(expectedToken)
    .digest();

  const providedHash = createHash("sha256")
    .update(match[1])
    .digest();

  return timingSafeEqual(
    expectedHash,
    providedHash
  );
}

/**
 * Authorize read access from either:
 * - The existing CutPilot Web session
 * - The private Android token
 */
export async function isMobileReadAuthorized(
  request: Request
): Promise<boolean> {
  if (isValidMobileToken(request)) {
    return true;
  }

  return isAuthenticated();
}
