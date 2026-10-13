import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceProposalReviewGate, validateCodeReviewResult } from "../src/security/codeReview.js";

const valid = { overallStatus: "Approved" as const, summary: "The change is clear and addresses the issue.", bugs: [], securityIssues: [], codeQualityIssues: [], missingTests: [], suggestions: [], confidence: 88 };

test("accepts a complete review result with a bounded confidence score", () => {
  assert.deepEqual(validateCodeReviewResult(valid), valid);
});

test("rejects invalid verdicts, missing summaries, and invalid confidence", () => {
  for (const candidate of [{ ...valid, overallStatus: "Looks good" }, { ...valid, summary: " " }, { ...valid, confidence: 101 }, { ...valid, confidence: 88.5 }]) {
    assert.equal(validateCodeReviewResult(candidate), null);
  }
});

test("rejects missing, non-string, and oversized issue lists", () => {
  assert.equal(validateCodeReviewResult({ ...valid, bugs: "none" }), null);
  assert.equal(validateCodeReviewResult({ ...valid, suggestions: [42] }), null);
  assert.equal(validateCodeReviewResult({ ...valid, securityIssues: Array(101).fill("finding") }), null);
});

test("rejects malformed top-level values", () => {
  assert.equal(validateCodeReviewResult(null), null);
  assert.equal(validateCodeReviewResult("Approved"), null);
  assert.equal(validateCodeReviewResult([]), null);
});

test("overrides an Approved verdict when deterministic proposal validation fails", () => {
  const result = enforceProposalReviewGate(valid, {
    readyForHumanReview: false,
    safeToCommit: false,
    reasons: ["Change 1 is missing a bounded purpose."],
  });
  assert.equal(result.overallStatus, "Changes Requested");
  assert.match(result.summary, /approval is blocked/i);
  assert.ok(result.securityIssues.includes("Change 1 is missing a bounded purpose."));
});

test("does not override a review when the deterministic gate passes", () => {
  assert.deepEqual(enforceProposalReviewGate(valid, {
    readyForHumanReview: true,
    safeToCommit: true,
    reasons: [],
  }), valid);
});

test("blocks approval when the gate fails without explanatory findings", () => {
  const result = enforceProposalReviewGate(valid, {
    readyForHumanReview: false,
    safeToCommit: false,
    reasons: [],
  });
  assert.equal(result.overallStatus, "Changes Requested");
  assert.ok(result.securityIssues.some((item) => /did not pass deterministic validation/i.test(item)));
});
