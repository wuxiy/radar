// Exercise the production route compiler: shared views must receive their route's loader data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";
import type { AdminSource, AdminSourceDetail, AdminSources, BeforeJson } from "@aihot/contracts/admin";
import { startWebServer, visit, type WebServer } from "./web-server.ts";

const source: BeforeJson<AdminSource> = {
  id: "route-fixture", name: "路由数据验收信源", kind: "rss", config: { feedUrl: "https://example.test/feed.xml" },
  tags: [], first_party: false, owner_entity_id: null, tier: "T2", selection_class: null, uses: [], participation_mode: "editorial",
  signal_group_id: null, interval_minutes: 75, site_fulltext: false, syndicate_fulltext: false,
  enabled: true, health: "ok", fail_count: 0, last_fetch_at: null, last_ok_at: null,
  last_error: null, cursor: null, next_fetch_at: null,
  created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:00:00Z",
};
const sources: BeforeJson<AdminSources> = {
  page: 1, rows: [{ ...source, items_7d: 3, selected_30d: 1 }],
  totals: { total: 1, enabled: 1, failing: 0, degraded: 0 }, useLabels: {}, selectionClassLabels: { fixture: "本行业类别" },
};
const detail: BeforeJson<AdminSourceDetail> = {
  source, runs: [], items: [], stats: { total: 3, last7d: 3, selected: 1 }, history: [], republish: null, useLabels: { fixture: "测试模块用途" }, selectionClassLabels: { fixture: "本行业类别" },
};
const reads: Array<{ path: string; cookie: string | undefined }> = [];
let previewDraft: Record<string, unknown> | undefined;
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  reads.push({ path: url.pathname, cookie: req.headers.cookie });
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && url.pathname === "/api/admin/sources/preview") {
    let body = ""; req.setEncoding("utf8"); req.on("data", chunk => { body += chunk; });
    req.on("end", () => { previewDraft = JSON.parse(body); res.end(JSON.stringify({ count: 0, ms: 1, items: [] })); });
    return;
  }
  let value: unknown;
  switch (url.pathname) {
    case "/api/site/meta": value = { changelogVersion: "2026-10-08" }; break;
    case "/api/admin/me": value = { name: "验收管理员", csrf: "local-fixture", dev: false }; break;
    case "/api/admin/nav-counts": value = {}; break;
    case "/api/admin/sources": value = sources; break;
    case `/api/admin/sources/${source.id}`: value = detail; break;
    default: res.statusCode = 404; value = { code: "not_found" };
  }
  res.end(JSON.stringify(value));
});
let web: WebServer;
before(async () => { web = await startWebServer(api); });
after(async () => { await web.stop(); });

test("authenticated source list renders loader data through the built route", async () => {
  const response = await fetch(`${web.origin}/admin/sources`, { headers: { cookie: "admin_fixture=local" } });
  assert.equal(response.status, 200, web.logs());
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  const html = await response.text();
  assert.match(html, /路由数据验收信源/);
  assert.match(html, /新建信源/);
  assert.ok(reads.some(r => r.path === "/api/admin/sources" && r.cookie === "admin_fixture=local"));
  assert.equal(web.logs(), "");
});

test("authenticated source editor receives the detail loader data through the built route", async () => {
  const response = await fetch(`${web.origin}/admin/sources/${source.id}`, { headers: { cookie: "admin_fixture=local" } });
  assert.equal(response.status, 200, web.logs());
  const html = await response.text();
  assert.match(html, /编辑信源/);
  assert.match(html, /value="路由数据验收信源"/);
  assert.match(html, /value="75"/);
  assert.match(html, /删除信源/);
  assert.ok(reads.some(r => r.path === `/api/admin/sources/${source.id}` && r.cookie === "admin_fixture=local"));
  assert.equal(web.logs(), "");
});


test("new source receives the current industry's class labels", async () => {
  const response = await fetch(`${web.origin}/admin/sources/new`, { headers: { cookie: "admin_fixture=local" } });
  assert.equal(response.status, 200, web.logs());
  assert.match(await response.text(), /本行业类别/);
});


test("editing a module use sends the unsaved draft uses to preview", async () => {
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage();
    await visit(page, `${web.origin}/admin/sources/${source.id}`);
    await page.getByLabel("测试模块用途").check();
    await page.getByRole("button", { name: "预览当前配置" }).click();
    await page.getByText("没有抓到条目。检查地址、选择器或登录要求。", { exact: true }).waitFor();
    assert.deepEqual(previewDraft?.uses, ["fixture"]);
  } finally { await browser.close(); }
});
