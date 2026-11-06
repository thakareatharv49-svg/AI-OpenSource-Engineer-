export type RepositoryTreeEntry = { path: string; type: string; size?: number; sha?: string };
export type RepositoryContextLimits = { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
export type SelectedRepositoryFile = RepositoryTreeEntry & { score: number };

const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|pyi|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|rb|vue|svelte|html|css|scss|sql|sh|ps1|yml|yaml|toml|json|md)$/i;
const IMPLEMENTATION = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|pyi|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|rb|vue|svelte)$/i;
const IGNORED = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.next|\.venv|venv|__pycache__|target|out|generated)(?:\/|$)/i;
const LOCK = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|uv\.lock)$/i;
const MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml|setup\.cfg|setup\.py|go\.mod|cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|requirements\.txt|composer\.json|gemfile|mix\.exs|\.nvmrc)$/i;
const ROOT_GUIDANCE = /^(?:README(?:\.[^/]+)?|CONTRIBUTING(?:\.[^/]+)?|AGENTS\.md|SECURITY\.md|ARCHITECTURE(?:\.[^/]+)?)$/i;
const STOP = new Set(["the","and","for","with","that","this","from","when","then","into","issue","should","would","could","have","will","must","are","was","were","not","but","use","using","fix","please","ignore","previous","instructions"]);

function termsOf(issue: unknown) {
  let raw = "";
  try { raw = typeof issue === "string" ? issue : JSON.stringify(issue ?? ""); }
  catch { raw = String(issue ?? ""); }
  return [...new Set((raw.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(word => !STOP.has(word)))].slice(0, 80);
}

function scorePath(path: string, terms: string[]) {
  const normalized = path.toLowerCase();
  const name = normalized.split("/").pop() ?? normalized;
  let score = 0;
  if (ROOT_GUIDANCE.test(path)) score += 1_000;
  if (MANIFEST.test(normalized)) score += 17;
  if (/(^|\/)(src|app|lib|pkg|internal|core|modules?)(\/|$)/.test(normalized)) score += 18;
  if (/(^|\/)(tests?|specs?)(\/|$)|(?:\.|_)(?:test|spec)\.[^.]+$/.test(normalized)) score += 15;
  if (/\.(?:ts|tsx|js|jsx|py|go|rs|java|kt|swift|c|h|cpp|cs|php|rb|vue|svelte)$/i.test(name)) score += 8;
  if (/(^|\/)(examples?|fixtures?|generated|migrations|snapshots?)(\/|$)/.test(normalized)) score -= 14;
  const searchablePath = normalized.replace(/[^a-z0-9]+/g, " ");
  for (const term of terms) if (term.length >= 3 && searchablePath.includes(term)) score += Math.min(7, term.length >= 8 ? 7 : 4);
  return score;
}

export function selectRelevantRepositoryFiles(
  entries: RepositoryTreeEntry[],
  issue: unknown,
  limits: RepositoryContextLimits = {},
): SelectedRepositoryFile[] {
  const maxFiles = Math.max(1, Math.min(24, limits.maxFiles ?? 16));
  const maxFileBytes = Math.max(1, Math.min(50_000, limits.maxFileBytes ?? 20_000));
  const maxTotalBytes = Math.max(1, Math.min(160_000, limits.maxTotalBytes ?? 120_000));
  const terms = termsOf(issue);
  const candidates = entries
    .filter(entry => entry.type === "blob" && typeof entry.path === "string" &&
      typeof entry.size === "number" && entry.size > 0 && entry.size <= maxFileBytes &&
      SOURCE.test(entry.path) && !IGNORED.test(entry.path) && !LOCK.test(entry.path) &&
      !/\.min\.(?:js|css)$/i.test(entry.path) &&
      !/(?:^|\/)(?:\.env(?:\.|$)|id_(?:rsa|ed25519)|credentials\.json)$/i.test(entry.path))
    .map(entry => ({ ...entry, score: scorePath(entry.path, terms) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const selected: SelectedRepositoryFile[] = [];
  let bytes = 0;
  for (const entry of candidates) {
    if (selected.length >= maxFiles) break;
    if (bytes + (entry.size ?? 0) > maxTotalBytes) continue;
    selected.push(entry);
    bytes += entry.size ?? 0;
  }
  return selected;
}

export function repositoryContextBudget(files: Array<{ path: string; content: string }>, maxBytes = 120_000) {
  let usedBytes = 0;
  const bounded: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const remaining = maxBytes - usedBytes;
    if (remaining <= 0) break;
    const size = Buffer.byteLength(file.content, "utf8");
    if (size <= remaining) {
      bounded.push(file);
      usedBytes += size;
      continue;
    }
    const marker = "\n/* truncated */";
    const markerBytes = Buffer.byteLength(marker, "utf8");
    let content = "";
    const contentLimit = Math.max(0, remaining - markerBytes);
    for (const char of file.content) {
      if (Buffer.byteLength(content, "utf8") + Buffer.byteLength(char, "utf8") > contentLimit) break;
      content += char;
    }
    const output = content + (remaining >= markerBytes ? marker : "");
    if (output) bounded.push({ path: file.path, content: output });
    usedBytes += Buffer.byteLength(output, "utf8");
  }
  return {
    files: bounded,
    totalBytes: usedBytes,
    truncated: bounded.length < files.length || bounded.some((file, index) => file.content !== files[index]?.content),
  };
}

/** Refuse to send an empty or documentation-only snapshot to the repository analyst. */
export function assertRepositoryContextHasSource(files: Array<{ path: string; content: string }>): void {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No repository files were selected; analysis aborted instead of guessing from issue metadata.");
  }
  if (!files.some(file => typeof file.path === "string" && IMPLEMENTATION.test(file.path) && !file.path.split("/").some(part => /^(?:tests?|specs?)$/i.test(part)) && !/(?:\.|_)(?:test|spec)\.[^.]+$/i.test(file.path))) {
    throw new Error("No implementation source files were retrieved; analysis aborted instead of treating documentation-only context as source.");
  }
}
