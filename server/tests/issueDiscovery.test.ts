import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIssueSearchQuery, normalizeDiscoveredIssues, parseIssueDiscoveryOptions } from "../src/security/issueDiscovery.js";

const now = Date.parse("2026-11-06T00:00:00.000Z");
const valid = {
  id: 1, number: 12, title: "Fix parser boundary",
  html_url: "https://github.com/example/project/issues/12",
  repository_url: "https://api.github.com/repos/example/project",
  user: { login: "contributor" }, created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z", state: "open", locked: false,
  comments: 3, labels: [{ name: "good first issue" }], assignees: [],
};

test("parses bounded filters and defaults to beginner-friendly issue labels", () => {
  const options = parseIssueDiscoveryOptions({ q: "parser", repo: "example/project", page: "2", per_page: "25" });
  assert.ok(options);
  assert.deepEqual(options.labels, ["good first issue", "good-first-issue"]);
  assert.equal(options.page, 2);
  assert.equal(options.perPage, 25);
  assert.match(buildIssueSearchQuery(options), /repo:example\/project/);
  const query = buildIssueSearchQuery(options);
  assert.match(query, /label:"good first issue"/);
  assert.match(query, / OR /);
  assert.match(query, /label:"good-first-issue"/);
});

test("rejects malformed repository, controls, unsupported sort, and unbounded pagination", () => {
  for (const input of [
    { repo: "../project" }, { q: "bad\nquery" }, { sort: "random" },
    { page: "0" }, { page: "101" }, { per_page: "51" },
    { labels: "one,two,three,four,five,six" }, { stale_days: "0" },
  ]) assert.equal(parseIssueDiscoveryOptions(input), null);
});

test("keeps only open, unlocked, non-duplicate, unclaimed, fresh issues", () => {
  const items = [
    valid,
    { ...valid, id: 2, number: 13, locked: true },
    { ...valid, id: 3, number: 14, labels: [{ name: "duplicate" }] },
    { ...valid, id: 4, number: 15, assignees: [{ login: "someone" }] },
    { ...valid, id: 5, number: 16, updated_at: "2025-01-01T00:00:00Z" },
    { ...valid, id: 6, number: 17, state: "closed" },
    { ...valid, id: 7, number: 18, pull_request: { url: "https://api.github.com/repos/example/project/pulls/18" } },
    { ...valid, id: 8, number: 19, labels: [{ name: "in progress" }] },
  ];
  const result = normalizeDiscoveredIssues(items, 180, now);
  assert.deepEqual(result.issues.map((issue) => issue.number), [12]);
  assert.deepEqual(result.excluded, { pullRequest: 1, malformed: 0, closed: 1, locked: 1, duplicate: 1, claimed: 2, stale: 1 });
  assert.equal(result.issues[0].eligible, true);
});

test("rejects malformed GitHub issue records instead of returning incomplete issue data", () => {
  const result = normalizeDiscoveredIssues([{ ...valid, html_url: "javascript:alert(1)" }, { ...valid, id: "1" }, null as unknown as typeof valid], 180, now);
  assert.equal(result.issues.length, 0);
  assert.equal(result.excluded.malformed, 3);
});
