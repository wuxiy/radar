// The current industry's default model. Admin changes live in a private, atomically replaced file
// so API and worker processes see the same configuration without a restart; environment is fallback.
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config, credential } from "../config.ts";

export interface StoredModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  connectIp: string;
  extraJson: string;
  jsonMode: boolean;
  vision: boolean;
}

export function modelConfigFile(): string {
  return path.join(config.dataDir, "private", "model.json");
}

let cached: { file: string; stamp: string; value: StoredModelConfig } | undefined;

export function storedModelConfig(): StoredModelConfig | null {
  const file = modelConfigFile();
  let stat;
  try { stat = statSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("无法读取模型配置文件");
  }
  const stamp = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  if (cached?.file === file && cached.stamp === stamp) return cached.value;
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as StoredModelConfig;
    if (!value || typeof value.baseUrl !== "string" || typeof value.model !== "string" || typeof value.apiKey !== "string") throw new Error();
    cached = { file, stamp, value };
    return value;
  } catch { throw new Error("模型配置文件无效，请在后台重新保存"); }
}

export function defaultModelConfig(): StoredModelConfig {
  return storedModelConfig() ?? {
    baseUrl: credential("models", "LLM_BASE_URL") ?? "",
    model: process.env.LLM_MODEL ?? "",
    apiKey: credential("models", "LLM_API_KEY") ?? "",
    connectIp: credential("models", "LLM_CONNECT_IP") ?? "",
    extraJson: process.env.LLM_EXTRA_JSON ?? "",
    jsonMode: process.env.LLM_JSON_MODE !== "false",
    vision: process.env.LLM_VISION === "true",
  };
}

export function saveModelConfig(value: StoredModelConfig): void {
  const file = modelConfigFile();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(file), 0o700);
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(tmp, file);
  cached = undefined;
}
