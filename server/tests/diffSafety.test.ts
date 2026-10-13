import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectProposedChanges } from "../src/security/diffSafety.js";

test("allows ordinary concrete source changes", () => {
  const report = inspectProposedChanges([
    { file: "src/math.ts", after: "export const add = (a: number, b: number) => a + b;\n" },
    { file: "src/math.test.ts", after: "import { add } from './math';\nif (add(2, 3) !== 5) throw new Error('bad result');\n" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
  assert.equal(report.filesChecked, 2);
});

test("blocks private keys and common provider tokens", () => {
  for (const secret of [
    "-----BEGIN RSA PRIVATE KEY-----",
    "ghp_123456789012345678901234567890123456",
    "AKIA1234567890ABCDEF",
    "AIza1234567890123456789012345678901234",
    "sk-proj-123456789012345678901234",
    "xoxb-123456789012-1234567890123",
    "https://hooks.slack.com/services/T123456/B123456/123456789012345678901234",
    "sk_live_12345678901234567890",
    "npm_123456789012345678901234567890123456",
    "pypi-123456789012345678901234567890123456",
    "SG.123456789012345678.123456789012345678",
    "glpat-123456789012345678901234",
    "gldt-123456789012345678901234",
    "glrt-123456789012345678901234",
    "hf_12345678901234567890123456789012",
    "sk-ant-123456789012345678901234",
    "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB",
    "GOCSPX-" + "123456789012345678901234",
    "SK" + "1234567890abcdef1234567890abcdef",
    "shpat_" + "12345678901234567890123456789012",
    "shpca_" + "12345678901234567890123456789012",
    "dop_v1_" + "1234567890abcdef".repeat(4),
    "DefaultEndpointsProtocol=https;AccountName=storageacct;AccountKey=" + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/abcdefghijklmnop==",
  ]) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const example = "${secret}";` }]);
    assert.equal(report.safeToCommit, false, secret);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), secret);
  }
});

test("detects secrets obscured by invisible or compatibility Unicode characters", () => {
  const token = "ghp_123456789012345678901234567890123456";
  const invisible = token.slice(0, 8) + "\u200B" + token.slice(8);
  const fullWidthPrefix = "ｇｈｐ＿" + token.slice(4);
  for (const secret of [invisible, fullWidthPrefix]) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const token = "${secret}";` }]);
    assert.equal(report.safeToCommit, false, "obfuscated credential must be blocked");
    assert.ok(report.findings.some((finding) => finding.severity === "block"));
  }
});

test("blocks Terraform working directories, saved plans, and private keystore artifacts", () => {
  for (const file of [
    ".terraform/providers/registry.terraform.io/hashicorp/aws/5.0.0/provider.exe",
    "infra/.terraform/modules/modules.json",
    "infra/prod.tfplan",
    "infra/plan.TFPLAN",
    "certs/production.p12",
    "certs/signing-key.pfx",
    "certs/release.jks",
    "secrets/app.keystore",
    "backups/password-vault.kdbx",
  ]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named infrastructure and keystore templates", () => {
  const report = inspectProposedChanges([
    { file: "infra/prod.tfplan.example", after: "placeholder content" },
    { file: "certs/signing-key.p12.sample", after: "placeholder content" },
    { file: "infra/.terraform.template", after: "placeholder content" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks additional local developer and deployment credential artifacts", () => {
  for (const file of [
    ".envrc",
    ".direnv/allow",
    ".doppler/.config",
    "infra/.wrangler/state/v3/account.json",
    ".firebase/hosting.YnVpbGQ.cache",
    ".netlify/state.json",
    ".vercel/.env.production.local",
  ]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named templates for additional deployment artifacts", () => {
  const report = inspectProposedChanges([
    { file: ".envrc.example", after: "export API_KEY=your-token-here\n" },
    { file: ".doppler/.config.template", after: "token: placeholder\n" },
    { file: ".wrangler/config.sample", after: "account_id: example\n" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks developer-tool authentication stores and package-manager credentials", () => {
  for (const file of [
    ".git-credentials",
    ".config/gh/hosts.yml",
    "home/.config/gh/hosts.yml",
    ".bundle/config",
    ".cargo/credentials",
    ".cargo/credentials.toml",
    ".pypoetry/auth.toml",
    ".composer/auth.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("blocks sensitive file paths", () => {
  for (const file of [".env", "config/.env.production", ".npmrc", ".ssh/id_ed25519", "secrets/cloud.json", ".git/config", ".gitmodules"]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
  }
});

test("requires manual review for workflow and build configuration changes", () => {
  for (const file of [".github/workflows/ci.yml", "package.json", "Dockerfile"]) {
    const report = inspectProposedChanges([{ file, after: "name: example\n" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "review"), file);
  }
});

test("blocks unsafe paths, duplicate paths, and empty changes", () => {
  assert.equal(inspectProposedChanges([{ file: "../outside.txt", after: "x" }]).safeToCommit, false);
  assert.equal(inspectProposedChanges([
    { file: "src/a.ts", after: "const a = 1;" },
    { file: "src/a.ts", after: "const a = 2;" },
  ]).safeToCommit, false);
  assert.equal(inspectProposedChanges([
    { file: "src/Café.ts", after: "export const first = 1;" },
    { file: "src/Cafe\\u0301.ts", after: "export const second = 2;" },
  ]).safeToCommit, false, "canonically equivalent Unicode paths must be treated as duplicates");
  assert.equal(inspectProposedChanges([{ file: "src/a.ts", after: "  " }]).safeToCommit, false);
});


test("blocks cross-platform dangerous path names", () => {
  for (const file of [
    "src/file:stream.ts",
    "src/trailing-dot.",
    "src/trailing-space ",
    "src/CON",
    "src/nul.txt",
    "src/com1.ts",
    "src/lpt9.log",
    "src/subdir./file.ts",
    "src/review\u202Etxt.ts",
    "src/zero\u200Bwidth.ts",
    "src/isolate\u2066name\u2069.ts",
  ]) {
    const report = inspectProposedChanges([{ file, after: "export {};\n" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("enforces file-count and total-content limits", () => {
  assert.equal(inspectProposedChanges(Array.from({ length: 31 }, (_, i) => ({
    file: `src/file-${i}.ts`,
    after: "export {};",
  }))).safeToCommit, false);
  assert.equal(inspectProposedChanges([
    { file: "src/large.ts", after: "x".repeat(200_001) },
  ]).safeToCommit, false);
});

test("does not block short documentation placeholders for newer token formats", () => {
  const report = inspectProposedChanges([{
    file: "docs/authentication.md",
    after: [
      "Use glpat-your-token-here as a placeholder in examples.",
      "The sample Hugging Face value is hf_example.",
      "https://discord.com/api/webhooks/123456789012345678/not-a-real-webhook-token",
    ].join("\n"),
  }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("does not block short cloud-credential documentation placeholders", () => {
  const report = inspectProposedChanges([{
    file: "docs/cloud-auth.md",
    after: [
      "Google OAuth secret: GOCSPX-example",
      "Twilio key: SK-not-a-real-key",
      "Shopify token: shpat_placeholder",
      "DigitalOcean token: dop_v1_example",
      "Azure connection string: DefaultEndpointsProtocol=https;AccountName=example;AccountKey=short",
    ].join("\n"),
  }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("returns deterministic, de-duplicated findings independent of file order", () => {
  const changes = [
    { file: "src/z.ts", after: "const password = \"abcdefghijklmnopqrstuvwx\";\nconst password = \"abcdefghijklmnopqrstuvwx\";" },
    { file: "src/a.ts", after: "const password = \"abcdefghijklmnopqrstuvwx\";" },
  ];
  const forward = inspectProposedChanges(changes);
  const reverse = inspectProposedChanges([...changes].reverse());
  assert.deepEqual(forward.findings, reverse.findings);
  assert.equal(
    forward.findings.filter((finding) =>
      finding.file === "src/z.ts" && finding.reason === "Possible hard-coded credential detected"
    ).length,
    1,
    "identical findings for the same file should appear once"
  );
  assert.deepEqual(
    forward.findings.map((finding) => finding.file),
    [...forward.findings.map((finding) => finding.file)].sort((a, b) => a.localeCompare(b)),
    "findings should be sorted by file path"
  );
  assert.equal(forward.safeToCommit, false);
});


test("blocks AWS secret-key and session-token assignments", () => {
  const samples = [
    "aws_secret_access_key=" + "a".repeat(40),
    "aws_session_token=" + "AQoDYXdz" + "b".repeat(56),
  ];
  for (const sample of samples) {
    const report = inspectProposedChanges([{ file: "src/aws-config.ts", after: sample }]);
    assert.equal(report.safeToCommit, false, "AWS credential assignment must be blocked");
    assert.ok(report.findings.some((finding) => finding.severity === "block"), sample.slice(0, 24));
  }
});

test("allows short AWS credential placeholders in documentation", () => {
  const report = inspectProposedChanges([{
    file: "docs/aws-auth.md",
    after: [
      "aws_secret_access_key=example",
      "aws_session_token=your-token-here",
      "aws_secret_access_key=${AWS_SECRET_ACCESS_KEY}",
    ].join("\\n"),
  }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Azure shared-access-signature credentials", () => {
  const signature = "A".repeat(36);
  const report = inspectProposedChanges([{
    file: "src/storage.ts",
    after: "https://example.blob.core.windows.net/data?sv=2024-01-01&se=2030-01-01&sp=rw&sig=" + signature,
  }]);
  assert.equal(report.safeToCommit, false);
  assert.ok(report.findings.some((finding) =>
    finding.reason === "Azure shared-access-signature credential detected"
  ));
});

test("allows ordinary Azure URL and short signature placeholders", () => {
  const report = inspectProposedChanges([{
    file: "docs/storage.md",
    after: [
      "https://example.blob.core.windows.net/data",
      "https://example.blob.core.windows.net/data?sig=placeholder&se=2030-01-01&sp=r",
    ].join("\n"),
  }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks database connection strings with embedded credentials", () => {
  const samples = [
    "postgresql://appuser:" + "a".repeat(18) + "@db.example.internal:5432/app",
    "mongodb+srv://service:" + "b".repeat(18) + "@cluster.example.mongodb.net/app",
    "redis://default:" + "c".repeat(18) + "@cache.example.internal:6379",
    "mysql://appuser:" + "d".repeat(18) + "@db.example.internal/app",
  ];
  for (const sample of samples) {
    const report = inspectProposedChanges([{ file: "src/database.ts", after: sample }]);
    assert.equal(report.safeToCommit, false, "embedded database credentials must be blocked");
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Database connection string contains embedded credentials"
    ));
  }
});

test("allows database connection strings using environment-variable placeholders", () => {
  const report = inspectProposedChanges([{
    file: "docs/database.md",
    after: [
      "postgresql://appuser:example@db.example.internal/app",
      "mongodb+srv://service:${DATABASE_PASSWORD}@cluster.example.mongodb.net/app",
      "redis://default:your-password@cache.example.internal:6379",
    ].join("\n"),
  }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks JWT-like bearer tokens in proposed content", () => {
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0." + "a".repeat(28);
  const report = inspectProposedChanges([{ file: "src/auth.ts", after: `const token = "${token}";` }]);
  assert.equal(report.safeToCommit, false);
  assert.ok(report.findings.some((finding) => finding.reason === "JWT-like bearer token detected"));
});

test("blocks credentialed HTTP URLs but allows documentation placeholders", () => {
  const secret = inspectProposedChanges([{ file: "src/client.ts", after: "https://serviceuser:" + "p".repeat(18) + "@api.example.internal/v1" }]);
  assert.equal(secret.safeToCommit, false);
  assert.ok(secret.findings.some((finding) => finding.reason === "URL contains embedded credentials"));
  const placeholder = inspectProposedChanges([{ file: "docs/client.md", after: "https://service:example@api.example.internal/v1" }]);
  assert.equal(placeholder.safeToCommit, true);
  assert.deepEqual(placeholder.findings, []);
});


test("blocks additional AI-provider API key prefixes without storing literal credentials", () => {
  const samples = ["sk-or-v1-" + "a".repeat(32), "gsk_" + "b".repeat(32)];
  for (const sample of samples) {
    const report = inspectProposedChanges([{ file: "src/ai-provider.ts", after: 'const apiKey = "' + sample + '";' }]);
    assert.equal(report.safeToCommit, false, "provider credential must be blocked");
    assert.ok(report.findings.some((finding) => finding.severity === "block"));
  }
});

test("detects additional private-key container formats", () => {
  for (const marker of ["-----BEGIN ENCRYPTED PRIVATE KEY-----", "-----BEGIN PGP PRIVATE KEY BLOCK-----", "PuTTY-User-Key-File-2: ssh-ed25519"]) {
    const report = inspectProposedChanges([{ file: "src/key-fixture.txt", after: marker }]);
    assert.equal(report.safeToCommit, false, marker);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), marker);
  }
});

test("detects embedded credentials in non-HTTP service URLs", () => {
  for (const url of ["ftp://build-user:supersecretpass@files.example.test/releases", "amqps://queue-user:long-secret-pass@broker.example.test/vhost", "ssh://deploy-user:another-secret-pass@git.example.test/repository", "sftp://backup-user:backup-secret-pass@storage.example.test/incoming"]) {
    const report = inspectProposedChanges([{ file: "src/service-config.ts", after: 'const endpoint = "' + url + '";' }]);
    assert.equal(report.safeToCommit, false, url.split("@")[0]);
    assert.ok(report.findings.some((finding) => finding.reason === "Non-HTTP URL contains embedded credentials"));
  }
});

test("allows non-HTTP URLs with documentation placeholders", () => {
  const report = inspectProposedChanges([{ file: "docs/service-config.md", after: ["ftp://user:example@files.example.test/path", "amqps://user:your-password@broker.example.test/vhost", "ssh://user:${DEPLOY_PASSWORD}@git.example.test/repository"].join("\n") }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks additional platform API token formats without storing literal credentials", () => {
  const samples = [
    "sb_secret_" + "a".repeat(32),
    "re_" + "b".repeat(32),
    "r8_" + "c".repeat(40),
  ];
  const reasons = [
    "Supabase secret API key pattern detected",
    "Resend API key pattern detected",
    "Replicate API token pattern detected",
  ];
  samples.forEach((sample, index) => {
    const report = inspectProposedChanges([{ file: "src/platform-config.ts", after: 'const apiKey = "' + sample + '";' }]);
    assert.equal(report.safeToCommit, false, reasons[index]);
    assert.ok(report.findings.some((finding) => finding.reason === reasons[index]));
  });
});

test("does not block public or placeholder platform key examples", () => {
  const report = inspectProposedChanges([{ file: "docs/platform-config.md", after: [
    "sb_publishable_" + "a".repeat(32),
    "re_your_resend_key",
    "r8_your_replicate_token",
  ].join("\n") }]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks sensitive infrastructure state and deployment credential artifacts", () => {
  for (const file of ["infra/terraform.tfstate", "infra/terraform.tfstate.backup", "infra/prod.tfvars", "infra/prod.tfvars.json", "deploy/kubeconfig", ".kube/config", "deploy/service-account.json", "deploy/prod-service-account.json"]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"), file);
  }
});

test("allows explicitly named infrastructure examples and templates", () => {
  for (const file of ["infra/prod.tfvars.example", "infra/terraform.tfvars.sample", "infra/service-account.json.template", "docs/kubeconfig.example"]) {
    const report = inspectProposedChanges([{ file, after: "replace-me-with-your-own-value\n" }]);
    assert.equal(report.safeToCommit, true, file);
    assert.deepEqual(report.findings, [], file);
  }
});


test("blocks common cloud CLI, container registry, and infrastructure-tool credential artifacts", () => {
  for (const file of [
    ".azure/accessTokens.json",
    "home/.azure/azureProfile.json",
    ".config/gcloud/credentials.db",
    ".config/gcloud/access_tokens.db",
    "home/.config/gcloud/application_default_credentials.json",
    ".docker/config.json",
    "home/.pulumi/credentials.json",
    ".terraformrc",
    "infra/terraform.rc",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named cloud credential templates", () => {
  const report = inspectProposedChanges([
    { file: ".docker/config.json.example", after: '{"auths":{}}' },
    { file: ".azure/accessTokens.json.sample", after: "replace-with-local-token-cache" },
    { file: ".config/gcloud/credentials.db.template", after: "local-only" },
    { file: ".terraformrc.example", after: 'credentials "app.terraform.io" {}' },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});
