import { gate, tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { createSource, deleteSource, fetchNow, listSources, previewStoredSource, sourceDetail, updateSource } from "@aihot/backend/admin/sources";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { collectSource, collectXShard, scheduleDueSources } from "@aihot/backend/sources/collect";
import { checkMpAccount } from "@aihot/backend/sources/mp";
import { ingestItems } from "@aihot/backend/ingest/items";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const app = await buildApp();
after(async () => { await app.close(); await stopBoss(); await closeDb(); });
const version = async (id: string) => new Date((await sourceDetail(id))!.source.updated_at).toISOString();
const remove = async (id: string, actor = "test-delete") => deleteSource(id, { version: await version(id), reason: "不再跟踪此来源" }, actor);
async function source(suffix: string, kind = "rss", cfg: Record<string, unknown> = { feedUrl: `https://example.com/${T}/${suffix}` }) {
  const id = `delete-${T}-${suffix}`;
  const result = await createSource({ id, name: `删除验证 ${suffix}`, kind, config: cfg }, "test-create");
  assert.ok(result.created);
  return id;
}

test("deleting a source removes it from management and preserves published history and attribution", async () => {
  const id = await source("history");
  const article = (await upsertMaterial({ sourceId: id, url: `https://example.com/${T}/history`, title: "应当保留的历史文章", bodyText: "历史正文", bodyStatus: "ok", via: "fetch" })).articleId;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, summary_zh, selected) VALUES (${article}, 1, 'rule', 'pass', '已发布的历史摘要', false)`;
  await publishArticle(article);
  assert.equal((await app.inject(`/api/site/items/${article}`)).statusCode, 200);
  assert.deepEqual(await remove(id), { id, retainedArticles: 1 });
  assert.equal(await sourceDetail(id), null);
  assert.equal((await listSources({ q: id })).rows.length, 0);
  const [row] = await sql`SELECT enabled, health, next_fetch_at, deleted_at FROM sources WHERE id = ${id}`;
  assert.deepEqual([row!.enabled, row!.health, row!.next_fetch_at], [false, "paused", null]);
  assert.ok(row!.deleted_at);
  assert.equal((await app.inject(`/api/site/items/${article}`)).statusCode, 200);
  const [audit] = await sql`SELECT reason, after FROM audit_log WHERE subject = ${`source:${id}`} AND action = 'source.delete'`;
  assert.equal(audit!.reason, "不再跟踪此来源");
  assert.equal((audit!.after as { retainedArticles: number }).retainedArticles, 1);
  assert.equal(await updateSource(id, { patch: { enabled: true }, version: new Date().toISOString() }, "test"), null);
  assert.equal(await fetchNow(id, "test"), null);
  assert.equal(await previewStoredSource(id), null);
  await assert.rejects(upsertMaterial({ sourceId: id, url: `https://example.com/${T}/late`, title: "迟到的响应", via: "fetch" }), /deleted/);
  await assert.rejects(upsertMaterial({ sourceId: id, url: `https://example.com/${T}/history`, title: "迟到的修订", via: "fetch" }), /deleted/);
  assert.equal((await sql`SELECT revision FROM articles WHERE id = ${article}`)[0]!.revision, 1);
});

test("stale versions, blank reasons and audit failures leave the source intact", async () => {
  const id = await source("conflict");
  const stale = await version(id);
  await updateSource(id, { patch: { name: "后来修改的名称" }, version: stale }, "test-edit");
  await assert.rejects(deleteSource(id, { version: stale, reason: "过期页面" }, "test-delete"), { code: "conflict" });
  await assert.rejects(deleteSource(id, { version: await version(id), reason: "  " }, "test-delete"));
  await sql.unsafe(`CREATE FUNCTION refuse_deletion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor = 'test-refuse-delete' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER refuse_deletion_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION refuse_deletion_audit()");
  try { await assert.rejects(remove(id, "test-refuse-delete"), /audit unavailable/); }
  finally { await sql.unsafe("DROP TRIGGER refuse_deletion_audit ON audit_log; DROP FUNCTION refuse_deletion_audit()"); }
  assert.ok((await sourceDetail(id))!.source.enabled);
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject = ${`source:${id}`} AND action = 'source.delete'`).length, 0);
});

test("deleted sources cannot be resurrected by seed replay, external push or forced collection", async () => {
  const seed = JSON.parse(readFileSync("industry/sources.json", "utf8")).sources[0];
  const seeded = await createSource({ id: seed.id, name: seed.name, kind: seed.kind, config: seed.config }, "test-seed");
  assert.ok(seeded.created);
  await remove(seed.id);
  execFileSync(process.execPath, ["scripts/seed.ts"], { stdio: "ignore" });
  assert.equal(await sourceDetail(seed.id), null);
  const ids = [await source("external", "external", {}), await source("mp", "mp_account", { ghid: "gh_deleted_account" }), await source("x", "x_search", { query: `from:del${T.slice(-10)}` })];
  for (const id of ids) await remove(id);
  await assert.rejects(ingestItems({ sourceId: ids[0], items: [{ title: "不能复活", url: `https://example.com/${T}/push` }] }), { status: 409 });
  assert.equal((await checkMpAccount(ids[1]!, "manual")).status, "missing");
  for (const id of ids) assert.equal((await collectSource(id, { force: true })).status, "skipped");
  assert.equal((await collectXShard("deleted", [ids[2]!])).status, "skipped");
  await scheduleDueSources();
  for (const id of ids) {
    assert.equal((await sql`SELECT 1 FROM pgboss.job WHERE data->>'sourceId' = ${id}`).length, 0);
    assert.equal((await sql`SELECT next_fetch_at FROM sources WHERE id = ${id}`)[0]!.next_fetch_at, null);
  }
  assert.equal((await sql`SELECT count(*)::int AS n FROM receipts`)[0]!.n, 0);
  await assert.rejects(createSource({ id: seed.id, name: seed.name, kind: seed.kind, config: seed.config }, "test"), { code: "conflict" });
  assert.ok((await createSource({ id: `replacement-${T}`, name: "使用新 ID 重新添加", kind: seed.kind, config: seed.config }, "test")).created);
});

test("a feed response already in flight cannot store materials or revive scheduling after deletion", async () => {
  const entered = gate(), release = gate();
  let hits = 0;
  const server = http.createServer(async (_req, res) => {
    hits++; entered.open(); await release.promise;
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.end(`<rss version="2.0"><channel><title>Local</title><item><title>迟到的条目</title><link>https://example.com/${T}/inflight</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const old = config.allowPrivateNetworkFetch;
  config.allowPrivateNetworkFetch = true;
  try {
    const id = await source("inflight", "rss", { feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/feed` });
    const pending = collectSource(id, { force: true });
    await entered.promise;
    await remove(id);
    release.open();
    assert.equal((await pending).status, "failed");
    assert.equal((await collectSource(id, { force: true })).status, "skipped");
    assert.equal(hits, 1);
    assert.equal((await sql`SELECT 1 FROM articles WHERE source_id = ${id}`).length, 0);
    const [row] = await sql`SELECT health, next_fetch_at FROM sources WHERE id = ${id}`;
    assert.deepEqual([row!.health, row!.next_fetch_at], ["paused", null]);
  } finally { release.open(); config.allowPrivateNetworkFetch = old; await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("DELETE requires administrator login and CSRF, validates its body and returns 404 after removal", async () => {
  const id = await source("auth");
  const payload = { version: await version(id), reason: "管理员明确删除" };
  config.adminPassword = "test-only-source-password";
  const url = `/api/admin/sources/${id}`;
  assert.equal((await app.inject({ method: "DELETE", url, payload })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/auth/password", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ password: config.adminPassword }).toString() });
  assert.equal(login.statusCode, 303);
  const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  const me = await app.inject({ url: "/api/admin/me", headers: { cookie } });
  const headers = { cookie, "x-csrf-token": me.json().csrf };
  assert.equal((await app.inject({ method: "DELETE", url, headers: { cookie }, payload })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url, headers, payload: { reason: "missing version" } })).statusCode, 400);
  const result = await app.inject({ method: "DELETE", url, headers, payload });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), { id, retainedArticles: 0 });
  for (const method of ["GET", "DELETE", "PATCH"] as const) assert.equal((await app.inject({ method, url, headers, ...(method === "GET" ? {} : { payload: method === "DELETE" ? payload : { patch: { enabled: true }, version: payload.version } }) })).statusCode, 404);
});
