import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";

type AuthUser = { login: string; avatarUrl: string | null };

export default function AuthStatus() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(() => {
    const result = new URLSearchParams(window.location.search).get("auth");
    if (result === "failed") return "GitHub sign-in failed. Please try again.";
    if (result === "not_configured") return "GitHub sign-in is not configured by the server yet.";
    return "";
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to check sign-in status.");
      const data = await response.json() as { authenticated: boolean; user: AuthUser | null };
      setUser(data.authenticated ? data.user : null);
      setError("");
    } catch {
      setError("Authentication service unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth")) {
      params.delete("auth");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
    void refresh();
  }, [refresh]);

  const logout = async () => {
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign-out failed.");
      setUser(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.");
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
          <button onClick={() => void logout()} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #475569", background: "transparent", color: "inherit", cursor: "pointer" }}>Sign out</button>
        </>
      )}
      {!loading && !user && <a href={`${API_BASE_URL}/api/auth/github`} style={{ padding: "7px 12px", borderRadius: 8, background: "#e5e7eb", color: "#111827", textDecoration: "none", fontWeight: 600 }}>Sign in with GitHub</a>}
    </div>
  );
}
