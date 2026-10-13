import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGeneratedProposal } from "../src/security/proposalQuality.js";

const valid = {
  summary: "Handle empty parser input safely.",
  assumptions: ["The public API should remain unchanged."],
  changes: [{
    file: "src/parser.ts",
    purpose: "Handle empty input.",
    before: "export function parse(input: string) { return input.split(','); }",
    after: "export function parse(input: string) { return input ? input.split(',') : []; }",
    explanation: "Avoids splitting an empty input into an unintended value.",
  }],
  tests: [{ file: "tests/parser.test.ts", description: "Empty input returns an empty list.", code: "assert.deepEqual(parse(''), []);" }],
  verificationSteps: ["Run the parser tests."],
  warnings: [],
};

test("accepts a well-formed bounded proposal without bypassing safety review", () => {
  const result = validateGeneratedProposal(valid);
  assert.equal(result.validStructure, true);
  assert.equal(result.readyForHumanReview, true);
  assert.equal(result.safeToCommit, true);
  assert.equal(result.fileCount, 1);
});

test("rejects non-object proposals and missing or oversized required fields", () => {
  assert.equal(validateGeneratedProposal(null).validStructure, false);
  assert.equal(validateGeneratedProposal([]).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, summary: " " }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, changes: [] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, changes: [{ ...valid.changes[0], after: "x".repeat(200_001) }] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, summary: "x".repeat(4_001) }).validStructure, false);
});

test("rejects malformed change metadata and duplicate or unsafe paths", () => {
  assert.equal(validateGeneratedProposal({ ...valid, changes: [{ ...valid.changes[0], purpose: 3 }] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, changes: [{ ...valid.changes[0], file: "../outside.ts" }] }).safeToCommit, false);
  assert.equal(validateGeneratedProposal({ ...valid, changes: [valid.changes[0], valid.changes[0]] }).safeToCommit, false);
});

test("rejects malformed optional lists and test entries", () => {
  assert.equal(validateGeneratedProposal({ ...valid, assumptions: ["ok", 4] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, verificationSteps: "run tests" }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, tests: [{ file: "tests/a.test.ts", description: "test", code: "" }] }).validStructure, false);
  assert.equal(validateGeneratedProposal({ ...valid, tests: Array(31).fill(valid.tests[0]) }).validStructure, false);
});

test("rejects proposals that exceed the aggregate size limit", () => {
  const large = {
    ...valid,
    changes: [
      { ...valid.changes[0], after: "x".repeat(180_000) },
      { ...valid.changes[0], file: "src/second.ts", after: "y".repeat(180_000) },
      { ...valid.changes[0], file: "src/third.ts", after: "z".repeat(180_000) },
    ],
  };
  assert.equal(validateGeneratedProposal(large).validStructure, false);
});

test("keeps safety findings distinct from structural validity", () => {
  const result = validateGeneratedProposal({ ...valid, changes: [{ ...valid.changes[0], after: "const token = 'ghp_123456789012345678901234567890123456';" }] });
  assert.equal(result.validStructure, true);
  assert.equal(result.readyForHumanReview, false);
  assert.equal(result.safeToCommit, false);
});
