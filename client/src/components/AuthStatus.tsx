import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";

type AuthUser = { login: string; avatarUrl: string | null };

function authMessage(result: string | null): string {
  if (result === "failed") return "GitHub sign-in failed. Please try again.";
  if (result === "not_configured") return "GitHub sign-in is not configured by the server yet.";
  if (result === "unavailable") return "The authentication store is temporarily unavailable. Please try again shortly.";
  return "";
}

export default function AuthStatus() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(() => authMessage(new URLSearchParams(window.location.search).get("auth")));

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth")) {
      params.delete("auth");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
    void fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to check sign-in status.");
        return await response.json() as { authenticated: boolean; user: AuthUser | null };
      })
      .then((data) => {
        if (active) setUser(data.authenticated ? data.user : null);
      })
      .catch(() => {
        if (active) setError("Authentication service unavailable. Please retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Sign-out failed. Please try again.");
      }
      setUser(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "10px 20px", borderBottom: "1px solid #263244", background: "#0b1220", color: "#e5e7eb", fontSize: 14 }}>
      <span style={{ marginRight: "auto", fontWeight: 700 }}>AI Open Source Engineer</span>
      {error && <span role="status" style={{ color: "#fca5a5" }}>{error}</span>}
      {!loading && user && (
        <>
          {user.avatarUrl && <img src={user.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />}
          <span>Signed in as <strong>{user.login}</strong></span>
          <a href="/my-contributions" style={{ color: "#93c5fd", textDecoration: "none" }}>My Contributions</a>
          <button onClick={() => void logout()} disabled={signingOut} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #475569", background: "transparent", color: "inherit", cursor: signingOut ? "wait" : "pointer" }}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
      {!loading && !user && <a href={`${API_BASE_URL}/api/auth/github`} style={{ padding: "7px 12px", borderRadius: 8, background: "#e5e7eb", color: "#111827", textDecoration: "none", fontWeight: 600 }}>Sign in with GitHub</a>}
    </div>
  );
}
