// A real local TLS identity server and signed ID tokens; no external identity or model requests.
import "./setup.ts";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import Fastify from "fastify";

const directory = mkdtempSync(path.join(tmpdir(), "radar-oidc-tls-"));
const cert = path.join(directory, "cert.pem"), key = path.join(directory, "key.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert,
  "-subj", "/CN=idp.test", "-addext", "subjectAltName=DNS:idp.test"], { stdio: "ignore" });
const signing = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...signing.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const clientId = "radar-local-client", clientSecret = "local-oidc-secret-never-logged", owner = "configured-owner-subject";
let issuer = "", fault = "", tokenHits = 0, lastNonce = "", metadataFault = false;
const codes = new Map<string, { nonce: string; challenge: string }>();
const idp = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url?.endsWith("openid-configuration")) return res.end(JSON.stringify({ issuer, authorization_endpoint: metadataFault ? "https://other.test/authorize" : `${issuer}authorize`,
    token_endpoint: `${issuer}token`, jwks_uri: `${issuer}jwks`, response_types_supported: ["code"], subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] }));
  if (req.url?.endsWith("jwks")) return res.end(JSON.stringify({ keys: [jwk] }));
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
  const body = new URLSearchParams(Buffer.concat(chunks).toString());
  tokenHits++;
  if (fault === "down") { res.statusCode = 503; return res.end('{"error":"temporarily_unavailable"}'); }
  const code = codes.get(body.get("code") ?? ""); codes.delete(body.get("code") ?? "");
  if (!code || body.get("client_id") !== clientId || body.get("client_secret") !== clientSecret ||
    createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url") !== code.challenge ||
    body.get("redirect_uri") !== "https://radar.test/api/auth/oidc/callback") {
    res.statusCode = 400; return res.end('{"error":"invalid_grant"}');
  }
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { iss: issuer, sub: owner, aud: clientId, exp: now + 300, iat: now, nonce: code.nonce };
  if (fault === "issuer") claims.iss = "https://other.test/";
  if (fault === "subject") claims.sub = "another-user-with-owner-email";
  if (fault === "audience") claims.aud = "another-client";
  if (fault === "expired") claims.exp = now - 120;
  if (fault === "nonce") claims.nonce = "unrelated-nonce";
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const value = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(value), fault === "signature" ? stranger.privateKey : signing.privateKey).toString("base64url");
  res.end(JSON.stringify({ access_token: "local-token", token_type: "Bearer", expires_in: 300, id_token: `${value}.${signature}` }));
});
await new Promise<void>(resolve => idp.listen(0, "127.0.0.1", resolve));
issuer = `https://idp.test:${(idp.address() as { port: number }).port}/application/o/radar/`;
Object.assign(process.env, { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: clientSecret, OIDC_ADMIN_SUBJECT: owner,
  OIDC_ADMIN_USER_ID: "987654", OIDC_CA_FILE: cert, OIDC_LOOPBACK: "true", SITE_URL: "https://radar.test" });
const { OidcFlow, OidcRejected, OidcUnavailable, oidcSettings, readOidcSettings, oidcFlow, OIDC_COOKIE } = await import("@aihot/backend/admin/oidc");
const { sql, closeDb } = await import("@aihot/backend/db");
const { config } = await import("@aihot/backend/config");
const { SESSION_COOKIE, sessionPrincipal, passwordLogin, safeReturn } = await import("@aihot/backend/admin/auth");
const { registerAdminAuth, adminHandler } = await import("../apps/api/src/routes/admin-auth.ts");
const { sha256 } = await import("@aihot/backend/lib/ids");
config.adminPassword = "local-recovery-password-123456";
config.devAdmin = null;
await sql`INSERT INTO admin_users (id, email, display_name) VALUES (987654, 'existing-owner@local', '原管理员')`;
const app = Fastify({ logger: false }); registerAdminAuth(app);
let writes = 0;
app.post("/api/admin/oidc-test", adminHandler(async () => ({ writes: ++writes })));
beforeEach(() => { fault = ""; metadataFault = false; });
after(async () => { await app.close(); await closeDb(); await new Promise<void>(resolve => idp.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); });

function authorization(url: string) {
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), "openid"); assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("code_challenge_method"), "S256");
  lastNonce = params.get("nonce")!;
  const code = `local-code-${codes.size}-${Math.random()}`;
  codes.set(code, { nonce: lastNonce, challenge: params.get("code_challenge")! });
  return new URLSearchParams({ state: params.get("state")!, code });
}

test("absent config is disabled; partial, insecure and invalid administrator mappings fail closed", () => {
  assert.equal(readOidcSettings(() => null), null);
  assert.throws(() => readOidcSettings(key => key === "OIDC_ISSUER" ? issuer : null));
  const values: Record<string, string> = { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: clientSecret,
    OIDC_ADMIN_SUBJECT: owner, OIDC_ADMIN_USER_ID: "987654" };
  for (const patch of [{ OIDC_ISSUER: "http://idp.test" }, { OIDC_ADMIN_USER_ID: "0" }, { OIDC_LOOPBACK: "true" }, { OIDC_CLIENT_SECRET: "short" }]) {
    const candidate: Record<string, string | undefined> = { ...values, ...patch };
    assert.throws(() => readOidcSettings(key => candidate[key] ?? null, "https://radar.test"));
  }
  assert.throws(() => readOidcSettings(key => values[key] ?? null, "http://radar.test"));
});

test("TLS trusts only the configured CA and discovery cannot send credentials to another origin", async () => {
  const untrusted = new OidcFlow({ ...oidcSettings!, caFile: null });
  await assert.rejects(untrusted.start("/admin"), OidcUnavailable);
  metadataFault = true;
  const redirected = new OidcFlow(oidcSettings!);
  await assert.rejects(redirected.start("/admin"), OidcUnavailable);
});

test("authorization uses PKCE, state and nonce, expires and consumes browser-bound state once", async () => {
  let now = Date.now(); const flow = new OidcFlow(oidcSettings!, undefined, () => now);
  let login = await flow.start("/admin/models"); let query = authorization(login.url);
  const before = tokenHits;
  await assert.rejects(flow.complete(query, "wrong-browser"), OidcRejected);
  await assert.rejects(flow.complete(query, login.stateCookie), OidcRejected);
  assert.equal(tokenHits, before);
  login = await flow.start("/admin/models"); query = authorization(login.url); now += 600_001;
  await assert.rejects(flow.complete(query, login.stateCookie), OidcRejected);
  login = await flow.start("/admin/models"); query = authorization(login.url); query.append("code", "duplicate");
  await assert.rejects(flow.complete(query, login.stateCookie), OidcRejected);
  login = await flow.start("/admin/models"); query = authorization(login.url);
  assert.equal((await flow.complete(query, login.stateCookie)).returnTo, "/admin/models");
  await assert.rejects(flow.complete(query, login.stateCookie), OidcRejected);
});

for (const invalid of ["signature", "issuer", "audience", "expired", "nonce", "subject"]) test(`signed OIDC token rejects ${invalid} and creates no admin session`, async () => {
  const before = await sql`SELECT count(*)::int AS n FROM admin_sessions`;
  const flow = new OidcFlow(oidcSettings!), login = await flow.start("/admin"); fault = invalid;
  await assert.rejects(flow.complete(authorization(login.url), login.stateCookie), OidcRejected);
  assert.deepEqual(await sql`SELECT count(*)::int AS n FROM admin_sessions`, before);
});

test("IdP outage does not grant access and the existing password still works", async () => {
  const flow = new OidcFlow(oidcSettings!), login = await flow.start("/admin"); fault = "down";
  await assert.rejects(flow.complete(authorization(login.url), login.stateCookie), OidcUnavailable);
  const password = await passwordLogin(config.adminPassword!, "/admin", "local-test");
  assert.ok(await sessionPrincipal(`${SESSION_COOKIE}=${password.token}`));
});

test("real routes issue an existing admin session, enforce CSRF, revoke mapping changes, and logout locally", async () => {
  const options = await app.inject({ url: "/api/auth/options" }); assert.equal(options.json().oidc, true);
  assert.equal(options.json().oidcUrl, "https://radar.test/api/auth/oidc");
  assert.equal((await app.inject({ url: "/api/admin/me" })).statusCode, 401);
  const start = await app.inject({ url: "/api/auth/oidc?return=%2Fadmin%2Fmodels" });
  assert.equal(start.statusCode, 302);
  const stateCookie = String(start.headers["set-cookie"]).split(";")[0]!;
  assert.match(String(start.headers["set-cookie"]), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  const query = authorization(String(start.headers.location));
  const callback = await app.inject({ url: `/api/auth/oidc/callback?${query}`, headers: { cookie: stateCookie } });
  assert.equal(callback.statusCode, 302, callback.body); assert.equal(callback.headers.location, "/admin/models");
  const sessionCookie = (callback.headers["set-cookie"] as string[]).find(value => value.startsWith(`${SESSION_COOKIE}=`))!;
  assert.match(sessionCookie, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  const cookie = sessionCookie.split(";")[0]!;
  const me = (await app.inject({ url: "/api/admin/me", headers: { cookie } })).json(); assert.equal(me.name, "原管理员");
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/oidc-test", headers: { cookie } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/oidc-test", headers: { cookie, "x-csrf-token": me.csrf } })).statusCode, 200);
  const [row] = await sql`SELECT * FROM admin_sessions WHERE id_hash=${sha256(cookie.split("=")[1]!)}`;
  assert.equal(row!.user_id, 987654); assert.equal(row!.auth_method, "oidc");
  assert.equal(JSON.stringify(row).includes(clientSecret), false);
  assert.equal((await app.inject({ url: `/api/auth/oidc/callback?${query}`, headers: { cookie: stateCookie } })).statusCode, 403);
  const original = oidcSettings!.adminSubject; oidcSettings!.adminSubject = "changed-subject";
  assert.equal((await app.inject({ url: "/api/auth/check", headers: { cookie } })).statusCode, 401);
  oidcSettings!.adminSubject = original;
  assert.equal((await app.inject({ url: "/api/auth/check", headers: { cookie } })).statusCode, 401);
  const next = await oidcFlow!.start("/admin");
  const fresh = await app.inject({ url: `/api/auth/oidc/callback?${authorization(next.url)}`, headers: { cookie: `${OIDC_COOKIE}=${next.stateCookie}` } });
  const freshCookie = (fresh.headers["set-cookie"] as string[]).find(value => value.startsWith(`${SESSION_COOKIE}=`))!.split(";")[0]!;
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: freshCookie } })).statusCode, 303);
  assert.equal((await app.inject({ url: "/api/auth/check", headers: { cookie: freshCookie } })).statusCode, 401);
});

test("session and audit are atomic; missing local administrator cannot be provisioned by OIDC", async () => {
  const count = async () => (await sql`SELECT count(*)::int AS n FROM admin_sessions`)[0]!.n;
  await sql.unsafe("CREATE FUNCTION reject_oidc_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.after->>'method'='oidc' THEN RAISE EXCEPTION 'local audit failure'; END IF; RETURN NEW; END $$");
  await sql.unsafe("CREATE TRIGGER oidc_audit_guard BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_oidc_audit()");
  try {
    const before = await count(), login = await oidcFlow!.start("/admin");
    const response = await app.inject({ url: `/api/auth/oidc/callback?${authorization(login.url)}`, headers: { cookie: `${OIDC_COOKIE}=${login.stateCookie}` } });
    assert.equal(response.statusCode, 403); assert.equal(await count(), before);
    assert.ok(!response.body.includes("local audit failure") && !response.body.includes(clientSecret));
  } finally { await sql.unsafe("DROP TRIGGER oidc_audit_guard ON audit_log"); await sql.unsafe("DROP FUNCTION reject_oidc_audit()"); }
  const original = oidcSettings!.adminUserId; oidcSettings!.adminUserId = 999999;
  try {
    const login = await oidcFlow!.start("/admin");
    const response = await app.inject({ url: `/api/auth/oidc/callback?${authorization(login.url)}`, headers: { cookie: `${OIDC_COOKIE}=${login.stateCookie}` } });
    assert.equal(response.statusCode, 403); assert.equal((await sql`SELECT 1 FROM admin_users WHERE id=999999`).length, 0);
  } finally { oidcSettings!.adminUserId = original; }
  assert.equal(safeReturn("https://evil.test/elsewhere"), "/admin");
  assert.equal(safeReturn("//evil.test/admin"), "/admin");
});

test("parallel login starts are bounded and expired entries free capacity", async () => {
  let now = Date.now(); const flow = new OidcFlow(oidcSettings!, undefined, () => now);
  const results = await Promise.allSettled(Array.from({ length: 140 }, () => flow.start("/admin")));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 128);
  now += 600_001; assert.ok(await flow.start("/admin"));
});
