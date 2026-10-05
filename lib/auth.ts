import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "cutpilot_session";

function getSessionSecret() {
  const secret = process.env.CUTPILOT_SESSION_SECRET;
  if (!secret) {
    throw new Error("CUTPILOT_SESSION_SECRET is not configured.");
  }
  return secret;
}

function sessionToken() {
  return createHmac("sha256", getSessionSecret())
    .update("cutpilot-personal-session")
    .digest("hex");
}

export function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function isValidPassword(password: string) {
  const expected = process.env.CUTPILOT_PASSWORD;

  if (!expected) {
    throw new Error("CUTPILOT_PASSWORD is not configured.");
  }

  return safeEqual(password, expected);
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return false;

  return safeEqual(token, sessionToken());
}

export async function setSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
