import { isIP } from "node:net";
import { z } from "zod";
import type { AdminDefaultModel, BeforeJson } from "@aihot/contracts/admin";
import { config } from "../config.ts";
import { audit } from "../audit.ts";
import { defaultModelConfig, saveModelConfig, storedModelConfig } from "../providers/model-config.ts";
import { listBudgets, updateBudget } from "./settings.ts";

const inputSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2048),
  model: z.string().trim().min(1).max(200).regex(/^\S+$/),
  apiKey: z.string().trim().max(4096).optional(),
  connectIp: z.string().trim().max(64),
  extraJson: z.string().trim().max(4096),
  jsonMode: z.boolean(),
  vision: z.boolean(),
  perMinute: z.number().int().min(0).max(1_000_000),
  perHour: z.number().int().min(0).max(1_000_000),
  perDay: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(1).max(1000),
}).strict();

/** Never returns a key, including in the audit's before/after values. */
export async function modelConfiguration(): Promise<BeforeJson<AdminDefaultModel>> {
  const { apiKey, ...fields } = defaultModelConfig();
  const budgets = await listBudgets();
  return { ...fields, keyConfigured: !!apiKey, source: storedModelConfig() ? "admin" : "environment", callsEnabled: config.modelCallsEnabled, budget: budgets.find(b => b.service === "llm") ?? null };
}

export async function updateModelConfiguration(raw: unknown, actor: string): Promise<BeforeJson<AdminDefaultModel>> {
  const bad = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return bad("请检查模型配置字段、调用限额和修改原因");
  const input = parsed.data;
  let url: URL;
  try { url = new URL(input.baseUrl); } catch { return bad("API 地址需要完整的 HTTP 或 HTTPS 地址"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return bad("API 地址不能包含登录信息、查询参数或片段");
  if (input.connectIp && !isIP(input.connectIp)) return bad("连接 IP 需要有效的 IPv4 或 IPv6 地址");
  if (input.extraJson) {
    let extra;
    try { extra = JSON.parse(input.extraJson); } catch { return bad("额外参数需要有效的 JSON 对象"); }
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return bad("额外参数需要 JSON 对象");
    if (["model", "messages", "stream", "tools", "tool_choice", "max_tokens", "temperature", "response_format"].some(k => k in extra)) return bad("额外参数不能覆盖模型、消息或响应格式等任务参数");
  }
  const previous = defaultModelConfig();
  const apiKey = input.apiKey || previous.apiKey;
  if (!apiKey) return bad("首次配置需要填写 API 密钥");
  if ([apiKey, previous.apiKey].some(key => key && input.reason.includes(key))) return bad("修改原因中请勿填写 API 密钥");
  const before = await modelConfiguration();
  await updateBudget("llm", input, actor);
  saveModelConfig({ baseUrl: input.baseUrl.replace(/\/+$/, ""), model: input.model, apiKey, connectIp: input.connectIp, extraJson: input.extraJson, jsonMode: input.jsonMode, vision: input.vision });
  const after = await modelConfiguration();
  await audit(actor, "models.configure", "model:default", input.reason, before, after);
  return after;
}
