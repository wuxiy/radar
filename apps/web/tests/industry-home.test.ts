// Run after both the default web build and `npm run radar:build`.
// A real gateway and both production routers read only local synthetic APIs.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { UNSAFE_decodeViaTurboStream } from "react-router";
import { createGateway } from "../../../deploy/radar/gateway.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

let ai: WebServer, medical: WebServer;
let gateway: ReturnType<typeof createGateway>;
let origin: string;
const canonicalOrigin = "https://radar.example.test";

function api(industry: string) {
  return createServer((req, res) => {
    const url = new URL(req.url!, "http://api.local");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/admin/me") {
      if (req.headers.cookie?.includes(`fixture_${industry}=active`)) return void res.end(JSON.stringify({ name: "Fixture", csrf: "fixture", dev: false }));
      res.statusCode = 401; return void res.end(JSON.stringify({ code: "unauthorized" }));
    }
    if (url.pathname === "/api/auth/options") return void res.end(JSON.stringify({ password: true, feishu: false, oidc: true, oidcUrl: `https://identity.invalid/${industry}/oidc` }));
    if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "2026-10-08" }));
    if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ entries: [] }));
    if (url.pathname === "/api/site/timeline") {
      return res.end(JSON.stringify({ industry, filters: { channel: "all", category: url.searchParams.get("category"), tag: null }, cards: [], nextCursor: null, dayCounts: [], hot: null }));
    }
    res.statusCode = 404; res.end(JSON.stringify({ code: "not_found" }));
  });
}

before(async () => {
  ai = await startWebServer(api("ai"), { NODE_OPTIONS: "--conditions=radar-ai", SITE_URL: `${canonicalOrigin}/ai` });
  medical = await startWebServer(api("medical"), { NODE_OPTIONS: "--conditions=medical", SITE_URL: `${canonicalOrigin}/medical` });
  gateway = createGateway({ ai: ai.port, medical: medical.port });
  gateway.listen(0, "127.0.0.1"); await once(gateway, "listening");
  origin = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
});
after(async () => {
  if (gateway) await new Promise<void>(resolve => gateway.close(() => resolve()));
  if (ai) await ai.stop();
  if (medical) await medical.stop();
});

test("each industry's index navigation returns its homepage data with the original query", async () => {
  for (const [industry, category] of [["ai", "ai-models"], ["medical", "medical-it"]]) {
    const html = await fetch(`${origin}/${industry}`);
    assert.equal(html.status, 200); assert.match(await html.text(), /精选/);
    for (const path of [`/${industry}.data`, `/${industry}/_.data`]) {
      const response = await fetch(`${origin}${path}?category=${category}&_routes=routes%2Fhome`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
      const { value } = await UNSAFE_decodeViaTurboStream(response.body!, globalThis);
      const result = value as Record<string, { data: { data: { industry: string }; filters: { category: string } } }>;
      assert.equal(result["routes/home"].data.data.industry, industry);
      assert.equal(result["routes/home"].data.filters.category, category);
    }
  }
  assert.equal(ai.logs(), ""); assert.equal(medical.logs(), "");
});

test("index-data routing keeps unknown industries and similar paths outside both routers", async () => {
  for (const path of ["/other.data", "/medical.database", "/medical.data/admin", "/ai.data/anything"]) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
});

test("signed-in industry login preserves unified management and scoped admin destinations", async () => {
  for (const industry of ["ai", "medical"]) {
    const other = industry === "ai" ? "medical" : "ai";
    const cookie = `fixture_${industry}=active`;
    const targets = [
      [`/manage/sources?industry=${industry}`, `/manage/sources?industry=${industry}`],
      [`/${industry}/admin/models`, `/${industry}/admin/models`],
      [`/manage/sources?industry=${other}`, `/${industry}/admin`],
      ["//outside.invalid/admin", `/${industry}/admin`],
      ["/administrator", `/${industry}/admin`],
    ];
    for (const [target, expected] of targets) {
      const response = await fetch(`${origin}/${industry}/admin/login?return=${encodeURIComponent(target)}`, { headers: { cookie }, redirect: "manual" });
      assert.equal(response.status, 302);
      const destination = new URL(response.headers.get("location")!, origin);
      assert.equal(destination.origin, expected.startsWith("/manage/") ? canonicalOrigin : origin, "the proxy request host cannot replace the configured HTTPS origin");
      assert.equal(destination.pathname + destination.search, expected);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      await response.text();
    }
    const anonymous = await fetch(`${origin}/${industry}/admin/login?return=${encodeURIComponent(`/manage/sources?industry=${industry}`)}`, { headers: { cookie: `fixture_${other}=active` }, redirect: "manual" });
    assert.equal(anonymous.status, 200, "another industry's session cannot skip sign-in");
    const html = await anonymous.text();
    assert.match(html, /统一身份登录/);
    assert.ok(html.includes(`/manage/sources?industry=${industry}`), "the sign-in form retains the intended management destination");
  }
});
