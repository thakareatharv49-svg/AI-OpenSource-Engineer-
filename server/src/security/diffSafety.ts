export type SafetyFinding = {
  severity: "block" | "review";
  file: string;
  reason: string;
};

export type SafetyReport = {
  safeToCommit: boolean;
  filesChecked: number;
  totalBytes: number;
  findings: SafetyFinding[];
};

const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 500_000;
const MAX_FILE_BYTES = 200_000;

const unsafePathPatterns = [
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)\.gitmodules$/i,
  /(?:^|\/)\.env(?:\.|$)/i,
  /(?:^|\/)\.npmrc$/i,
  /(?:^|\/)\.pypirc$/i,
  /(?:^|\/)\.netrc$/i,
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)\.aws(?:\/|$)/i,
  /(?:^|\/)(?:secrets?|credentials?)(?:\/|$)/i,
  /(?:^|\/)(?:id_rsa|id_ed25519|id_ecdsa|private_key|credentials\.json)$/i,
];

const secretPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, reason: "Private key material detected" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, reason: "GitHub access token pattern detected" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, reason: "GitHub fine-grained token pattern detected" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: "AWS access key pattern detected" },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/, reason: "Google API key pattern detected" },
  { pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, reason: "AI-provider API key pattern detected" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?(?!your_|example|changeme|placeholder|\$\{|process\.env)[A-Za-z0-9_\-/+=]{20,}/i, reason: "Possible hard-coded credential detected" },
];

const reviewPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.github\/workflows\//i, reason: "Workflow changes can alter CI permissions or execute code with repository privileges" },
  { pattern: /(^|\/)(?:package\.json|pyproject\.toml|setup\.py|Makefile|Dockerfile)$/i, reason: "Build or dependency configuration can execute code during installation or tests" },
  { pattern: /\b(?:eval\s*\(|new Function\s*\(|child_process\.(?:exec|execSync|spawn|spawnSync)\s*\(|os\.system\s*\(|shell\s*:\s*true)\b/, reason: "Dynamic evaluation or shell execution requires manual security review" },
  { pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash)\b/i, reason: "Piping downloaded content into a shell requires manual security review" },
];

function isSafeRelativePath(path: string): boolean {
  const segments = path.split("/");
  const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  return (
    path.length > 0 &&
    path === path.trim() &&
    path.length <= 240 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes(":") &&
    !/[?#\u0000-\u001f\u007f]/.test(path) &&
    segments.every((segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      !/[. ]$/.test(segment) &&
      !windowsReservedName.test(segment)
    )
  );
}

export function inspectProposedChanges(input: unknown): SafetyReport {
  const findings: SafetyFinding[] = [];
  if (!Array.isArray(input) || input.length === 0) {
    return {
      safeToCommit: false,
      filesChecked: 0,
      totalBytes: 0,
      findings: [{ severity: "block", file: "(proposal)", reason: "At least one proposed file change is required" }],
    };
  }

  if (input.length > MAX_FILES) {
    return {
      safeToCommit: false,
      filesChecked: input.length,
      totalBytes: 0,
      findings: [{ severity: "block", file: "(proposal)", reason: `A proposal may change at most ${MAX_FILES} files` }],
    };
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();

  for (const [index, candidate] of input.entries()) {
    if (!candidate || typeof candidate !== "object") {
      findings.push({ severity: "block", file: `(change ${index + 1})`, reason: "File change must be an object" });
      continue;
    }

    const item = candidate as { file?: unknown; filePath?: unknown; after?: unknown; content?: unknown };
    const file = typeof item.file === "string" ? item.file : typeof item.filePath === "string" ? item.filePath : "";
    const content = typeof item.after === "string" ? item.after : typeof item.content === "string" ? item.content : "";
    if (!isSafeRelativePath(file)) {
      findings.push({ severity: "block", file: file || `(change ${index + 1})`, reason: "Unsafe or invalid repository-relative file path" });
      continue;
    }

    const normalizedPath = file.toLowerCase();
    if (seenPaths.has(normalizedPath)) {
      findings.push({ severity: "block", file, reason: "The proposal contains duplicate paths; combine each file into one change" });
    }
    seenPaths.add(normalizedPath);

    const bytes = Buffer.byteLength(content, "utf8");
    totalBytes += bytes;
    if (bytes === 0 || !content.trim()) {
      findings.push({ severity: "block", file, reason: "Empty file content is not allowed" });
    }
    if (bytes > MAX_FILE_BYTES) {
      findings.push({ severity: "block", file, reason: "File exceeds the 200 KB safety limit" });
    }

    if (unsafePathPatterns.some((pattern) => pattern.test(file))) {
      findings.push({ severity: "block", file, reason: "Sensitive credential or private-key paths cannot be committed" });
    }

    for (const { pattern, reason } of secretPatterns) {
      if (pattern.test(content)) {
        findings.push({ severity: "block", file, reason });
      }
    }

    for (const { pattern, reason } of reviewPatterns) {
      if (pattern.test(file) || pattern.test(content)) {
        findings.push({ severity: "review", file, reason });
      }
    }

    if (/(^|\n)\s*(?:\.\.\.|TODO:\s*implement|implementation goes here|insert code here)\s*(?:\n|$)/i.test(content)) {
      findings.push({ severity: "review", file, reason: "Obvious placeholder code detected; confirm the implementation is complete" });
    }
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    findings.push({ severity: "block", file: "(proposal)", reason: "Combined proposal content exceeds the 500 KB safety limit" });
  }

  return {
    safeToCommit: findings.length === 0,
    filesChecked: input.length,
    totalBytes,
    findings,
  };
}
