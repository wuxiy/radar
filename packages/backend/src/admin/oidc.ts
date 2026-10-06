// Native OIDC admits one explicitly mapped administrator; no profile or email creates privileges.
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Agent, fetch as transportFetch } from "undici";
import * as client from "openid-client";
import { config, credential } from "../config.ts";
import { PROFILE } from "@aihot/industry/profile";

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  adminSubject: string;
  adminUserId: number;
  caFile: string | null;
  loopback: boolean;
}

export interface OidcClaims { issuer: string; subject: string; clientId: string; userId: number }

function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("OIDC requires a fixed HTTPS URL");
  return url;
}

/** Entirely absent means disabled. Partial configuration fails at startup without contacting the IdP. */
export function readOidcSettings(get = (key: string) => credential("auth", key), siteUrl = config.siteUrl): OidcSettings | null {
  const keys = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_ADMIN_SUBJECT", "OIDC_ADMIN_USER_ID", "OIDC_CA_FILE", "OIDC_LOOPBACK"];
  const values = keys.map(get);
  if (values.every(value => !value)) return null;
  if (values.slice(0, 5).some(value => !value)) throw new Error("Incomplete OIDC administrator configuration");
  const [issuer, clientId, clientSecret, adminSubject, id, caFile, loopback] = values;
  const adminUserId = Number(id);
  if (!Number.isSafeInteger(adminUserId) || adminUserId < 1 || clientSecret!.length < 16) throw new Error("Invalid OIDC administrator configuration");
  httpsUrl(issuer!);
  const callbackUrl = `${siteUrl}/api/auth/oidc/callback`;
  httpsUrl(callbackUrl);
  if (loopback && !["true", "false"].includes(loopback)) throw new Error("Invalid OIDC_LOOPBACK");
  if (loopback === "true" && !caFile) throw new Error("OIDC_LOOPBACK requires OIDC_CA_FILE");
  // Validate readability now; startup remains independent of identity-center availability.
  if (caFile) readFileSync(caFile);
  return { issuer: issuer!, clientId: clientId!, clientSecret: clientSecret!, adminSubject: adminSubject!, adminUserId, callbackUrl, caFile: caFile || null, loopback: loopback === "true" };
}

export const oidcSettings = readOidcSettings();
export const OIDC_COOKIE = PROFILE.basePath ? `radar_${PROFILE.id}_oidc_state` : "radar_oidc_state";
export const OIDC_TTL_SECONDS = 600;
export class OidcRejected extends Error { constructor() { super("统一登录状态无效或账号未获授权，请重新登录"); } }
export class OidcUnavailable extends Error { constructor() { super("统一身份中心暂不可用，请稍后重试或使用管理员密码"); } }

/** Recheck the explicit mapping at every admin request, including the row's actual user id. */
export function oidcClaimsAuthorized(value: unknown, userId: number, settings = oidcSettings): value is OidcClaims {
  if (!settings || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  return Object.keys(c).length === 4 && c.issuer === settings.issuer && c.subject === settings.adminSubject &&
    c.clientId === settings.clientId && c.userId === settings.adminUserId && userId === settings.adminUserId;
}

function oidcFetch(settings: OidcSettings): client.CustomFetch {
  const origin = new URL(settings.issuer).origin;
  const agent = new Agent({ connect: {
    ...(settings.caFile ? { ca: readFileSync(settings.caFile) } : {}),
    ...(settings.loopback ? { lookup: (_hostname, _options, callback) => callback(null, [{ address: "127.0.0.1", family: 4 }]) } : {}),
  } });
  return async (url, options) => {
    if (new URL(url).origin !== origin) throw new OidcRejected();
    try {
      const response = await transportFetch(url, { ...options, dispatcher: agent, redirect: "manual", signal: AbortSignal.any([options?.signal ?? AbortSignal.timeout(10_000), AbortSignal.timeout(10_000)]) });
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new OidcUnavailable(); }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 1024 * 1024) { await reader.cancel(); throw new OidcUnavailable(); }
        chunks.push(value);
      }
      return new Response(Buffer.concat(chunks), { status: response.status, headers: [...response.headers] });
    } catch { throw new OidcUnavailable(); } // Never propagate a URL, authorization code, secret, or IdP body to logs.
  };
}

type Pending = { expires: number; cookieHash: string; verifier: string; nonce: string; returnTo: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class OidcFlow {
  private pending = new Map<string, Pending>();
  private discovered: Promise<client.Configuration> | null = null;
  private readonly fetch: client.CustomFetch;
  readonly settings: OidcSettings;
  private readonly now: () => number;
  constructor(settings: OidcSettings, fetch?: client.CustomFetch, now = Date.now) {
    this.settings = settings;
    this.now = now;
    this.fetch = fetch ?? oidcFetch(settings);
  }

  private async configuration(): Promise<client.Configuration> {
    if (!this.discovered) this.discovered = client.discovery(new URL(this.settings.issuer), this.settings.clientId,
      { client_secret: this.settings.clientSecret, id_token_signed_response_alg: "RS256" }, client.ClientSecretPost(this.settings.clientSecret),
      { [client.customFetch]: this.fetch, timeout: 10, execute: [client.enableNonRepudiationChecks] }).then(value => {
        const metadata = value.serverMetadata();
        const origin = new URL(this.settings.issuer).origin;
        for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri]) {
          if (!endpoint || httpsUrl(endpoint).origin !== origin) throw new OidcRejected();
        }
        if (!metadata.code_challenge_methods_supported?.includes("S256")) throw new OidcRejected();
        return value;
      }).catch(() => { this.discovered = null; throw new OidcUnavailable(); });
    return this.discovered;
  }

  async start(returnTo: string) {
    for (const [state, value] of this.pending) if (value.expires <= this.now()) this.pending.delete(state);
    if (this.pending.size >= 128) throw new OidcUnavailable();
    const configuration = await this.configuration();
    const state = randomBytes(32).toString("base64url"), cookie = randomBytes(32).toString("base64url");
    const verifier = client.randomPKCECodeVerifier(), nonce = client.randomNonce();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    // No await between the final capacity check and insertion, including concurrent starts.
    if (this.pending.size >= 128) throw new OidcUnavailable();
    const url = client.buildAuthorizationUrl(configuration, { redirect_uri: this.settings.callbackUrl, response_type: "code", scope: "openid", state, nonce,
      code_challenge: challenge, code_challenge_method: "S256" });
    this.pending.set(state, { expires: this.now() + OIDC_TTL_SECONDS * 1000, cookieHash: digest(cookie), verifier, nonce, returnTo });
    return { url: url.href, stateCookie: cookie };
  }

  async complete(query: URLSearchParams, cookie: string | undefined) {
    const state = query.get("state") ?? "";
    const pending = this.pending.get(state);
    this.pending.delete(state); // Consume before the token request, including failed or replayed attempts.
    if (!pending || pending.expires <= this.now() || !cookie || digest(cookie) !== pending.cookieHash ||
      query.getAll("state").length !== 1 || query.getAll("code").length !== 1 || !query.get("code") || query.has("error") || query.toString().length > 8192) throw new OidcRejected();
    const callback = new URL(this.settings.callbackUrl);
    callback.search = query.toString();
    const configuration = await this.configuration();
    try {
      const tokens = await client.authorizationCodeGrant(configuration, callback,
        { expectedState: state, expectedNonce: pending.nonce, pkceCodeVerifier: pending.verifier, idTokenExpected: true });
      const claims = tokens.claims();
      if (!claims || claims.iss !== this.settings.issuer || claims.sub !== this.settings.adminSubject) throw new OidcRejected();
      return { claims: { issuer: claims.iss, subject: claims.sub, clientId: this.settings.clientId, userId: this.settings.adminUserId } satisfies OidcClaims, returnTo: pending.returnTo };
    } catch (error) {
      if (error instanceof OidcUnavailable || error instanceof client.ClientError && ["OAUTH_RESPONSE_IS_NOT_JSON", "OAUTH_RESPONSE_IS_NOT_CONFORM"].includes(error.code ?? "")) throw new OidcUnavailable();
      throw new OidcRejected();
    }
  }
}

export const oidcFlow = oidcSettings ? new OidcFlow(oidcSettings) : null;
