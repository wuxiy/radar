import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { modelConfiguration, updateModelConfiguration } from "@aihot/backend/admin/model-configuration";
import { defaultModelConfig, modelConfigFile, saveModelConfig } from "@aihot/backend/providers/model-config";
import { chatJson } from "@aihot/backend/providers/llm";
import { BudgetExceededError } from "@aihot/backend/providers/receipts";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const directory = mkdtempSync(path.join(tmpdir(), "radar-model-config-"));
const previous = { dataDir: config.dataDir, adminPassword: config.adminPassword, enabled: config.modelCallsEnabled, devAdmin: config.devAdmin };
config.dataDir = path.join(directory, "medical");
config.adminPassword = "test-model-admin-password";
config.devAdmin = null;
const seen: Array<{ model: string; thinking: unknown }> = [];
const provider = await stub((_hit, request) => {
  const body = JSON.parse(request.body);
  seen.push({ model: body.model, thinking: body.thinking });
  return { choices: [{ message: { content: '{"ok":true}' } }] };
});
const app = await buildApp();
let cookie = "";
let csrf = "";
const key = `private-test-key-${T}`;
const input = { baseUrl: `${provider.url}/v1`, model: "deepseek/deepseek-flash", apiKey: key, connectIp: "", extraJson: '{"thinking":{"type":"disabled"}}', jsonMode: true, vision: false, perMinute: 5, perHour: 5, perDay: 2, reason: "local model configuration test" };
after(async () => {
  await app.close();
  await provider.close();
  await closeDb();
  config.dataDir = previous.dataDir;
  config.adminPassword = previous.adminPassword;
  config.devAdmin = previous.devAdmin;
  config.modelCallsEnabled = previous.enabled;
  rmSync(directory, { recursive: true, force: true });
});

test("model configuration requires a session and CSRF; keys never leave the backend", async () => {
  const url = "/api/admin/models/configuration";
  assert.equal((await app.inject({ method: "PUT", url, payload: input })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/auth/password", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ password: config.adminPassword!, return: "/admin" }).toString() });
  assert.equal(login.statusCode, 303);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  csrf = (await app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie } })).json().csrf;
  assert.equal((await app.inject({ method: "PUT", url, headers: { cookie }, payload: input })).statusCode, 403);
  const saved = await app.inject({ method: "PUT", url, headers: { cookie, "x-csrf-token": csrf }, payload: input });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().keyConfigured, true);
  assert.equal(saved.body.includes(key), false);
  assert.equal("apiKey" in saved.json(), false);
  assert.equal(statSync(modelConfigFile()).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(modelConfigFile())).mode & 0o777, 0o700);
  const overview = await app.inject({ method: "GET", url: "/api/admin/models", headers: { cookie } });
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.body.includes(key), false);
  const audit = await sql`SELECT before, after, reason FROM audit_log WHERE action = 'models.configure'`;
  assert.equal(JSON.stringify(audit).includes(key), false);
});

test("saved model and parameters reach the provider through receipts and the 24-hour budget", async () => {
  const ask = (n: number) => chatJson({ model: "default", purpose: "invariant_test", subject: `config-${T}-${n}`, promptVersion: "t1", system: "test", user: `question ${n}`, schema: z.object({ ok: z.boolean() }) });
  assert.deepEqual((await ask(1)).data, { ok: true });
  assert.deepEqual((await ask(2)).data, { ok: true });
  await assert.rejects(ask(3), BudgetExceededError);
  assert.deepEqual(seen, [{ model: input.model, thinking: { type: "disabled" } }, { model: input.model, thinking: { type: "disabled" } }]);
  const [attempts] = await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE service = 'llm'`;
  assert.equal(attempts!.n, 2);
  assert.equal((await modelConfiguration()).budget?.used_day, 2);
  config.modelCallsEnabled = false;
  await assert.rejects(ask(4), /Model calls are disabled/);
  config.modelCallsEnabled = true;
  assert.equal(provider.hits(), 2);
});

test("blank key preserves it; workers see changes without restart and industry files remain separate", async () => {
  await updateModelConfiguration({ ...input, apiKey: "", model: "second-model", perDay: 100 }, "test");
  assert.equal(defaultModelConfig().apiKey, key);
  assert.equal(defaultModelConfig().model, "second-model");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { defaultModelConfig } from "@aihot/backend/providers/model-config"; const c=defaultModelConfig(); console.log(JSON.stringify({model:c.model,configured:!!c.apiKey}));'], { env: { ...process.env, AIHOT_DATA_DIR: config.dataDir }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { model: "second-model", configured: true });
  const medicalFile = modelConfigFile();
  config.dataDir = path.join(directory, "ai");
  assert.notEqual(modelConfigFile(), medicalFile);
  assert.notEqual(defaultModelConfig().apiKey, key);
  config.dataDir = path.join(directory, "medical");
  assert.equal(defaultModelConfig().model, "second-model");
});

test("invalid configuration leaves the saved file and quota intact and never echoes a key", async () => {
  const file = readFileSync(modelConfigFile(), "utf8");
  const variants = [{ baseUrl: "ftp://invalid/v1" }, { baseUrl: `https://user:${key}@example.com/v1` }, { connectIp: "bad-ip" }, { extraJson: "[]" }, { extraJson: '{"model":"other"}' }, { perDay: 1.5 }, { reason: key }];
  for (const patch of variants) {
    const result = await app.inject({ method: "PUT", url: "/api/admin/models/configuration", headers: { cookie, "x-csrf-token": csrf }, payload: { ...input, ...patch } });
    assert.equal(result.statusCode, 400, result.body);
    assert.equal(result.body.includes(key), false);
  }
  assert.equal(readFileSync(modelConfigFile(), "utf8"), file);
  assert.equal((await modelConfiguration()).budget?.per_day, 100);
  assert.equal(provider.hits(), 2);
});

test("live configuration changes cannot relabel an in-flight request or its receipt", async () => {
  let signalReceived!: () => void;
  let release!: () => void;
  const received = new Promise<void>(resolve => { signalReceived = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const previous = defaultModelConfig();
  const slow = await stub(async (_hit, req) => {
    assert.equal(JSON.parse(req.body).model, "in-flight-model");
    signalReceived();
    await released;
    return { choices: [{ message: { content: '{"ok":true}' } }] };
  });
  try {
    saveModelConfig({ ...previous, baseUrl: `${slow.url}/v1`, model: "in-flight-model" });
    const pending = chatJson({ model: "default", purpose: "invariant_test", subject: `live-config-${T}`, promptVersion: "t1", system: "test", user: "hold", schema: z.object({ ok: z.boolean() }) });
    await received;
    saveModelConfig({ ...previous, model: "next-live-model" });
    release();
    const result = await pending;
    assert.equal(result.model, "default");
    const [attempt] = await sql`SELECT model FROM receipt_attempts WHERE receipt_id = ${result.receiptId}`;
    assert.equal(attempt!.model, "in-flight-model");
    assert.equal(defaultModelConfig().model, "next-live-model");
    await chatJson({ model: "default", purpose: "invariant_test", subject: `next-config-${T}`, promptVersion: "t1", system: "test", user: "next", schema: z.object({ ok: z.boolean() }) });
    assert.equal(seen.at(-1)?.model, "next-live-model");
  } finally {
    release();
    await slow.close();
    saveModelConfig(previous);
  }
});
