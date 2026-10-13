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

## Local Docker smoke test (PowerShell)

Run this only on a machine you control, with Docker Desktop running and the backend bound to loopback. Set `SANDBOX_ENABLED=true` in `server/.env`, restart the backend, and then run:

```powershell
$runId = [guid]::NewGuid().ToString()
$body = @{
  runId = $runId
  runtime = "node"
  check = "test"
  timeoutMs = 30000
  files = @(
    @{ path = "package.json"; content = '{"scripts":{"test":"node --test"}}' },
    @{ path = "test/basic.test.js"; content = "const test = require('node:test'); const assert = require('node:assert/strict'); test('works', () => assert.equal(1 + 1, 2));" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/sandbox/run" -Method Post -ContentType "application/json" -Body $body
```

Expected result: `status = passed`, exit code `0`, and a summary saying the sandbox check completed successfully. If Docker is missing or stopped, the endpoint should report that isolated execution is unavailable. Turn `SANDBOX_ENABLED` back off when you finish. This smoke test uses Node's built-in test runner and does not download dependencies.

## Current constraints

- Only supplied UTF-8 text files are included. The runner does not clone a repository, upload directories, install dependencies, or integrate with the proposal UI yet.
- Network access is disabled inside the container. Node checks that need third-party packages will fail until a safe offline dependency preparation flow is implemented.
- Each request is limited to 80 files, 200 KB per file, 800 KB total, 60 seconds, and 32,000 characters per output stream.
- The host-side input snapshot is mounted read-only at `/input`; the container copies it into a size-limited 128 MiB tmpfs at `/workspace`. Generated files therefore cannot grow the host-mounted input snapshot. The container also uses a read-only root filesystem, no network, dropped capabilities, no-new-privileges, non-root UID, PID/memory/CPU/file-descriptor limits, a 64 MiB `/tmp`, and automatic temporary-workspace cleanup.
- Container isolation depends on the Docker daemon and host configuration. For hostile code or multi-user production, use a stronger disposable VM/microVM boundary and add authentication, quotas, cancellation, monitoring, and abuse controls. The workspace tmpfs limits per-run writable workspace size, but does not replace host-level Docker storage monitoring or a hardened VM boundary.
- A successful result only proves the selected check exited successfully against the supplied workspace. It does not prove correctness or upstream CI success.
