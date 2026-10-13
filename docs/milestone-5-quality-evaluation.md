# Milestone 5: repository context, proposal quality, and telemetry

## Implemented
- Issue-aware deterministic file ranking for source files, tests, and language/build manifests.
- Bounded selection and content budgets with visible truncation metadata.
- Filters for common generated/dependency paths, lockfiles, binary extensions, oversized files, and common secret-like paths.
- Proposal structure validation and deterministic safety checks before the proposal is presented as usable.
- Review verdicts are downgraded when deterministic checks find blocking or manual-review findings.
- Structured telemetry captures AI request status/latency, provider attempt status/latency, available input/output token counts, proposal-gate outcomes, and review verdicts without logging prompts, code, or credentials.
- Tests cover multiple language layouts, budgets, secret/path filters, prompt-injection text as untrusted input, malformed proposals, secrets, and risky configuration changes.

## Verification and limitations
- CI validates deterministic behavior and build/type safety; it does not prove a generated patch solves an upstream issue.
- Token counts are not dollar-cost estimates. Human acceptance and aggregate build/test pass rates are not yet persisted in a dashboard.
- Repository context is a bounded tree sample, not a full clone or semantic index.
- Live OAuth, provider credentials, and Docker isolation require a separate local end-to-end run.
