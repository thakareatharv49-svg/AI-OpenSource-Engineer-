export type IssueSearchLabel = { name?: unknown };
export type IssueSearchAssignee = { login?: unknown };
export type GitHubIssueSearchItem = {
  id?: unknown;
  number?: unknown;
  title?: unknown;
  html_url?: unknown;
  repository_url?: unknown;
  user?: { login?: unknown } | null;
  created_at?: unknown;
  updated_at?: unknown;
  state?: unknown;
  locked?: unknown;
  comments?: unknown;
  labels?: unknown;
  assignees?: unknown;
  pull_request?: unknown;
};

export type IssueDiscoveryOptions = {
  query: string;
  repository: string;
  labels: string[];
  sort: "updated" | "created" | "comments";
  order: "asc" | "desc";
  page: number;
  perPage: number;
  staleDays: number;
};

export type DiscoveredIssue = {
  id: number;
  number: number;
  title: string;
  url: string;
  repository: string;
  user: string;
  createdAt: string;
  updatedAt: string;
  state: "open";
  locked: boolean;
  comments: number;
  labels: string[];
  assignees: string[];
  claimed: boolean;
  stale: boolean;
  eligible: true;
};

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LABEL = /^[^\u0000-\u001f\u007f]{1,80}$/;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseIssueDiscoveryOptions(input: Record<string, unknown>): IssueDiscoveryOptions | null {
  const query = typeof input.q === "string" ? input.q.trim() : "";
  const repository = typeof input.repo === "string" ? input.repo.trim() : "";
  if (query.length > 300 || /[\u0000-\u001f\u007f]/.test(query)) return null;
  if (repository && !REPOSITORY.test(repository)) return null;

  const rawLabels = typeof input.labels === "string" ? input.labels.split(",").map((label) => label.trim()).filter(Boolean) : [];
  if (rawLabels.length > 5 || rawLabels.some((label) => !LABEL.test(label))) return null;
  const labels = rawLabels.length ? [...new Set(rawLabels)] : ["good first issue", "good-first-issue"];

  const sort = input.sort === undefined || input.sort === "" ? "updated" : input.sort;
  const order = input.order === undefined || input.order === "" ? "desc" : input.order;
  if (sort !== "updated" && sort !== "created" && sort !== "comments") return null;
  if (order !== "asc" && order !== "desc") return null;

  const page = boundedInteger(input.page, 1, 1, 100);
  const perPage = boundedInteger(input.per_page, 30, 1, 50);
  const staleDays = boundedInteger(input.stale_days, 180, 1, 3650);
  if (page === null || perPage === null || staleDays === null) return null;

  return { query, repository, labels, sort, order, page, perPage, staleDays };
}

export function buildIssueSearchQuery(options: IssueDiscoveryOptions): string {
  const terms = ["is:issue", "is:open", ...options.labels.map((label) => `label:"${label.replace(/"/g, "\\\"")}"`)];
  if (options.repository) terms.push(`repo:${options.repository}`);
  if (options.query) terms.push(options.query);
  return terms.join(" ");
}

/** Return only actionable issues; excluded items are counted with explicit evidence. */
export function normalizeDiscoveredIssues(
  items: GitHubIssueSearchItem[],
  staleDays: number,
  now = Date.now(),
): { issues: DiscoveredIssue[]; excluded: { pullRequest: number; malformed: number; closed: number; locked: number; duplicate: number; claimed: number; stale: number } } {
  const excluded = { pullRequest: 0, malformed: 0, closed: 0, locked: 0, duplicate: 0, claimed: 0, stale: 0 };
  const issues: DiscoveredIssue[] = [];
  const cutoff = now - staleDays * 24 * 60 * 60 * 1000;

  for (const item of items) {
    if (!item || typeof item !== "object") { excluded.malformed += 1; continue; }
    if (item?.pull_request) { excluded.pullRequest += 1; continue; }
    if (!Number.isSafeInteger(item?.id) || !Number.isSafeInteger(item?.number) ||
        typeof item.title !== "string" || !item.title.trim() ||
        typeof item.html_url !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[0-9]+$/.test(item.html_url) ||
        typeof item.repository_url !== "string" || !/^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repository_url) ||
        typeof item.created_at !== "string" || !Number.isFinite(Date.parse(item.created_at)) ||
        typeof item.updated_at !== "string" || !Number.isFinite(Date.parse(item.updated_at))) {
      excluded.malformed += 1; continue;
    }
    if (item.state !== "open") { excluded.closed += 1; continue; }
    if (item.locked === true) { excluded.locked += 1; continue; }

    const labels = Array.isArray(item.labels)
      ? item.labels.map((label) => label && typeof label === "object" && typeof (label as IssueSearchLabel).name === "string" ? (label as IssueSearchLabel).name as string : "").filter(Boolean)
      : [];
    if (labels.some((label) => /^(?:duplicate|duplicate issue)$/i.test(label.trim()))) { excluded.duplicate += 1; continue; }

    const assignees = Array.isArray(item.assignees)
      ? item.assignees.map((assignee) => assignee && typeof assignee === "object" && typeof (assignee as IssueSearchAssignee).login === "string" ? (assignee as IssueSearchAssignee).login as string : "").filter(Boolean)
      : [];
    const claimed = assignees.length > 0 || labels.some((label) => /^(?:claimed|assigned|in progress|work in progress)$/i.test(label.trim()));
    if (claimed) { excluded.claimed += 1; continue; }

    const stale = Date.parse(item.updated_at) < cutoff;
    if (stale) { excluded.stale += 1; continue; }

    const repository = item.repository_url.replace("https://api.github.com/repos/", "");
    issues.push({
      id: item.id as number,
      number: item.number as number,
      title: item.title.trim(),
      url: item.html_url,
      repository,
      user: typeof item.user?.login === "string" ? item.user.login : "unknown",
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      state: "open",
      locked: false,
      comments: Number.isSafeInteger(item.comments) && (item.comments as number) >= 0 ? item.comments as number : 0,
      labels,
      assignees,
      claimed: false,
      stale: false,
      eligible: true,
    });
  }

  return { issues, excluded };
}
