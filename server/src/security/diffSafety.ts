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
  /(?:^|\/)\.envrc$/i,
  /(?:^|\/)\.direnv(?:\/|$)/i,
  /(?:^|\/)\.npmrc$/i,
  /(?:^|\/)\.pypirc$/i,
  /(?:^|\/)\.netrc$/i,
  /(?:^|\/)\.git-credentials$/i,
  /(?:^|\/)\.config\/gh(?:\/|$)/i,
  /(?:^|\/)\.bundle\/config$/i,
  /(?:^|\/)\.cargo\/credentials(?:\.toml)?$/i,
  /(?:^|\/)\.pypoetry\/auth\.toml$/i,
  /(?:^|\/)\.composer\/auth\.json$/i,
  /(?:^|\/)\.vault-token$/i,
  /(?:^|\/)\.config\/sops\/age\/keys\.txt$/i,
  /(?:^|\/)\.age\/keys\.txt$/i,
  /(?:^|\/)\.yarnrc(?:\.yml)?$/i,
  /(?:^|\/)\.npm\/_auth(?:Token)?$/i,
  /(?:^|\/)\.config\/pip\/pip\.conf$/i,
  /(?:^|\/)\.config\/uv\/credentials\.toml$/i,
  /(?:^|\/)\.pdm\.toml$/i,
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)\.aws(?:\/|$)/i,
  /(?:^|\/)(?:secrets?|credentials?)(?:\/|$)/i,
  /(?:^|\/)(?:id_rsa|id_ed25519|id_ecdsa|private_key|credentials\.json)$/i,
];

const secretPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/, reason: "Supabase secret API key pattern detected" },
  { pattern: /\bre_[A-Za-z0-9]{32,}\b/, reason: "Resend API key pattern detected" },
  { pattern: /\br8_[A-Za-z0-9]{32,}\b/, reason: "Replicate API token pattern detected" },
  { pattern: /\bsk-or-v1-[A-Za-z0-9]{20,}\b/, reason: "OpenRouter API key pattern detected" },
  { pattern: /\bgsk_[A-Za-z0-9]{20,}\b/, reason: "Groq API key pattern detected" },
  { pattern: /-----BEGIN (?:(?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/, reason: "Private key material detected" },
  { pattern: /\bPuTTY-User-Key-File-[0-9]+:/, reason: "PuTTY private key material detected" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, reason: "GitHub access token pattern detected" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, reason: "GitHub fine-grained token pattern detected" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, reason: "Slack access token pattern detected" },
  { pattern: /https?:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/, reason: "Slack webhook URL detected" },
  { pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, reason: "Stripe API key pattern detected" },
  { pattern: /\bnpm_[A-Za-z0-9]{30,}\b/, reason: "npm access token pattern detected" },
  { pattern: /\bpypi-[A-Za-z0-9_-]{30,}\b/, reason: "PyPI upload token pattern detected" },
  { pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/, reason: "SendGrid API key pattern detected" },
  { pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/, reason: "GitLab personal access token pattern detected" },
  { pattern: /\b(?:gldt|glrt)-[A-Za-z0-9_-]{20,}\b/, reason: "GitLab deploy or runner token pattern detected" },
  { pattern: /\bhf_[A-Za-z0-9]{30,}\b/, reason: "Hugging Face access token pattern detected" },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, reason: "Anthropic API key pattern detected" },
  { pattern: /https?:\/\/discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]{50,}/, reason: "Discord webhook URL detected" },
  { pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/, reason: "Google OAuth client secret pattern detected" },
  { pattern: /\bSK[0-9a-fA-F]{32}\b/, reason: "Twilio API key pattern detected" },
  { pattern: /\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{20,}\b/, reason: "Shopify access token pattern detected" },
  { pattern: /\bdop_v1_[a-f0-9]{40,}\b/i, reason: "DigitalOcean API token pattern detected" },
  { pattern: /\bDefaultEndpointsProtocol=https?;AccountName=[^;\s]{3,};AccountKey=[A-Za-z0-9+/=]{40,}/i, reason: "Azure Storage connection string credential detected" },
  { pattern: /\baws_secret_access_key\s*[:=]\s*["']?(?!your_|example|changeme|placeholder|\$\{)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/i, reason: "AWS secret access key assignment detected" },
  { pattern: /\baws_session_token\s*[:=]\s*["']?(?!your_|example|changeme|placeholder|\$\{)[A-Za-z0-9/+=]{40,}(?![A-Za-z0-9/+=])/i, reason: "AWS session token assignment detected" },
  { pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^/\s:@]+:(?!example\b|placeholder\b|your[-_]?|\$\{|changeme\b|password\b)[^/\s@]{8,}@/i, reason: "Database connection string contains embedded credentials" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/, reason: "JWT-like bearer token detected" },
  { pattern: /\bhttps?:\/\/[^/\s:@]+:(?!example\b|placeholder\b|your[-_]?|\$\{|changeme\b|password\b)[^/\s@]{8,}@/i, reason: "URL contains embedded credentials" },
  { pattern: /\b(?:ftp|ftps|amqp|amqps|ssh|sftp):\/\/[^/\s:@]+:(?!example\b|placeholder\b|your[-_]?|\$\{|changeme\b|password\b)[^/\s@]{8,}@/i, reason: "Non-HTTP URL contains embedded credentials" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: "AWS access key pattern detected" },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/, reason: "Google API key pattern detected" },
  { pattern: /(?=[^\n]*\bsig=[A-Za-z0-9%+/=_-]{20,})(?=[^\n]*\b(?:se|sp|sv)=)[^\n]*/i, reason: "Azure shared-access-signature credential detected" },
  { pattern: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\b/, reason: "AI-provider API key pattern detected" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?(?!your_|example|changeme|placeholder|\$\{|process\.env)[A-Za-z0-9_\-/+=]{20,}/i, reason: "Possible hard-coded credential detected" },
];

const reviewPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.github\/workflows\//i, reason: "Workflow changes can alter CI permissions or execute code with repository privileges" },
  { pattern: /(^|\/)(?:package\.json|pyproject\.toml|setup\.py|Makefile|Dockerfile)$/i, reason: "Build or dependency configuration can execute code during installation or tests" },
  { pattern: /\b(?:eval\s*\(|new Function\s*\(|child_process\.(?:exec|execSync|spawn|spawnSync)\s*\(|os\.system\s*\(|shell\s*:\s*true)\b/, reason: "Dynamic evaluation or shell execution requires manual security review" },
  { pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash)\b/i, reason: "Piping downloaded content into a shell requires manual security review" },
];

function isSensitiveDeploymentArtifact(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const exampleFile = /\.(?:example|sample|template)(?:\.json)?$/i.test(normalized);
  if (exampleFile) return false;
  return /(?:^|\/)\.terraform(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.minikube(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.kube\/cache(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.config\/(?:op|1password)(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.azure(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.config\/gcloud(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.docker\/config\.json$/i.test(normalized) ||
    /(?:^|\/)\.config\/containers\/auth\.json$/i.test(normalized) ||
    /(?:^|\/)\.terraform\.d\/credentials\.tfrc\.json$/i.test(normalized) ||
    /(?:^|\/)\.gradle\/gradle\.properties$/i.test(normalized) ||
    /(?:^|\/)\.m2\/settings\.xml$/i.test(normalized) ||
    /(?:^|\/)\.pulumi\/credentials\.json$/i.test(normalized) ||
    /(?:^|\/)\.doppler(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.wrangler(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.firebase(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.netlify\/state\.json$/i.test(normalized) ||
    /(?:^|\/)\.vercel\/\.env(?:\.[^/]+)?$/i.test(normalized) ||
    /(?:^|\/)(?:\.terraformrc|terraform\.rc)$/i.test(normalized) ||
    /(?:^|\/)[^/]+\.tfvars(?:\.json)?$/i.test(normalized) ||
    /(?:^|\/)terraform\.tfstate(?:\..*)?$/i.test(normalized) ||
    /(?:^|\/)[^/]+\.tfplan$/i.test(normalized) ||
    /\.(?:p12|pfx|jks|keystore|kdbx)$/i.test(normalized) ||
    /(?:^|\/)kubeconfig$/i.test(normalized) ||
    /(?:^|\/)\.kube\/config$/i.test(normalized) ||
    /(?:^|\/)(?:service[-_]?account|[^/]*[-_]service[-_]account)\.json$/i.test(normalized) ||
    /(?:^|\/)\.gnupg\/private-keys-v1\.d(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.password-store(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.local\/share\/keyrings(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.config\/(?:keepassxc|kwalletd|bitwarden)(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.bitwarden(?:\/|$)/i.test(normalized) ||
    // macOS Keychain databases and their containing store directory.
    /(?:^|\/)Library\/Keychains(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)[^/]+\.keychain(?:-db)?$/i.test(normalized) ||
    // Windows Credential Manager, Vault, and DPAPI user-master-key stores.
    /(?:^|\/)AppData\/(?:Local|Roaming)\/Microsoft\/(?:Credentials|Vault|Protect)(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)Microsoft\/(?:Credentials|Vault|Protect)(?:\/|$)/i.test(normalized) ||
    // Browser profile databases contain saved passwords, cookies, and active sessions.
    /(?:^|\/)(?:Google\/Chrome|Chromium|Microsoft\/Edge|BraveSoftware\/Brave-Browser|Opera Software\/Opera Stable|Vivaldi)\/(?:User Data\/)?(?:Default|Profile [0-9]+)\/(?:Login Data(?:-journal)?|Cookies(?:-journal)?|Network\/Cookies(?:-journal)?|Web Data(?:-journal)?|Login Data For Account|Account Web Data)$/i.test(normalized) ||
    /(?:^|\/)Google\/Chrome\/User Data\/Local State$/i.test(normalized) ||
    /(?:^|\/)Microsoft\/Edge\/User Data\/Local State$/i.test(normalized) ||
    /(?:^|\/)(?:\.mozilla\/firefox|Mozilla\/Firefox|Firefox\/Profiles)\/[^/]+\/(?:logins\.json|key[34]\.db|cookies\.sqlite|cert[89]\.db|sessionstore\.jsonlz4)$/i.test(normalized) ||
    /(?:^|\/)Library\/Safari\/Cookies\.binarycookies$/i.test(normalized);
}

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
    // Invisible Unicode formatting characters can disguise paths in code review.
    !/[\p{Cc}\p{Cf}]/u.test(path) &&
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

    // Git clients and filesystems may treat canonically equivalent Unicode names as the same path.
    const normalizedPath = file.normalize("NFC").toLowerCase();
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

    if (isSensitiveDeploymentArtifact(file)) {
      findings.push({ severity: "block", file, reason: "Sensitive infrastructure state or deployment credential artifact cannot be committed" });
    }

    if (unsafePathPatterns.some((pattern) => pattern.test(file))) {
      findings.push({ severity: "block", file, reason: "Sensitive credential or private-key paths cannot be committed" });
    }

    // Scan a compatibility-normalized copy so invisible format characters or full-width
    // lookalikes cannot trivially hide recognizable credentials from the safety gate.
    // The committed source remains unchanged; normalization is for detection only.
    const normalizedContent = content.normalize("NFKC").replace(/\p{Cf}/gu, "");

    for (const { pattern, reason } of secretPatterns) {
      if (pattern.test(normalizedContent)) {
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

  // De-duplicate identical findings and sort them so callers receive stable output
  // regardless of file order or overlapping safety rules.
  const uniqueFindings = [...new Map(
    findings.map((finding) => [
      `${finding.severity}\u0000${finding.file}\u0000${finding.reason}`,
      finding,
    ] as const)
  ).values()].sort((a, b) =>
    a.file.localeCompare(b.file) ||
    a.severity.localeCompare(b.severity) ||
    a.reason.localeCompare(b.reason)
  );

  return {
    safeToCommit: uniqueFindings.length === 0,
    filesChecked: input.length,
    totalBytes,
    findings: uniqueFindings,
  };
}
