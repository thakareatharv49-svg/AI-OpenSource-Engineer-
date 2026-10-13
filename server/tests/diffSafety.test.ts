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
