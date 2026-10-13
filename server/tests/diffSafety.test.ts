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
  ]) {
    const report = inspectProposedChanges([{ file: "src/config.ts", after: `const example = "${secret}";` }]);
    assert.equal(report.safeToCommit, false, secret);
    assert.ok(report.findings.some((finding) => finding.severity === "block"), secret);
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
