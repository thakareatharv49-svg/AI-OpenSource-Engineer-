import assert from "node:assert/strict";
import { test } from "node:test";
import { validateIssueSelectionResult } from "../src/security/issueSelection.js";

const issues = [{ id: 101, title: "Fix parser boundary" }, { id: 202, title: "Improve documentation" }];

test("accepts a well-formed selection that references a supplied issue", () => {
  assert.deepEqual(validateIssueSelectionResult({ selectedIssueId: 202, reason: "Clear and independently actionable", difficulty: "Easy", confidence: 92 }, issues), {
    selectedIssueId: 202, reason: "Clear and independently actionable", difficulty: "Easy", confidence: 92,
  });
});

test("rejects selections for issues outside the supplied list", () => {
  assert.equal(validateIssueSelectionResult({ selectedIssueId: 999, reason: "Looks good", difficulty: "Easy", confidence: 90 }, issues), null);
});

test("rejects malformed fields and out-of-range confidence", () => {
  const valid = { selectedIssueId: 101, reason: "Actionable", difficulty: "Medium", confidence: 70 };
  for (const candidate of [{ ...valid, selectedIssueId: "101" }, { ...valid, reason: "  " }, { ...valid, difficulty: "Beginner" }, { ...valid, confidence: 101 }, { ...valid, confidence: Number.NaN }]) {
    assert.equal(validateIssueSelectionResult(candidate, issues), null);
  }
});

test("rejects ambiguous duplicate issue identifiers", () => {
  assert.equal(validateIssueSelectionResult({ selectedIssueId: 101, reason: "Actionable", difficulty: "Medium", confidence: 70 }, [...issues, { id: 101, title: "Duplicate identifier" }]), null);
});
