# Isolated sandbox checks

The first sandbox adapter is intentionally opt-in and local-first. It is not a hardened multi-tenant execution service.

## Prerequisites

- Docker Desktop installed and running.
- A local backend deployment that you control.
- Review of the proposed source changes before running them.

Set `SANDBOX_ENABLED=true` in `server/.env` and restart the backend. The setting is `false` in `.env.example`; do not enable this endpoint on a public, unauthenticated deployment.

## Endpoint

`POST /api/sandbox/run`

Example request:

```json
{
  "runtime": "node",
  "check": "test",
  "timeoutMs": 30000,
  "files": [
    {
      "path": "package.json",
      "content": "{\"scripts\":{\"test\":\"node --test\"}}"
    },
    {
      "path": "test/basic.test.js",
      "content": "const test = require('node:test'); const assert = require('node:assert/strict'); test('works', () => assert.equal(1 + 1, 2));"
    }
  ]
}
```

Supported Node checks: `test`, `lint`, `build`, `typecheck`. The matching `package.json` script is executed inside the container. Supported Python checks: `test` uses `python -m unittest`; `lint`, `build`, and `typecheck` currently use `python -m compileall -q .`.

## Current constraints

- Only supplied UTF-8 text files are included. The runner does not clone a repository, upload directories, install dependencies, or integrate with the proposal UI yet.
- Network access is disabled inside the container. Node checks that need third-party packages will fail until a safe offline dependency preparation flow is implemented.
- Each request is limited to 80 files, 200 KB per file, 800 KB total, 60 seconds, and 32,000 characters per output stream.
- The container uses a read-only root filesystem, no network, dropped capabilities, no-new-privileges, non-root UID, PID/memory/CPU/file-descriptor limits, and a writable temporary workspace that is deleted after execution.
- Container isolation depends on the Docker daemon and host configuration. For hostile code or multi-user production, use a stronger disposable VM/microVM boundary and add authentication, quotas, disk limits, cancellation, monitoring, and abuse controls.
- A successful result only proves the selected check exited successfully against the supplied workspace. It does not prove correctness or upstream CI success.
