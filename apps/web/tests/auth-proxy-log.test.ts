// An unavailable API must not copy OIDC callback credentials into the web proxy's error log.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

test("failed authentication proxy logs only the callback path", async () => {
  const unavailable = createServer(); unavailable.listen(0, "127.0.0.1"); await once(unavailable, "listening");
  const port = (unavailable.address() as { port: number }).port;
  await new Promise<void>(resolve => unavailable.close(() => resolve()));
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  const { proxyToApi } = await import("../app/lib/api-proxy.server.ts");
  const logs: string[] = [], previous = console.error;
  console.error = (...args) => { logs.push(args.map(String).join(" ")); };
  const web = createServer((req, res) => proxyToApi(req, res));
  web.listen(0, "127.0.0.1"); await once(web, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${(web.address() as { port: number }).port}/api/auth/oidc/callback?code=PRIVATE_CODE_SENTINEL&state=PRIVATE_STATE_SENTINEL`);
    assert.equal(response.status, 502);
    assert.ok(logs.join("\n").includes("/api/auth/oidc/callback"));
    assert.ok(!logs.join("\n").includes("PRIVATE_CODE_SENTINEL") && !logs.join("\n").includes("PRIVATE_STATE_SENTINEL"));
  } finally { console.error = previous; web.closeAllConnections(); await new Promise<void>(resolve => web.close(() => resolve())); }
});
