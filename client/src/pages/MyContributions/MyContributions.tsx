import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../lib/api";

type Contribution = {
  id: string; issueUrl: string; repository: string; state: string;
  createdAt: string; updatedAt: string; retryCount: number; lastError?: string | null;
  pullRequest?: { number: number; url: string; state: string; head: string; base: string; createdAt: string } | null;
  reviewerRequest?: { reviewer: string; status: string; requestedAt: string | null; reason?: string } | null;
  events?: Array<{ at: string; message: string; to: string }>;
};

const card: React.CSSProperties = { background: "#111c2e", border: "1px solid #29384e", borderRadius: 14, padding: 18, color: "#e5e7eb" };
const muted: React.CSSProperties = { color: "#9ca3af", fontSize: 13 };

export default function MyContributions() {
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/lifecycle/`, { credentials: "include", cache: "no-store" });
        if (response.status === 401) throw new Error("Sign in with GitHub to view your contributions.");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load contribution history.");
        if (active) setItems(Array.isArray(data.contributions) ? data.contributions : []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load contributions.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => items.filter(item => {
    const matchesState = filter === "all" || item.state === filter;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || item.repository.toLowerCase().includes(needle) ||
      item.issueUrl.toLowerCase().includes(needle) || String(item.pullRequest?.number ?? "").includes(needle);
    return matchesState && matchesQuery;
  }), [items, filter, query]);

  return <main style={{ minHeight: "100vh", background: "#0b1220", color: "#f8fafc", padding: "32px max(20px, calc((100vw - 1100px) / 2))" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div><p style={{ color: "#60a5fa", fontWeight: 700, letterSpacing: 1 }}>YOUR WORKSPACE</p><h1 style={{ fontSize: 34, margin: "4px 0" }}>My Contributions</h1><p style={muted}>Your GitHub contribution workflows, PRs and review-request outcomes.</p></div>
      <Link to="/contribution" style={{ color: "#bfdbfe" }}>Start a contribution →</Link>
    </div>
    <div style={{ display: "flex", gap: 10, margin: "24px 0", flexWrap: "wrap" }}>
      <input aria-label="Search contributions" placeholder="Search repository, issue or PR…" value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1, minWidth: 220, padding: 11, borderRadius: 9, border: "1px solid #334155", background: "#111c2e", color: "white" }} />
      <select aria-label="Filter by workflow state" value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: 11, borderRadius: 9, border: "1px solid #334155", background: "#111c2e", color: "white" }}>
        <option value="all">All states</option>{["discovered","analyzing","planning","proposal_ready","review_pending","awaiting_approval","fork_pending","fork_ready","branch_ready","commit_preparing","commit_complete","retryable","failed","cancelled"].map(s => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
      </select>
    </div>
    {loading && <p role="status">Loading your contributions…</p>}
    {error && <div role="alert" style={{ ...card, borderColor: "#7f1d1d" }}>{error} <button onClick={() => window.location.reload()} style={{ marginLeft: 12 }}>Retry</button></div>}
    {!loading && !error && visible.length === 0 && <div style={card}><h2>No contributions found</h2><p style={muted}>{items.length ? "Try another search or state filter." : "Your contribution workflows will appear here after you start one."}</p></div>}
    <section style={{ display: "grid", gap: 14 }}>
      {visible.map(item => <article key={item.id} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 18 }}>{item.repository}</strong><p style={muted}><a href={item.issueUrl} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Original issue ↗</a> · Started {new Date(item.createdAt).toLocaleString()}</p></div>
          <span style={{ borderRadius: 20, padding: "5px 10px", background: "#1e3a5f", height: "fit-content", fontSize: 12 }}>{item.state.replaceAll("_"," ")}</span>
        </div>
        {item.pullRequest && <div style={{ marginTop: 12, padding: 12, background: "#0b1423", borderRadius: 10 }}>
          <strong>PR #{item.pullRequest.number} · {item.pullRequest.state}</strong> — <a href={item.pullRequest.url} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Open pull request ↗</a>
          <p style={muted}>Head: {item.pullRequest.head} → Base: {item.pullRequest.base}</p>
          {item.reviewerRequest && <p style={muted}>Upstream owner review ({item.reviewerRequest.reviewer}): <strong>{item.reviewerRequest.status.replaceAll("_"," ")}</strong>{item.reviewerRequest.reason ? ` — ${item.reviewerRequest.reason}` : ""}</p>}
        </div>}
        {item.lastError && <p role="status" style={{ color: "#fca5a5" }}>Last issue: {item.lastError}</p>}
        <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer" }}>Workflow history ({item.events?.length ?? 0} events)</summary><ol>{(item.events ?? []).slice().reverse().map((event,i) => <li key={i} style={{ margin: "8px 0" }}><span style={muted}>{new Date(event.at).toLocaleString()}</span> — {event.message}</li>)}</ol></details>
        <p style={{ ...muted, marginBottom: 0 }}>Last updated {new Date(item.updatedAt).toLocaleString()} · Retries {item.retryCount}</p>
      </article>)}
    </section>
  </main>;
}
