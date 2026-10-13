import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGeneratedProposal } from "../src/security/proposalQuality.js";

test("accepts a concrete proposal for human review without claiming it was executed", () => {
  const gate = validateGeneratedProposal({
    summary: "Fix parser boundary handling",
    changes: [{ file: "src/parser.ts", after: "export function parse(input: string) { return input.trim(); }\n" }],
  });
  assert.equal(gate.validStructure, true);
  assert.equal(gate.readyForHumanReview, true);
  assert.equal(gate.safeToCommit, true);
});

test("rejects malformed and empty model proposals deterministically", () => {
  assert.equal(validateGeneratedProposal({ summary: "empty", changes: [] }).readyForHumanReview, false);
  assert.equal(validateGeneratedProposal({ summary: "", changes: [{ file: "src/a.ts", after: "x" }] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ summary: "missing content", changes: [{ file: "src/a.ts" }] }).validStructure, false);
});

test("blocks secret-bearing and traversal proposals even if the model claims success", () => {
  for (const change of [
    { file: "../outside.ts", after: "export const value = 1;" },
    { file: "src/config.ts", after: 'const token = "ghp_123456789012345678901234567890123456";' },
  ]) {
    const gate = validateGeneratedProposal({ summary: "Looks good", changes: [change] });
    assert.equal(gate.readyForHumanReview, false);
    assert.equal(gate.safeToCommit, false);
    assert.ok(gate.reasons.length > 0);
  }
});

test("flags risky build/workflow and placeholder changes for manual review", () => {
  const gate = validateGeneratedProposal({
    summary: "Update CI",
    changes: [{ file: ".github/workflows/ci.yml", after: "name: example\n" }],
  });
  assert.equal(gate.readyForHumanReview, true);
  assert.equal(gate.safeToCommit, false);
  assert.ok(gate.safetyReport.findings.some((finding) => finding.severity === "review"));
});
