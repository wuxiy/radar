import path from "node:path";

export const INDUSTRY_IDS = ["ai", "medical"] as const;
export type IndustryId = typeof INDUSTRY_IDS[number];

/** One immutable environment per child. Nothing is switched inside a running industry. */
export function industryEnvironments(env: NodeJS.ProcessEnv = process.env) {
  const base = new URL(env.SITE_URL || "http://localhost:3000");
  if (!/^https?:$/.test(base.protocol) || base.pathname !== "/" || base.search || base.hash) throw new Error("Radar SITE_URL must be the public origin without an industry path");
  const result = INDUSTRY_IDS.map((id, index) => {
    const scoped = { ...env };
    const prefix = `RADAR_${id.toUpperCase()}_`;
    for (const [key, value] of Object.entries(env)) if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = value;
    const databaseUrl = env[`${prefix}DATABASE_URL`];
    if (!databaseUrl) throw new Error(`${prefix}DATABASE_URL is required`);
    const db = new URL(databaseUrl);
    if (!/^postgres(?:ql)?:$/.test(db.protocol) || db.pathname === "/") throw new Error(`${prefix}DATABASE_URL must identify a PostgreSQL database`);
    const apiPort = Number(env[`${prefix}API_PORT`] || 3001 + index);
    const webPort = Number(env[`${prefix}WEB_PORT`] || 3100 + index);
    if (![apiPort, webPort].every(port => Number.isInteger(port) && port > 0 && port < 65536)) throw new Error(`Invalid internal port for ${id}`);
    const api = new URL(env.API_BASE_URL || "http://127.0.0.1:3001");
    api.port = String(apiPort);
    const child: NodeJS.ProcessEnv = {
      ...scoped,
      RADAR_INDUSTRY: id,
      SITE_URL: `${base.origin}/${id}`,
      DATABASE_URL: databaseUrl,
      DATABASE_POOL_MAX: scoped.DATABASE_POOL_MAX || "5",
      AIHOT_DATA_DIR: path.join(env.AIHOT_DATA_DIR || path.resolve(".data/radar"), id),
      AIHOT_CREDENTIALS_DIR: scoped.AIHOT_CREDENTIALS_DIR,
      API_PORT: String(apiPort), API_HOST: env.API_HOST || "127.0.0.1",
      WEB_PORT: String(webPort), WEB_HOST: "127.0.0.1",
      API_BASE_URL: api.origin,
      LOCAL_ROUTER_URL: `${(env.LOCAL_ROUTER_URL || base.origin).replace(/\/+$/, "")}/${id}`,
    };
    for (const key of ["COLLECT_ENABLED", "MODEL_CALLS_ENABLED", "FEISHU_CONTENT_PUSH_ENABLED", "FEISHU_INTERNAL_ENABLED", "INDEXNOW_SUBMIT_ENABLED"]) child[key] = scoped[key] || "false";
    return { id, condition: id === "ai" ? "radar-ai" : "medical", apiPort, webPort, databaseIdentity: `${db.hostname}:${db.port || 5432}${decodeURIComponent(db.pathname)}`, env: child };
  });
  if (result[0].databaseIdentity === result[1].databaseIdentity) throw new Error("Radar industries must use different logical databases");
  const ports = result.flatMap(industry => [industry.apiPort, industry.webPort]);
  if (new Set(ports).size !== ports.length) throw new Error("Radar industries must use different internal ports");
  return result;
}
