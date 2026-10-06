import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { industryEnvironments } from "../deploy/radar/config.ts";
import { createGateway } from "../deploy/radar/gateway.ts";

const env = { SITE_URL: "http://localhost:3000", RADAR_AI_DATABASE_URL: "postgres://user:unused@localhost/radar_ai_test", RADAR_MEDICAL_DATABASE_URL: "postgres://user:unused@localhost/radar_medical_test" };

test("Radar requires distinct explicit databases and distinct internal ports", () => {
  assert.throws(() => industryEnvironments({ ...env, RADAR_MEDICAL_DATABASE_URL: undefined }), /required/);
  assert.throws(() => industryEnvironments({ ...env, RADAR_MEDICAL_DATABASE_URL: env.RADAR_AI_DATABASE_URL }), /different logical databases/);
  assert.throws(() => industryEnvironments({ ...env, RADAR_AI_WEB_PORT: "3002" }), /different internal ports/);
  assert.throws(() => industryEnvironments({ ...env, SITE_URL: "http://localhost/ai" }), /public origin/);
});

test("Radar isolates files, flags, model overrides and canonical origins", () => {
  const input = { ...env, AIHOT_DATA_DIR: "/tmp/radar", RADAR_AI_MODEL_CALLS_ENABLED: "true", RADAR_AI_LLM_MODEL: "ai-model", RADAR_MEDICAL_LLM_MODEL: "medical-model" };
  const [ai, medical] = industryEnvironments(input);
  assert.equal(ai.env.MODEL_CALLS_ENABLED, "true");
  assert.equal(medical.env.MODEL_CALLS_ENABLED, "false");
  assert.equal(medical.env.COLLECT_ENABLED, "false");
  assert.equal(ai.env.LLM_MODEL, "ai-model");
  assert.equal(medical.env.LLM_MODEL, "medical-model");
  assert.equal(ai.env.AIHOT_DATA_DIR, "/tmp/radar/ai");
  assert.equal(medical.env.AIHOT_DATA_DIR, "/tmp/radar/medical");
  assert.equal(ai.env.SITE_URL, "http://localhost:3000/ai");
  assert.equal(medical.env.SITE_URL, "http://localhost:3000/medical");
  assert.equal(input.RADAR_AI_MODEL_CALLS_ENABLED, "true", "input stays immutable");
});

test("independent process conditions resolve the complete AI and medical packs", async () => {
  const probe = `import {PROFILE} from '@aihot/industry/profile';import {SITE} from '@aihot/site';import {CATEGORIES} from '@aihot/industry/taxonomy';import {MODULES} from '@aihot/site/modules';import {SELECTION} from '@aihot/industry/selection';import {industryPath} from '@aihot/industry/paths';import {promptText} from '@aihot/backend/editorial/prompts';import fs from 'node:fs';console.log(JSON.stringify({id:PROFILE.id,name:SITE.name,categories:CATEGORIES.map(c=>c.key),modules:MODULES,selection:SELECTION,path:industryPath('/api/site/timeline'),sources:JSON.parse(fs.readFileSync(PROFILE.directory+'/sources.json')).sources,prompt:promptText('content-understanding')}));`;
  const run = promisify(execFile);
  const packs = await Promise.all(["radar-ai", "medical"].map(async condition => JSON.parse((await run(process.execPath, [`--conditions=${condition}`, "--input-type=module", "-e", probe], { env: { ...process.env, MODEL_CALLS_ENABLED: "false" } })).stdout)));
  const [ai, medical] = packs;
  assert.equal(ai.id, "ai"); assert.equal(medical.id, "medical");
  assert.equal(ai.name, "Radar"); assert.equal(medical.name, "Radar");
  assert.ok(ai.categories.includes("ai-models"));
  assert.deepEqual(medical.categories, ["medical-it", "medical-data", "medical-datasets", "medical-ai", "policy-standards", "industry"]);
  assert.deepEqual(medical.selection, ai.selection, "unlabelled samples must not change thresholds");
  assert.deepEqual(medical.modules, [], "upstream 4.0 optional modules are not installed");
  assert.equal(medical.path, "/medical/api/site/timeline");
  assert.equal(medical.sources.length, 4);
  assert.ok(medical.sources.every((s: { enabled: boolean; site_fulltext: boolean; syndicate_fulltext: boolean }) => !s.enabled && !s.site_fulltext && !s.syndicate_fulltext));
  assert.match(medical.prompt, /高质量数据集/);
  assert.doesNotMatch(medical.prompt, /- 主题：Agent|第一个必须.*模型发布、产品更新/);
});

test("gateway preserves industry paths and never falls back to the other industry", async () => {
  const mock = createServer((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ url: req.url, client: req.headers["x-forwarded-for"] })); });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening");
  const port = (mock.address() as { port: number }).port;
  // Reserve then close a port to represent one failed industry.
  const unavailable = createServer(); unavailable.listen(0, "127.0.0.1"); await once(unavailable, "listening");
  const unavailablePort = (unavailable.address() as { port: number }).port;
  await new Promise<void>(resolve => unavailable.close(() => resolve()));
  const gateway = createGateway({ ai: port, medical: unavailablePort });
  gateway.listen(0, "127.0.0.1"); await once(gateway, "listening");
  const origin = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  try {
    const root = await fetch(`${origin}/?category=medical-data`, { redirect: "manual" });
    assert.equal(root.status, 308); assert.equal(root.headers.get("location"), "/medical?category=medical-data");
    const legacy = await fetch(`${origin}/changelog?q=1`, { redirect: "manual" });
    assert.equal(legacy.headers.get("location"), "/ai/changelog?q=1");
    assert.equal((await fetch(`${origin}/unknown/api/health`)).status, 404);
    const robots = await (await fetch(`${origin}/robots.txt`)).text();
    assert.ok(robots.includes("Disallow: /ai/admin") && robots.includes("Disallow: /medical/admin"));
    assert.equal((await fetch(`${origin}/medical/api/health`)).status, 503);
    const healthy = await fetch(`${origin}/ai/api/site/timeline?category=ai-models`, { headers: { "x-forwarded-for": "192.0.2.1" } });
    assert.equal(healthy.status, 200);
    const body = await healthy.json() as { url: string; client: string };
    assert.equal(body.url, "/ai/api/site/timeline?category=ai-models");
    assert.equal(body.client, "127.0.0.1", "untrusted client cannot spoof forwarding headers");
  } finally { await Promise.all([new Promise<void>(resolve => gateway.close(() => resolve())), new Promise<void>(resolve => mock.close(() => resolve()))]); }
});
