import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/index.js";

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP port"));
        return;
      }
      baseUrl = "http://127.0.0.1:" + address.port;
      resolve();
    });
    server.once("error", reject);
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("GET / returns the service banner", async () => {
  const response = await fetch(baseUrl + "/");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: "AI Open Source Engineer server is running",
  });
});

test("GET /api/health returns an OK health status", async () => {
  const response = await fetch(baseUrl + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
