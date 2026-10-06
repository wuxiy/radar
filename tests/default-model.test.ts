// The engine's own model: one OpenAI-compatible model (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) runs every
// step of the analysis when nothing picks another one for a step.
import { stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { z } from "zod";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { CAPABILITIES, type Capability } from "@aihot/backend/editorial/models";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { config } from "@aihot/backend/config";
import { chatJson } from "@aihot/backend/providers/llm";
import { BudgetExceededError } from "@aihot/backend/providers/receipts";

// Nothing chosen per step: every capability falls back to the `default` model (a step the site
// gives a model of its own is sent back to it by its environment variable).
for (const c of Object.values(CAPABILITIES) as Capability[]) {
  if (c.default === "default") delete process.env[c.env];
  else process.env[c.env] = "default";
}

const T = tag();
const SOURCE = `test-default-model-${T}`;
const seen: Array<{ model: string; step: AnalysisStep }> = [];
const provider = await stub((_hit, req) => {
  const step = analysisStep(req.body);
  seen.push({ model: (JSON.parse(req.body) as { model: string }).model, step });
  const content =
    step === "prefilter" ? { label: "PASS", reason: "测试" }
    : step === "score" ? { attentionScore: SELECTING_SCORE }
    : step === "understand" ? { itemType: "product_launch", authorRole: "principal", tags: ["产品更新"], editorialJudgment: "理由", titleZh: "一个模型的标题", summaryZh: "一个模型写的摘要。第二句。" }
    : step === "structure" ? { category: "ai-products", tags: ["产品更新"], subjects: [], fact: null }
    : "title_zh: 标题\nsummary_zh: 摘要。";
  return { id: `stub-${seen.length}`, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { LLM_BASE_URL: `${provider.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", MODEL_CALLS_ENABLED: "true" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Test default model', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("one model runs the prefilter, both scores, the writing and the structure", async () => {
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `A product launch ${T}`, bodyText: `A company launched a product with pricing and availability. ${T} `.repeat(6),
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  } as never);
  const res = await analyzeArticle(articleId);
  assert.equal(res!.output!.selected, true);
  assert.equal(res!.output!.titleZh, "一个模型的标题");
  assert.deepEqual(seen.map((r) => r.step).sort(), ["prefilter", "score", "score", "structure", "understand"]);
  assert.ok(seen.every((r) => r.model === "one-model"), "every request names the configured model");
  const services = await sql<{ service: string }[]>`SELECT DISTINCT service FROM receipts WHERE subject LIKE ${`article:${articleId}%`}`;
  assert.deepEqual(services.map((s) => s.service), ["llm"]);
});

test("a pinned model destination keeps the URL Host, receipts and budget gate", async () => {
  let hits = 0;
  let host = "";
  const server = http.createServer((req, res) => {
    hits += 1;
    host = req.headers.host ?? "";
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const before = { base: process.env.LLM_BASE_URL, ip: process.env.LLM_CONNECT_IP, enabled: config.modelCallsEnabled };
  const [budget] = await sql`SELECT per_minute, per_hour, per_day FROM budgets WHERE service = 'llm'`;
  const subject = `pinned-model-${T}`;
  const ask = (suffix: string) => chatJson({ model: "default", purpose: "invariant_test", subject: `${subject}:${suffix}`, promptVersion: "t1", system: "s", user: suffix, schema: z.object({ ok: z.boolean() }) });
  try {
    process.env.LLM_BASE_URL = `http://localhost:${port}/v1`;
    process.env.LLM_CONNECT_IP = "127.0.0.1";
    assert.deepEqual((await ask("ok")).data, { ok: true });
    assert.equal(host, `localhost:${port}`);
    const [attempts] = await sql`SELECT count(*)::int AS n FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id WHERE r.subject LIKE ${`${subject}:%`}`;
    assert.equal(attempts!.n, 1);
    await sql`UPDATE budgets SET per_minute = 0 WHERE service = 'llm'`;
    await assert.rejects(ask("stopped"), BudgetExceededError);
    process.env.LLM_CONNECT_IP = "not-an-ip";
    await assert.rejects(ask("invalid"), /LLM_CONNECT_IP must be/);
    config.modelCallsEnabled = false;
    await assert.rejects(ask("disabled"), /Model calls are disabled/);
    assert.equal(hits, 1, "blocked calls never reach the provider");
  } finally {
    config.modelCallsEnabled = before.enabled;
    if (before.base === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = before.base;
    if (before.ip === undefined) delete process.env.LLM_CONNECT_IP; else process.env.LLM_CONNECT_IP = before.ip;
    await sql`UPDATE budgets SET per_minute = ${budget!.per_minute}, per_hour = ${budget!.per_hour}, per_day = ${budget!.per_day} WHERE service = 'llm'`;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
