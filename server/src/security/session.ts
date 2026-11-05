import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { redisCommand, sharedRedisConfigured } from "./sharedRedis.js";

export type GithubSession = {
  id: string;
  login: string;
  avatarUrl: string | null;
  accessToken: string;
  createdAt: number;
  expiresAt: number;
};

const SESSION_COOKIE = "aose_session";
const STATE_COOKIE = "aose_oauth_state";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const sessions = new Map<string, GithubSession>();
const oauthStates = new Map<string, number>();

function sessionEncryptionKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_KEY ?? "";
  if (secret.length < 32) throw new Error("SESSION_ENCRYPTION_KEY must contain at least 32 characters when shared sessions are enabled.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptSession(session: GithubSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return ["enc-v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}

function decryptSession(value: string): GithubSession {
  const [version, ivText, tagText, ciphertextText, extra] = value.split(":");
  if (version !== "enc-v1" || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new Error("Stored session is not encrypted with the supported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", sessionEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as GithubSession;
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function cookieOptions(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}${secure}`;
}

export function createOAuthState(): string {
  const now = Date.now();
  for (const [state, expiresAt] of oauthStates) if (expiresAt <= now) oauthStates.delete(state);
  const state = randomBytes(32).toString("base64url");
  if (!sharedRedisConfigured()) oauthStates.set(state, now + OAUTH_STATE_TTL_MS);
  return state;
}

export async function persistOAuthState(state: string): Promise<void> {
  if (sharedRedisConfigured()) await redisCommand(["SET", `aose:oauth-state:${state}`, "1", "PX", String(OAUTH_STATE_TTL_MS), "NX"]);
}

export async function consumeOAuthState(req: Request, suppliedState: unknown): Promise<boolean> {
  const cookieState = cookieValue(req, STATE_COOKIE);
  const state = typeof suppliedState === "string" ? suppliedState : "";
  if (!state || !cookieState || state !== cookieState) return false;
  if (sharedRedisConfigured()) {
    const result = await redisCommand<number>(["EVAL", "if redis.call('GET', KEYS[1]) then redis.call('DEL', KEYS[1]); return 1 else return 0 end", "1", `aose:oauth-state:${state}`]);
    return Number(result) === 1;
  }
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.setHeader("Set-Cookie", `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(OAUTH_STATE_TTL_MS)}`);
}

export function clearOAuthStateCookie(res: Response): void {
  res.append("Set-Cookie", `${STATE_COOKIE}=; ${cookieOptions(0)}`);
}

export function createGithubSession(input: Omit<GithubSession, "id" | "createdAt" | "expiresAt">): GithubSession {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
  const session: GithubSession = { ...input, id: randomUUID(), createdAt: now, expiresAt: now + SESSION_TTL_MS };
  if (!sharedRedisConfigured()) sessions.set(session.id, session);
  return session;
}

export async function persistGithubSession(session: GithubSession): Promise<void> {
  if (sharedRedisConfigured()) await redisCommand(["SET", `aose:session:${session.id}`, encryptSession(session), "PX", String(Math.max(1, session.expiresAt - Date.now()))]);
}

export async function getGithubSession(req: Request): Promise<GithubSession | null> {
  const id = cookieValue(req, SESSION_COOKIE);
  if (!id) return null;
  if (sharedRedisConfigured()) {
    const value = await redisCommand<string | null>(["GET", `aose:session:${id}`]);
    if (!value) return null;
    try {
      const session = decryptSession(value);
      if (typeof session.id !== "string" || session.id !== id || typeof session.login !== "string" ||
          typeof session.accessToken !== "string" || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
        await redisCommand(["DEL", `aose:session:${id}`]);
        return null;
      }
      return session;
    } catch {
      await redisCommand(["DEL", `aose:session:${id}`]);
      return null;
    }
  }
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(id);
    return null;
  }
  return session;
}

export function setGithubSessionCookie(res: Response, session: GithubSession): void {
  res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; ${cookieOptions(SESSION_TTL_MS)}`);
}

export async function clearGithubSession(req: Request, res: Response): Promise<void> {
  const id = cookieValue(req, SESSION_COOKIE);
  if (id) {
    sessions.delete(id);
    if (sharedRedisConfigured()) await redisCommand(["DEL", `aose:session:${id}`]);
  }
  res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
}

export function attachGithubSession(req: Request, res: Response, next: NextFunction): void {
  void getGithubSession(req).then((session) => {
    res.locals.githubSession = session;
    next();
  }).catch(() => {
    res.status(503).json({ error: "Authentication store is unavailable.", code: "AUTH_STORE_UNAVAILABLE" });
  });
}

export function requireGithubSession(req: Request, res: Response, next: NextFunction): void {
  void getGithubSession(req).then((session) => {
    if (!session) {
      res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
      return;
    }
    res.locals.githubSession = session;
    next();
  }).catch(() => {
    res.status(503).json({ error: "Authentication store is unavailable.", code: "AUTH_STORE_UNAVAILABLE" });
  });
}

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  const allowed = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) {
    res.status(403).json({ error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  next();
}

export function sessionCookieNameForTests(): string { return SESSION_COOKIE; }
