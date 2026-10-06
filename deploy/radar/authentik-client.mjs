// Run on the NAS after source validation. Creates only Radar's client and Owner binding.
// Work-OS management credentials stay in their existing private runtime directory.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { industryEnvironments } from "./config.ts";

process.umask(0o077);
const root = path.resolve(import.meta.dirname, "../..");
const runtime = process.env.WORKOS_RUNTIME_DIR || "/home/dev/work-os/deploy/runtime";
const clientFile = path.join(runtime, "clients.json");
const config = JSON.parse(readFileSync(clientFile, "utf8"));
const originalClients = JSON.stringify(Object.fromEntries(Object.entries(config.clients).filter(([id]) => id !== "radar")));
const token = readFileSync(path.join(runtime, "bootstrap-token"), "utf8").trim();
const launch = "https://radar.cywu.heiyu.space";
const callbacks = ["ai", "medical"].map(id => `${launch}/${id}/api/auth/oidc/callback`);
const envFile = path.join(root, ".env");
const env = parseEnv(readFileSync(envFile, "utf8"));
const industries = industryEnvironments({ ...env, SITE_URL: launch });
const credentialDirs = industries.map(industry => industry.env.AIHOT_CREDENTIALS_DIR);
if (credentialDirs.some(directory => !directory || !path.isAbsolute(directory)) || new Set(credentialDirs).size !== industries.length)
  throw new Error("Distinct industry credential directories required");
const localUsers = {};
// Confirm existing administrators before creating an IdP client; never silently create a local admin.
for (const industry of industries) {
  const db = postgres(industry.env.DATABASE_URL, { max: 1, onnotice() {} });
  try {
    const users = await db`SELECT id FROM admin_users WHERE email='admin@local'`;
    if (users.length !== 1) throw new Error("Existing Radar administrator must be confirmed");
    localUsers[industry.id] = users[0].id;
  } finally { await db.end(); }
}
async function api(endpoint, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:13700/api/v3/${endpoint}`, { method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Identity configuration failed (${response.status}); details suppressed`);
  return response.status === 204 ? null : response.json();
}
function atomic(file, body) { const temp = `${file}.new`; writeFileSync(temp, body, { mode: 0o600 }); chmodSync(temp, 0o600); renameSync(temp, file); }
const save = () => atomic(clientFile, JSON.stringify(config, null, 2) + "\n");
const owner = await api(`core/users/${config.ownerPK}/`);
if (owner.username !== "cywu" || !owner.is_active || owner.uuid !== config.ownerSubject) throw new Error("Existing Work-OS Owner mismatch");
const providers = (await api("providers/oauth2/")).results;
const home = providers.find(p => p.client_id === config.clients.homepage.clientID);
if (!home?.signing_key) throw new Error("Existing signing key missing");
const flows = (await api("flows/instances/")).results;
const flow = slug => flows.find(f => f.slug === slug)?.pk || (() => { throw new Error("Identity flow missing"); })();
const scopes = (await api("propertymappings/provider/scope/")).results.filter(s => s.scope_name === "openid").map(s => s.pk);
let radar = config.clients.radar;
if (!radar) {
  if (providers.some(p => p.client_id === "workos-radar")) throw new Error("Untracked Radar provider; recover its private configuration first");
  radar = config.clients.radar = { clientID: "workos-radar", clientSecret: randomBytes(32).toString("hex"),
    issuer: "https://auth.cywu.heiyu.space/application/o/radar/", redirectURLs: callbacks };
  save();
}
if (radar.clientID !== "workos-radar" || JSON.stringify(radar.redirectURLs) !== JSON.stringify(callbacks)) throw new Error("Tracked Radar callbacks mismatch");
if (!radar.providerPK) {
  const provider = await api("providers/oauth2/", "POST", {
    name: "Radar", client_id: radar.clientID, client_secret: radar.clientSecret, client_type: "confidential", grant_types: ["authorization_code"],
    sub_mode: "user_uuid", issuer_mode: "per_provider", authentication_flow: flow("default-authentication-flow"),
    authorization_flow: flow("default-provider-authorization-implicit-consent"), invalidation_flow: flow("default-provider-invalidation-flow"),
    signing_key: home.signing_key, property_mappings: scopes, include_claims_in_id_token: true,
    access_code_validity: "minutes=1", access_token_validity: "minutes=5", redirect_uris: callbacks.map(url => ({ matching_mode: "strict", url })),
  });
  radar.providerPK = provider.pk; save();
}
if (!radar.applicationPK) {
  const application = await api("core/applications/", "POST", { name: "Radar", slug: "radar", provider: radar.providerPK, meta_launch_url: launch, policy_engine_mode: "all" });
  radar.applicationPK = application.pk; save();
}
const bindings = (await api(`policies/bindings/?target=${radar.applicationPK}`)).results;
if (bindings.some(b => b.user !== config.ownerPK || !b.enabled || b.failure_result || b.group || b.policy)) throw new Error("Unexpected Radar access binding");
if (!bindings.length) await api("policies/bindings/", "POST", { target: radar.applicationPK, user: config.ownerPK, order: 0, enabled: true, failure_result: false });
if ((await api(`policies/bindings/?target=${radar.applicationPK}`)).results.length !== 1) throw new Error("Radar must have one Owner binding");
const provider = await api(`providers/oauth2/${radar.providerPK}/`);
const application = await api("core/applications/radar/");
if (provider.client_id !== radar.clientID || provider.sub_mode !== "user_uuid" || !provider.signing_key ||
  application.provider !== radar.providerPK || application.policy_engine_mode !== "all" ||
  JSON.stringify(provider.redirect_uris.map(r => [r.matching_mode, r.url])) !== JSON.stringify(callbacks.map(url => ["strict", url]))) throw new Error("Radar identity policy mismatch");
for (const industry of industries) {
  const directory = industry.env.AIHOT_CREDENTIALS_DIR;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const file = path.join(directory, "auth.env");
  let previous = ""; try { previous = readFileSync(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const kept = previous.split("\n").filter(line => !/^OIDC_[A-Z_]+=/.test(line)).filter(Boolean);
  const values = { OIDC_ISSUER: radar.issuer, OIDC_CLIENT_ID: radar.clientID, OIDC_CLIENT_SECRET: radar.clientSecret,
    OIDC_ADMIN_SUBJECT: config.ownerSubject, OIDC_ADMIN_USER_ID: String(localUsers[industry.id]), OIDC_CA_FILE: path.join(runtime, "tls/ca.crt"), OIDC_LOOPBACK: "true" };
  atomic(file, [...kept, ...Object.entries(values).map(([name, value]) => `${name}=${value}`), ""].join("\n"));
}
atomic(envFile, readFileSync(envFile, "utf8").replace(/^SITE_URL=.*$/m, `SITE_URL=${launch}`));
if (originalClients !== JSON.stringify(Object.fromEntries(Object.entries(config.clients).filter(([id]) => id !== "radar")))) throw new Error("Other clients changed");
console.log(JSON.stringify({ client: "workos-radar", owner: "cywu", callbacks, localUsers, otherClientsPreserved: true, secretsStoredOnNAS: true }));
