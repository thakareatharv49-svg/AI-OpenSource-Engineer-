import { Router } from "express";
import {
  clearGithubSession,
  clearOAuthStateCookie,
  consumeOAuthState,
  createGithubSession,
  createOAuthState,
  persistGithubSession,
  persistOAuthState,
  getGithubSession,
  requireTrustedOrigin,
  setGithubSessionCookie,
  setOAuthStateCookie,
} from "../security/session.js";

const router = Router();
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

function getClientOrigin(): string {
  const origins = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  return origins[0] ?? "http://localhost:5173";
}

function getCallbackUrl(): string {
  const configured = process.env.GITHUB_OAUTH_CALLBACK_URL;
  if (configured) return configured;
  const apiOrigin = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "5000"}`;
  return `${apiOrigin.replace(/\/$/, "")}/api/auth/github/callback`;
}

router.get("/github", async (_req, res) => {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET." });
    return;
  }
  const state = createOAuthState();
  try { await persistOAuthState(state); } catch {
    res.status(503).json({ error: "Authentication store is unavailable." });
    return;
  }
  setOAuthStateCookie(res, state);
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getCallbackUrl());
  url.searchParams.set("scope", "public_repo read:user");
  url.searchParams.set("state", state);
  res.redirect(302, url.toString());
});

router.get("/github/callback", async (req, res) => {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=not_configured`);
    return;
  }
  let validState = false;
  try { validState = !req.query.error && await consumeOAuthState(req, req.query.state); } catch {
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=unavailable`);
    return;
  }
  if (!validState) {
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=failed`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code || code.length > 512) {
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=failed`);
    return;
  }

  try {
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "AI-OpenSource-Engineer" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: getCallbackUrl() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) throw new Error("OAuth token exchange failed");
    const tokenData = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown; error?: unknown };
    if (typeof tokenData.access_token !== "string" || tokenData.token_type !== "bearer") throw new Error("OAuth token response was invalid");

    const userResponse = await fetch(GITHUB_USER_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "AI-OpenSource-Engineer" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userResponse.ok) throw new Error("Unable to verify GitHub identity");
    const user = await userResponse.json() as { login?: unknown; avatar_url?: unknown; id?: unknown };
    if (typeof user.login !== "string" || typeof user.id !== "number") throw new Error("GitHub identity response was invalid");

    const session = createGithubSession({
      login: user.login,
      avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
      accessToken: tokenData.access_token,
    });
    await persistGithubSession(session);
    setGithubSessionCookie(res, session);
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=success`);
  } catch {
    clearOAuthStateCookie(res);
    res.redirect(302, `${getClientOrigin()}/?auth=failed`);
  }
});

router.get("/me", async (req, res) => {
  let session;
  try { session = await getGithubSession(req); } catch {
    res.status(503).json({ error: "Authentication store is unavailable.", code: "AUTH_STORE_UNAVAILABLE" });
    return;
  }
  if (!session) {
    res.status(200).json({ authenticated: false, user: null });
    return;
  }
  res.json({
    authenticated: true,
    user: { login: session.login, avatarUrl: session.avatarUrl },
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});

router.post("/logout", requireTrustedOrigin, async (req, res) => {
  try {
    await clearGithubSession(req, res);
    res.status(200).json({ success: true });
  } catch {
    res.status(503).json({ error: "Authentication store is unavailable.", code: "AUTH_STORE_UNAVAILABLE" });
  }
});

export default router;
