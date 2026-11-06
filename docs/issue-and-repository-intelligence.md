# Issue discovery and repository intelligence

## Issue discovery API

GET /api/github/issues searches GitHub issues, not pull requests. The default search is open issues carrying either the "good first issue" or "good-first-issue" label (the labels are combined with GitHub's OR operator).

Supported query parameters:

| Parameter | Default | Bounds / behavior |
|---|---:|---|
| q | empty | Optional GitHub issue-search text, up to 300 printable characters |
| repo | empty | Optional exact owner/repository filter |
| labels | beginner labels | Comma-separated list of up to five labels; alternatives are ORed |
| sort | updated | updated, created, or comments |
| order | desc | asc or desc |
| page | 1 | 1–100 |
| per_page | 30 | 1–50 |
| stale_days | 180 | 1–3650; older issues are excluded |

A signed-in session's GitHub token is used when available to improve the GitHub API rate limit. Public discovery can still run without a session. GitHub rate limiting is returned as HTTP 429 with a structured error and Retry-After when supplied by GitHub.

The response includes the normalized eligible issue list, GitHub's total count/incomplete-results signal, the effective filters, and exclusion counts. Issues are excluded when GitHub identifies them as pull requests, their response data is malformed, they are closed or locked, they carry a duplicate label, they have assignees or a recognized claimed/in-progress label, or they have not been updated within the selected freshness window.

These are evidence-based heuristics, not a guarantee that an issue is unclaimed or has no linked pull request. Assignment and labels can be stale or project-specific; the user should open the canonical issue and inspect its discussion before choosing it. Linked pull requests are not exhaustively detected from issue search results alone. The service does not claim that a maintainer has reserved an issue unless GitHub data explicitly signals assignment/claim labels.

## Repository analysis

Repository analysis fetches the repository's default branch and recursive Git tree, ranks bounded candidate files against the issue, and fetches each selected file from that exact branch. Root and nested README, CONTRIBUTING, AGENTS.md, SECURITY, and architecture guidance are prioritized alongside dependency manifests, implementation files, and tests. Generated/vendor/build directories, lockfiles, binary files, secret-like paths, and oversized files are excluded.

The source snapshot is bounded by file-count, per-file, and aggregate byte limits. A truncated Git tree or byte budget is surfaced in the analysis context. Any selected-file fetch failure, malformed base64 payload, empty selection, or snapshot without implementation source aborts analysis; the AI is not asked to infer a root cause from issue metadata alone.

The model's relevant-file list is validated against the exact fetched file paths. The model is instructed to separate facts from assumptions and identify missing context. This is still a bounded source sample, not a complete clone or full semantic index of a large repository. Human review remains mandatory.
