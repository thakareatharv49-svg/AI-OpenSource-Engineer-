import { randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

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
  oauthStates.set(state, now + OAUTH_STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(req: Request, suppliedState: unknown): boolean {
  const cookieState = cookieValue(req, STATE_COOKIE);
  const state = typeof suppliedState === "string" ? suppliedState : "";
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(state && cookieState && state === cookieState && expiresAt && expiresAt > Date.now());
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
  sessions.set(session.id, session);
  return session;
}

export function getGithubSession(req: Request): GithubSession | null {
  const id = cookieValue(req, SESSION_COOKIE);
  if (!id) return null;
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

export function clearGithubSession(req: Request, res: Response): void {
  const id = cookieValue(req, SESSION_COOKIE);
  if (id) sessions.delete(id);
  res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
}

export function attachGithubSession(req: Request, res: Response, next: NextFunction): void {
  res.locals.githubSession = getGithubSession(req);
  next();
}

export function requireGithubSession(req: Request, res: Response, next: NextFunction): void {
  const session = getGithubSession(req);
  if (!session) {
    res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
    return;
  }
  res.locals.githubSession = session;
  next();
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
