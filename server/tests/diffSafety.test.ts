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
    "hvs." + "a".repeat(28),
    "hvb." + "b".repeat(28),
    "dckr_pat_" + "c".repeat(32),
    "dapi" + "d".repeat(32),
    "ATATT3x" + "e".repeat(48),
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
      "Vault service token: hvs-example",
      "Vault batch token: hvb-placeholder",
      "Docker Hub token: dckr_pat-example",
      "Docker Hub token: dckr_pat-placeholder",
      "Databricks token: dapi-example",
      "Databricks token: dapi-placeholder",
      "Atlassian API token: ATATT3x-example",
      "Atlassian API token: ATATT3x-placeholder",
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


test("blocks Google Application Default Credentials outside the standard SDK directory", () => {
  for (const file of [
    "application_default_credentials.json",
    "home/alice/application_default_credentials.json",
    "workspace/runtime/application_default_credentials.json",
    "home/runner/.config/gcloud/application_default_credentials.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});


test("blocks alternate Azure CLI/MSAL and Google Cloud SDK credential artifacts", () => {
  for (const file of [
    "accessTokens.json",
    "home/alice/accessTokens.json",
    "workspace/runtime/azureProfile.json",
    "home/runner/msal_token_cache.bin",
    "tmp/msal_token_cache.json",
    "credentials.db",
    "workspace/runtime/access_tokens.db",
    "home/alice/legacy_credentials/1234567890.json",
    "exports/client_secret_project.json",
    "workspace/oauth/client_secret_123.apps.googleusercontent.com.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named Azure and Google Cloud credential templates and ordinary source", () => {
  const report = inspectProposedChanges([
    { file: "docs/accessTokens.json.example", after: '{"tokens":[]}' },
    { file: "docs/azureProfile.json.sample", after: '{"subscriptions":[]}' },
    { file: "docs/msal_token_cache.bin.template", after: "placeholder cache" },
    { file: "docs/credentials.db.example", after: "placeholder database" },
    { file: "docs/client_secret_project.json.template", after: '{"installed":{}}' },
    { file: "infra/gcp-provider.tf", after: 'provider "google" { project = "example-project" }' },
    { file: "infra/azure-provider.tf", after: 'provider "azurerm" { features {} }' },
    { file: "docs/cloud-authentication.md", after: "Use short-lived cloud credentials and never commit local token caches." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks Azure service-principal and Google Cloud service-identity key exports", () => {
  for (const file of [
    "azureauth.json",
    "home/alice/azure-credentials.json",
    "workspace/secrets/azure_credentials.json",
    "servicePrincipal.json",
    "exports/service-principal.json",
    "home/runner/sp_credentials.json",
    "gcp-credentials.json",
    "workspace/identity/google-credentials.json",
    "downloads/gcp-service-account.json",
    "service-account-key.json",
    "infra/prod/service_account_key.json",
    "secrets/service-account-credentials.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named cloud service-identity templates and ordinary source", () => {
  const report = inspectProposedChanges([
    { file: "docs/azureauth.json.example", after: '{"clientId":"replace-me"}' },
    { file: "docs/servicePrincipal.json.sample", after: '{"tenant":"example"}' },
    { file: "docs/gcp-credentials.json.template", after: '{"type":"service_account"}' },
    { file: "docs/service-account-key.json.example", after: '{"private_key":"replace-me"}' },
    { file: "infra/azure-identity.tf", after: 'resource "azurerm_user_assigned_identity" "example" {}' },
    { file: "infra/gcp-identity.tf", after: 'resource "google_service_account" "example" {}' },
    { file: "docs/cloud-identity.md", after: "Prefer workload identity federation over downloaded long-lived key files." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
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


test("blocks additional package-manager and build-tool authentication stores", () => {
  for (const file of [
    ".yarnrc.yml",
    "frontend/.yarnrc",
    ".npm/_auth",
    ".npm/_authToken",
    ".config/pip/pip.conf",
    "home/.config/uv/credentials.toml",
    ".pdm.toml",
    ".config/containers/auth.json",
    ".terraform.d/credentials.tfrc.json",
    ".gradle/gradle.properties",
    "home/.m2/settings.xml",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named templates for additional authentication artifacts", () => {
  const report = inspectProposedChanges([
    { file: ".yarnrc.yml.example", after: "npmAuthToken: ${NPM_TOKEN}\n" },
    { file: ".config/pip/pip.conf.template", after: "[global]\nindex-url = https://example.invalid/simple\n" },
    { file: ".gradle/gradle.properties.sample", after: "signingKey=replace-me\n" },
    { file: ".m2/settings.xml.example", after: "<settings />\n" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks local secret-manager, encryption-key, and Kubernetes cache artifacts", () => {
  for (const file of [
    ".vault-token",
    "home/.vault-token",
    ".config/sops/age/keys.txt",
    "infra/.age/keys.txt",
    ".minikube/client.key",
    ".minikube/profiles/dev/config.json",
    ".kube/cache/discovery/cluster.example/servergroups.json",
    ".config/op/config",
    "home/.config/1password/agent.sock",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named local secret-store documentation templates", () => {
  const report = inspectProposedChanges([
    { file: ".vault-token.example", after: "replace-with-your-vault-token" },
    { file: ".config/sops/age/keys.txt.template", after: "# placeholder only" },
    { file: ".minikube/config.sample", after: "apiVersion: v1" },
    { file: ".config/op/config.example", after: "account: example" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks desktop password-manager, OS keyring, and GPG private-key artifacts", () => {
  for (const file of [
    ".gnupg/private-keys-v1.d/ABCDEF.key",
    "home/.gnupg/private-keys-v1.d/secret.key",
    ".password-store/email/personal.gpg",
    "home/.local/share/keyrings/login.keyring",
    ".config/keepassxc/keepassxc.ini",
    ".config/kwalletd/kdewallet.kwl",
    ".config/bitwarden/data.json",
    ".bitwarden/cache.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named desktop secret-store documentation templates", () => {
  const report = inspectProposedChanges([
    { file: ".gnupg/private-keys-v1.d/README.example", after: "documentation only" },
    { file: ".password-store/README.template", after: "Describe local password-store usage" },
    { file: ".local/share/keyrings/README.sample", after: "No keyring data" },
    { file: ".config/keepassxc/config.example", after: "database_path: example.kdbx" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Windows and macOS operating-system credential-store artifacts", () => {
  for (const file of [
    "Users/alice/Library/Keychains/login.keychain-db",
    "Library/Keychains/System.keychain",
    "backup/Alice.keychain",
    "Users/alice/AppData/Roaming/Microsoft/Credentials/credential.bin",
    "Users/alice/AppData/Local/Microsoft/Vault/Policy.vpol",
    "Users/alice/AppData/Roaming/Microsoft/Protect/S-1-5-21/masterkey",
    "AppData/Local/Microsoft/Credentials/9A1B2C3D",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named Windows and macOS credential-store documentation templates", () => {
  const report = inspectProposedChanges([
    { file: "docs/login.keychain-db.example", after: "documentation only" },
    { file: "docs/credential.bin.sample", after: "replace with local fixture" },
    { file: "docs/Policy.vpol.template", after: "example policy" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks browser profile databases containing saved credentials and sessions", () => {
  for (const file of [
    "Users/alice/AppData/Local/Google/Chrome/User Data/Default/Login Data",
    "Users/alice/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies",
    "Users/alice/AppData/Local/Microsoft/Edge/User Data/Local State",
    "home/.config/BraveSoftware/Brave-Browser/Default/Web Data",
    "home/.config/chromium/Default/Cookies",
    "home/.config/google-chrome/Local State",
    "home/.config/microsoft-edge/Local State",
    "Users/alice/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default-release/logins.json",
    "Users/alice/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default-release/key4.db",
    "home/.mozilla/firefox/abc.default-release/key4.db",
    "home/.mozilla/firefox/abc.default-release/cookies.sqlite",
    "Users/alice/Library/Safari/Cookies.binarycookies",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named browser credential documentation templates", () => {
  const report = inspectProposedChanges([
    { file: "docs/Login Data.example", after: "documentation only" },
    { file: "docs/logins.json.sample", after: "{ \"note\": \"replace locally\" }" },
    { file: "docs/cookies.sqlite.template", after: "placeholder only" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks database GUI connection profiles and database shell history", () => {
  for (const file of [
    "Users/alice/AppData/Roaming/MongoDB/Compass/connections.json",
    "home/alice/.config/MongoDB Compass/connections.json",
    "home/alice/.mongodb/compass/connections.json",
    "workspace/.metadata/.plugins/org.jkiss.dbeaver.core/data-sources.json",
    "workspace/.metadata/.plugins/org.jkiss.dbeaver.core/credentials-config.json",
    "home/alice/.mongosh_repl_history",
    "home/alice/.mongodb_shell_history",
    "home/alice/.config/mongosh/config.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named database client profile templates and ordinary source files", () => {
  const report = inspectProposedChanges([
    { file: "docs/connections.json.example", after: '{"note":"documentation only"}' },
    { file: "docs/data-sources.json.template", after: '{"connections":[]}' },
    { file: "src/database/connections.ts", after: "export const connections = [];" },
    { file: "docs/database-client-security.md", after: "Do not commit saved database profiles." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("does not block ordinary application cookie and login source files", () => {
  const report = inspectProposedChanges([
    { file: "src/auth/login.ts", after: "export function login() { return true; }" },
    { file: "src/http/cookies.ts", after: "export const cookieName = \"session\";" },
    { file: "docs/browser-session-security.md", after: "Browsers store sessions locally." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks PuTTY private-key files even when stored outside the .ssh directory", () => {
  for (const file of [
    "Users/alice/Documents/keys/workstation.ppk",
    "backup/remote-access/production.PPK",
    "home/alice/Downloads/legacy.ppk",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named PuTTY private-key documentation templates and public-key files", () => {
  const report = inspectProposedChanges([
    { file: "docs/example.ppk.example", after: "documentation only" },
    { file: "fixtures/remote-access.ppk.sample", after: "placeholder only" },
    { file: "keys/developer.pub", after: "ssh-ed25519 AAAA synthetic-public-key comment" },
    { file: "docs/ssh-key-handling.md", after: "Never commit private keys." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks database CLI password files and Redis command history", () => {
  for (const file of [
    "home/alice/.pgpass",
    "Users/alice/AppData/Roaming/postgresql/pgpass.conf",
    "home/alice/.my.cnf",
    "home/alice/.mylogin.cnf",
    "home/alice/.rediscli_history",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive credential or private-key paths cannot be committed"
    ), file);
  }
});

test("allows explicitly named database CLI credential documentation templates", () => {
  const report = inspectProposedChanges([
    { file: "docs/.pgpass.example", after: "hostname:port:database:username:password" },
    { file: "fixtures/.my.cnf.template", after: "[client]\\nuser=example" },
    { file: "docs/database-cli-credentials.md", after: "Keep database credentials out of source control." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks local AI coding-assistant credentials and extension session stores", () => {
  for (const file of [
    "home/alice/.claude.json",
    "home/alice/.claude/.credentials.json",
    "home/alice/.codex/auth.json",
    "home/alice/.codex/credentials.json",
    "home/alice/.gemini/oauth_creds.json",
    "home/alice/.gemini/google_accounts.json",
    "home/alice/.codeium/windsurf/auth.json",
    "home/alice/.config/codeium/windsurf/credentials/token.json",
    "Users/alice/AppData/Roaming/Code/User/globalStorage/github.copilot/state.vscdb",
    "Users/alice/AppData/Roaming/Code/User/globalStorage/github.copilot-chat/state.vscdb",
    "home/alice/.cursor/auth.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named AI coding-assistant documentation templates and ordinary source", () => {
  const report = inspectProposedChanges([
    { file: "docs/.claude.json.example", after: '{"note":"documentation only"}' },
    { file: "docs/auth.json.template", after: '{"provider":"example"}' },
    { file: "src/ai/codex.ts", after: "export const codex = true;" },
    { file: "src/auth/session.ts", after: "export function session() { return null; }" },
    { file: "docs/ai-assistant-credentials.md", after: "Never commit local assistant credentials." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks remote-access, tunnel, and sync-client authentication stores", () => {
  for (const file of [
    "home/alice/.ngrok2/ngrok.yml",
    "home/alice/.config/ngrok/ngrok.yml",
    "home/alice/.cloudflared/cert.pem",
    "home/alice/.config/cloudflared/cert.pem",
    "home/alice/.config/tailscale/tailscaled.state",
    "home/alice/.local/share/tailscale/tailscaled.state",
    "home/alice/.tsh/keys/proxy.example.com/alice",
    "home/alice/.config/teleport/keys/profile",
    "home/alice/.config/rclone/rclone.conf",
    "home/alice/.oci/sessions/session.json",
    "home/alice/.config/oci/sessions/session.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named remote-access credential templates and ordinary source", () => {
  const report = inspectProposedChanges([
    { file: "docs/ngrok.yml.example", after: "authtoken: replace-me" },
    { file: "docs/cert.pem.sample", after: "synthetic certificate placeholder" },
    { file: "docs/rclone.conf.template", after: "[remote]\ntype = example" },
    { file: "src/network/tunnel.ts", after: "export const tunnelName = 'example';" },
    { file: "docs/remote-access-security.md", after: "Keep tunnel credentials out of source control." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks local CI/CD agent registration tokens and credential stores", () => {
  for (const file of [
    "home/alice/.circleci/cli.yml",
    "etc/gitlab-runner/config.toml",
    "home/alice/.gitlab-runner/config.toml",
    "etc/buildkite-agent/buildkite-agent.cfg",
    "home/alice/.buildkite-agent/token",
    "home/alice/.drone/config",
    "var/lib/jenkins/.jenkins/credentials.xml",
    "home/alice/.config/jenkins/credentials.xml",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows explicitly named CI/CD credential templates and ordinary source", () => {
  const report = inspectProposedChanges([
    { file: "docs/cli.yml.example", after: "api_token: replace-me" },
    { file: "docs/config.toml.sample", after: "token = \"replace-me\"" },
    { file: "docs/credentials.xml.template", after: "<credentials />" },
    { file: "src/ci/runner.ts", after: "export const runner = 'example';" },
    { file: "docs/ci-agent-security.md", after: "Do not commit runner registration tokens." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Kubernetes Secret manifests regardless of filename", () => {
  const manifests = [
    {
      file: "deploy/namespace-config.yaml",
      after: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: app-credentials\ntype: Opaque\nstringData:\n  API_TOKEN: synthetic-placeholder\n",
    },
    {
      file: "clusters/prod/resources.json",
      after: JSON.stringify({
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: "app-credentials" },
        data: { API_TOKEN: "cGxhY2Vob2xkZXI=" },
      }),
    },
  ];

  for (const change of manifests) {
    const report = inspectProposedChanges([change]);
    assert.equal(report.safeToCommit, false, change.file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Kubernetes Secret manifests containing data or stringData cannot be committed"
    ), change.file);
  }
});

test("allows explicitly named Kubernetes Secret templates and ordinary manifests", () => {
  const report = inspectProposedChanges([
    {
      file: "docs/kubernetes-secret.yaml.example",
      after: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: example\nstringData:\n  API_TOKEN: replace-me\n",
    },
    {
      file: "deploy/app-config.yaml",
      after: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: app-config\ndata:\n  LOG_LEVEL: info\n",
    },
    {
      file: "src/kubernetesSecrets.ts",
      after: "export function createSecretManifest() { return { kind: 'Secret' }; }\n",
    },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks self-hosted GitHub Actions runner credential artifacts", () => {
  for (const file of [
    "home/runner/actions-runner/.credentials",
    "opt/actions-runner/.credentials_rsaparams",
    "srv/actions-runner/.runner",
    "srv/actions-runner/.service",
    "srv/actions-runner/.credentials.public-key",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("blocks GitHub Actions runner metadata in custom-named installation directories", () => {
  for (const file of [
    "opt/custom-runner/.runner",
    "srv/ci-worker/.service",
    "home/runner-02/.credentials.public-key",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows runner metadata templates and similarly named ordinary source files", () => {
  const report = inspectProposedChanges([
    { file: "docs/.runner.example", after: "placeholder runner metadata" },
    { file: "docs/.service.sample", after: "placeholder service metadata" },
    { file: "docs/.credentials.public-key.template", after: "placeholder public key" },
    { file: "src/ci/runner.ts", after: "export const runner = 'ready';" },
    { file: "src/services/service.ts", after: "export function service() { return true; }" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});

test("blocks Azure DevOps agent authentication files in nested agent directories", () => {
  for (const file of [
    "opt/azagent/.credentials",
    "opt/azagent/.credentials_rsaparams",
    "opt/azagent/.agent",
    "home/alice/azure-pipelines-agent/.credentials",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named self-hosted runner credential templates and normal application files", () => {
  const report = inspectProposedChanges([
    { file: "docs/.credentials.example", after: "replace-with-local-runner-credential" },
    { file: "docs/.runner.sample", after: "synthetic runner metadata" },
    { file: "src/ci/runner.ts", after: "export const runnerStatus = 'ready';" },
    { file: "docs/self-hosted-runner-security.md", after: "Keep runner registration credentials out of source control." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Kubernetes SecretList manifests with secret payloads regardless of filename", () => {
  const manifests = [
    {
      file: "clusters/prod/objects.yaml",
      after: "apiVersion: v1\nkind: SecretList\nitems:\n  - metadata:\n      name: service-token\n    type: Opaque\n    data:\n      token: cGxhY2Vob2xkZXI=\n",
    },
    {
      file: "clusters/prod/objects.json",
      after: JSON.stringify({
        apiVersion: "v1",
        kind: "SecretList",
        items: [
          {
            metadata: { name: "service-token" },
            type: "Opaque",
            stringData: { token: "synthetic-placeholder" },
          },
        ],
      }),
    },
  ];

  for (const change of manifests) {
    const report = inspectProposedChanges([change]);
    assert.equal(report.safeToCommit, false, change.file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Kubernetes Secret manifests containing data or stringData cannot be committed"
    ), change.file);
  }
});

test("allows SecretList documentation templates and non-secret Kubernetes lists", () => {
  const report = inspectProposedChanges([
    {
      file: "docs/secret-list.yaml.example",
      after: "apiVersion: v1\nkind: SecretList\nitems:\n  - data:\n      token: replace-me\n",
    },
    {
      file: "deploy/config-list.yaml",
      after: "apiVersion: v1\nkind: ConfigMapList\nitems:\n  - data:\n      LOG_LEVEL: info\n",
    },
    {
      file: "src/kubernetesSecretList.ts",
      after: "export function listSecrets() { return []; }\n",
    },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Helm repository and OCI registry credential configuration", () => {
  for (const file of [
    ".config/helm/repositories.yaml",
    "home/atharv/.config/helm/repositories.yaml",
    ".config/helm/registry/config.json",
    "home/runner/.config/helm/registry.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("blocks Argo CD CLI authentication context files", () => {
  for (const file of [
    ".config/argocd/config",
    "home/deployer/.config/argocd/config",
    ".argocd/config",
  ]) {
    const report = inspectProposedChanges([{ file, after: "placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), file);
  }
});

test("allows explicitly named Helm and Argo CD credential templates", () => {
  const report = inspectProposedChanges([
    { file: ".config/helm/repositories.yaml.example", after: "repositories: []\n" },
    { file: ".config/helm/registry/config.json.sample", after: "{\"auths\":{}}" },
    { file: ".config/argocd/config.template", after: "contexts: []\n" },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks renamed Terraform state, backups, saved plans, and CLI credential files", () => {
  for (const file of [
    "infra/prod.tfstate",
    "infra/prod.tfstate.backup",
    "infra/workspaces/staging.tfstate",
    "plans/release.tfplan",
    "plans/release.tfplan.backup",
    "home/alice/.terraform.d/credentials.tfrc.json",
    "home/alice/credentials.tfrc.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named Terraform artifact templates and ordinary Terraform source", () => {
  const report = inspectProposedChanges([
    { file: "docs/prod.tfstate.example", after: "replace with generated local state" },
    { file: "docs/release.tfplan.sample", after: "placeholder plan" },
    { file: "docs/credentials.tfrc.json.template", after: '{"credentials":{}}' },
    { file: "infra/main.tf", after: 'resource "null_resource" "example" {}' },
    { file: "infra/variables.tf", after: 'variable "region" { type = string }' },
    { file: "docs/terraform-state-security.md", after: "Do not commit local state or saved plans." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Vault, Consul, and Nomad local token and CLI authentication state", () => {
  for (const file of [
    ".vault-token",
    "home/alice/.vault.d/agent-token",
    "home/alice/.config/vault/token-helper.json",
    "home/alice/.config/consul/config.json",
    "etc/consul/consul.token",
    "home/alice/.consul-token",
    "home/alice/.config/nomad/cli.hcl",
    "home/alice/.nomad-token",
    "var/lib/nomad/nomad.token",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named Vault, Consul, and Nomad documentation templates and ordinary HCL", () => {
  const report = inspectProposedChanges([
    { file: "docs/.vault-token.example", after: "replace-with-local-token" },
    { file: "docs/consul.token.sample", after: "replace-with-local-token" },
    { file: "docs/.nomad-token.template", after: "replace-with-local-token" },
    { file: "infra/nomad-job.hcl", after: 'job "example" { datacenters = ["dc1"] }' },
    { file: "infra/consul-service.hcl", after: 'service { name = "example" }' },
    { file: "docs/vault-consul-nomad-security.md", after: "Keep ACL tokens out of source control." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks Ansible Vault password files and Packer variable files", () => {
  for (const file of [
    ".vault_pass",
    "home/alice/.vault_password",
    "infra/.ansible-vault-password.txt",
    "deploy/vault-password-file",
    "ansible/ansible-vault-password-file",
    "packer/prod.pkrvars.hcl",
    "packer/prod.pkrvars.json",
    "home/runner/build/production.auto.pkrvars.hcl",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named Ansible and Packer templates and ordinary infrastructure source", () => {
  const report = inspectProposedChanges([
    { file: "docs/.vault_pass.example", after: "replace-with-local-password" },
    { file: "docs/prod.pkrvars.hcl.sample", after: 'region = "example-region"' },
    { file: "docs/prod.pkrvars.json.template", after: '{"region":"example-region"}' },
    { file: "ansible/site.yml", after: "- hosts: all\\n  tasks: []\\n" },
    { file: "packer/image.pkr.hcl", after: 'source "null" "example" {}' },
    { file: "docs/ansible-vault-security.md", after: "Store vault passwords outside source control." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("blocks AWS CLI credentials, IAM Identity Center tokens, and aws-vault state", () => {
  for (const file of [
    ".aws/credentials",
    "home/alice/.aws/credentials",
    "home/alice/.aws/sso/cache/abc123.json",
    "home/alice/.aws/cli/cache/role-cache.json",
    "home/alice/.aws-vault/keys",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});


test("blocks Kubernetes kubeconfig directories and local authentication context", () => {
  for (const file of [
    ".kube/config",
    "home/alice/.kube/config",
    "home/alice/.kube/config-work",
    "home/runner/.kube/cache/discovery/cluster/server",
    "home/alice/.kube/credentials.json",
  ]) {
    const report = inspectProposedChanges([{ file, after: "synthetic placeholder content" }]);
    assert.equal(report.safeToCommit, false, file);
    assert.ok(report.findings.some((finding) =>
      finding.reason === "Sensitive infrastructure state or deployment credential artifact cannot be committed"
    ), file);
  }
});

test("allows named kubeconfig templates and ordinary Kubernetes source", () => {
  const report = inspectProposedChanges([
    { file: "docs/kubeconfig.example", after: "apiVersion: v1\\nkind: Config\\ncontexts: []" },
    { file: "docs/kubeconfig.sample", after: "apiVersion: v1\\nkind: Config\\ncontexts: []" },
    { file: "infra/k8s/deployment.yaml", after: "apiVersion: apps/v1\\nkind: Deployment" },
    { file: "docs/kubernetes-authentication.md", after: "Use short-lived credentials and avoid committing kubeconfig files." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("allows named AWS credential templates and ordinary AWS configuration", () => {
  const report = inspectProposedChanges([
    { file: "docs/credentials.example", after: "[default]\\naws_access_key_id = EXAMPLE\\naws_secret_access_key = EXAMPLE" },
    { file: "docs/aws-credentials.sample", after: "[default]\\naws_access_key_id = EXAMPLE" },
    { file: "infra/aws-provider.tf", after: 'provider "aws" { region = "us-east-1" }' },
    { file: "docs/aws-identity-center.md", after: "Use short-lived IAM Identity Center sessions." },
  ]);
  assert.equal(report.safeToCommit, true);
  assert.deepEqual(report.findings, []);
});


test("enforces Atlassian API token shape and minimum suffix length", () => {
  const matching = [
    "ATATT3x" + "a".repeat(37) + "_-Z",
    "ATATT3x" + "A".repeat(40),
    "ATATT3x" + "a".repeat(64),
  ];
  for (const secret of matching) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const token = "${secret}";` }]);
    assert.equal(report.safeToCommit, false, "token-shaped value must be blocked");
    assert.ok(report.findings.some((finding) => finding.reason === "Atlassian API token pattern detected"), secret);
  }
});

test("allows Atlassian API token near misses and explanatory placeholders", () => {
  const safeExamples = [
    "ATATT3x" + "a".repeat(39),
    "ATATT3X" + "a".repeat(48),
    "ATATT3x-example",
    "ATATT3x-placeholder-value-for-documentation",
    "The ATATT3x prefix identifies Atlassian API tokens.",
  ];
  for (const example of safeExamples) {
    const report = inspectProposedChanges([{ file: "docs/authentication.md", after: example }]);
    assert.equal(report.safeToCommit, true, example);
    assert.deepEqual(report.findings, [], example);
  }
});

test("enforces GitHub fine-grained token minimum length and supported characters", () => {
  for (const token of [
    "github_pat_" + "a".repeat(20),
    "github_pat_" + "A_9".repeat(7),
    "github_pat_" + "z".repeat(80),
  ]) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const token = "${token}";` }]);
    assert.equal(report.safeToCommit, false, token);
    assert.ok(report.findings.some((finding) =>
      finding.severity === "block" &&
      finding.reason === "GitHub fine-grained token pattern detected"
    ), token);
  }
});

test("allows GitHub fine-grained token near misses without a complete token shape", () => {
  for (const content of [
    "github_pat_" + "a".repeat(19),
    "GITHUB_PAT_" + "a".repeat(40),
    "The github_pat_ prefix is used for fine-grained tokens.",
    "github_pat-example",
    "github_pat-placeholder",
  ]) {
    const report = inspectProposedChanges([{ file: "docs/token-examples.md", after: content }]);
    assert.equal(report.safeToCommit, true, content);
    assert.deepEqual(report.findings, [], content);
  }
});

test("enforces GitLab personal, deploy, and runner token minimum lengths", () => {
  for (const token of [
    "glpat-" + "a".repeat(20),
    "glpat-" + "A_9-".repeat(5),
    "glpat-" + "z".repeat(80),
    "gldt-" + "b".repeat(20),
    "gldt-" + "B_8-".repeat(6),
    "glrt-" + "c".repeat(20),
    "glrt-" + "C_7-".repeat(6),
  ]) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const token = "${token}";` }]);
    assert.equal(report.safeToCommit, false, token);
    assert.ok(report.findings.some((finding) =>
      finding.severity === "block" &&
      /GitLab (?:personal access|deploy or runner) token pattern detected/.test(finding.reason)
    ), token);
  }
});

test("allows GitLab token near misses and explanatory placeholders", () => {
  for (const content of [
    "glpat-" + "a".repeat(19),
    "gldt-" + "b".repeat(19),
    "glrt-" + "c".repeat(19),
    "GLPAT-" + "a".repeat(40),
    "gldt-example",
    "glrt-placeholder",
    "GitLab uses glpat-, gldt-, and glrt- token prefixes.",
  ]) {
    const report = inspectProposedChanges([{ file: "docs/token-examples.md", after: content }]);
    assert.equal(report.safeToCommit, true, content);
    assert.deepEqual(report.findings, [], content);
  }
});

