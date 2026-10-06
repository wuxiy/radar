// Runtime acceptance against a running dual-industry site and two disposable databases.
// node --env-file=<private-test.env> scripts/verify-radar.ts [--keep-fixtures]
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { industryEnvironments } from "../deploy/radar/config.ts";

const industries = industryEnvironments();
const run = promisify(execFile);
const base = process.env.SITE_URL!;
const keep = process.argv.includes("--keep-fixtures");
for (const industry of industries) if (!/_(test|ci)$/.test(new URL(industry.env.DATABASE_URL!).pathname)) throw new Error("Runtime acceptance writes fixtures: both databases must end in _test or _ci");
async function fixture(industry: typeof industries[number], action: string) {
  return run(process.execPath, [`--conditions=${industry.condition}`, "tests/radar-runtime-fixture.ts", action], { env: industry.env });
}
const request = (id: string, path: string, init: RequestInit = {}) => fetch(`${base}/${id}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...init });
const connections = industries.map(industry => postgres(industry.env.DATABASE_URL!, { max: 1 }));
const receipts = await Promise.all(connections.map(async db => Number((await db`SELECT count(*) n FROM receipts`)[0].n)));
try {
  const seeded = await Promise.all(industries.map(industry => fixture(industry, "seed")));
  const date = JSON.parse(seeded[0].stdout).date;
  for (const industry of industries) {
    const id = industry.id;
    const other = id === "ai" ? "medical" : "ai";
    for (const path of ["/api/v1/items?mode=all", "/api/v1/selected/snapshot", "/feed.xml", "/feed/all.xml", `/api/v1/dailies/${date}`]) {
      const response = await request(id, path);
      assert.equal(response.status, 200, `${id}${path}`);
      const text = await response.text();
      assert.ok(text.includes(id === "medical" ? "医疗高质量数据集" : "AI 模型发布") || text.includes(`REPORT-${id}`), `${id}${path} contains its own fixture`);
      assert.ok(!text.includes(`SUMMARY-${other}-`) && !text.includes(`REPORT-${other}`), `${id}${path} leaks the other industry`);
      assert.ok(!text.includes("radar_unreleased") && !text.includes("radar_withdrawn"), `${id}${path} releases hidden content`);
      assert.ok(!text.includes("PRIVATE-FIXTURE-BODY"), `${id}${path} exposes unlicensed full text`);
    }
    assert.equal((await request(id, `/api/site/items/radar_${other}_only`)).status, 404);
    // The existing detail contract is public before selection release; lists/feeds above remain gated.
    assert.equal((await request(id, "/api/site/items/radar_unreleased")).status, 200);
    const detail = await request(id, "/api/site/items/radar_same_id");
    assert.equal(detail.status, 200);
    assert.ok((await detail.text()).includes(`SUMMARY-${id}-`));
    const manifest = await (await request(id, "/manifest.webmanifest")).json() as { scope: string; icons: Array<{ src: string }> };
    assert.equal(manifest.scope, `/${id}/`);
    assert.ok(manifest.icons.every((icon: { src: string }) => icon.src.startsWith(`/${id}/`)));
    const category = id === "medical" ? "medical-it" : "ai-models";
    const otherCategory = id === "medical" ? "ai-models" : "medical-it";
    assert.equal((await request(id, `/api/v1/items?category=${category}`)).status, 200);
    assert.equal((await request(id, `/api/v1/items?category=${otherCategory}`)).status, 400);
    const rpc = await request(id, "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: `radar_${id}_get_latest`, arguments: { mode: "all", window: "24h", limit: 30 } } }) });
    assert.equal(rpc.status, 200);
    const mcp = await rpc.text();
    assert.ok(mcp.includes(`SUMMARY-${id}-`) && !mcp.includes(`SUMMARY-${other}-`), `${id} MCP scope`);
    assert.ok(mcp.includes(`/${id}/items/`), `${id} MCP links`);
    assert.equal((await request(id, "/api/admin/sources")).status, 401);
    const wrong = await request(id, "/api/auth/password", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: "invalid-acceptance-password" }) });
    assert.equal(wrong.status, 303);
    assert.ok(wrong.headers.get("location")?.startsWith(`/${id}/admin/login?`) && wrong.headers.get("location")?.includes("error=wrong"));
    assert.equal(wrong.headers.get("set-cookie"), null);
    const login = await request(id, "/api/auth/password", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: industry.env.ADMIN_PASSWORD!, return: `/${id}/admin/sources` }) });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get("location"), `/${id}/admin/sources`);
    const fullCookie = login.headers.get("set-cookie")!;
    assert.ok(fullCookie.includes(`Path=/${id}`));
    const cookie = fullCookie.split(";")[0];
    const landing = await request(id, "/admin", { headers: { cookie } });
    assert.equal(landing.headers.get("location"), `/${id}/admin/sources`, "router must add the industry prefix exactly once");
    assert.equal((await request(id, "/api/admin/sources", { headers: { cookie } })).status, 200);
    assert.equal((await request(other, "/api/admin/sources", { headers: { cookie } })).status, 401);
    assert.equal((await request(id, "/api/admin/sources", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" })).status, 403);
    const anonymous = await (await request(id, "/api/v1/items")).json();
    const authenticated = await (await request(id, "/api/v1/items", { headers: { cookie } })).json();
    assert.deepEqual(authenticated, anonymous);
    assert.equal((await request(id, "/api/auth/logout", { method: "POST", headers: { cookie } })).status, 303);
    assert.equal((await request(id, "/api/admin/sources", { headers: { cookie } })).status, 401);
    console.log(`PASS ${id}: API/RSS/report scope, hidden content, fulltext rights, categories, scoped admin session and CSRF`);
    const searchRedirect = await request(id, "/?q=acceptance");
    assert.equal(searchRedirect.headers.get("location"), `/${id}/all?q=acceptance`);
  }
  await fixture(industries[1], "withdraw");
  assert.equal((await request("medical", "/api/site/items/radar_same_id")).status, 404);
  assert.equal((await request("ai", "/api/site/items/radar_same_id")).status, 200);
  await fixture(industries[1], "restore");
  assert.equal((await fetch(`${base}/unknown/api/health`)).status, 404);
  assert.equal((await request("medical", "/leaderboard")).status, 404);
  assert.equal((await request("medical", "/codex-reset")).status, 404);
  const after = await Promise.all(connections.map(async db => Number((await db`SELECT count(*) n FROM receipts`)[0].n)));
  assert.deepEqual(after, receipts, "reader requests must never create paid receipts");
  console.log("PASS withdrawal isolation, disabled medical modules, unknown industry, reader paid-receipt invariance");
  const isolation = await Promise.all(industries.map(industry => fixture(industry, "isolation")));
  const operations = isolation.map(result => JSON.parse(result.stdout));
  for (const [index, db] of connections.entries()) {
    assert.equal(Number((await db`SELECT count(*) n FROM pgboss.job WHERE id = ${operations[1 - index].jobId}`)[0].n), 0, "a queue must not contain the other industry's job");
    assert.equal(Number((await db`SELECT count(*) n FROM receipts WHERE service = 'radar-acceptance-local-mock'`)[0].n), index === 0 ? 0 : 1);
  }
  console.log("PASS AI test budget stopped while medical mock succeeds; receipts and queue jobs stay in their own databases");
} finally {
  if (!keep) await Promise.all(industries.map(industry => fixture(industry, "cleanup")));
  await Promise.all(connections.map(db => db.end()));
}
