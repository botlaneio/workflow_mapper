import { createRemoteJWKSet, jwtVerify } from "jose";
import { hmacSign, safeEqual } from "../../shared/src/bytes";
import type { Env, UserRow } from "./env";

const COOKIE = "wm";
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function cookieHeader(token: string, secure: boolean, maxAge = 60 * 60 * 12): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function issueCookie(userId: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const payload = `${userId}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function userIdFromCookie(header: string | null, secret: string | undefined): Promise<string | null> {
  if (!header || !secret) return null;
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig || userId.includes(".")) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const expected = await hmacSign(`${userId}.${exp}`, secret);
  if (!safeEqual(expected, sig)) return null;
  return userId;
}

export async function emailFromAccess(request: Request, env: Env): Promise<string | null> {
  if (env.AUTH_MODE !== "access") return null;
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!jwt || !team || !aud) return null;
  const issuer = `https://${team}.cloudflareaccess.com`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(jwt, jwks, { issuer, audience: aud });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const secret = env.AUTH_SECRET;
  const cookieUser = env.AUTH_MODE === "dev" ? await userIdFromCookie(request.headers.get("Cookie"), secret) : null;
  if (cookieUser) {
    return env.DB.prepare("SELECT id, org_id, email, name, role FROM users WHERE id = ?").bind(cookieUser).first<UserRow>();
  }
  const email = await emailFromAccess(request, env);
  if (!email) return null;
  return env.DB.prepare("SELECT id, org_id, email, name, role FROM users WHERE lower(email) = ?").bind(email).first<UserRow>();
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function passwordsMatch(given: string, expected: string): boolean {
  return safeEqual(given, expected);
}
