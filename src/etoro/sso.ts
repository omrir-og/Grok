/**
 * eToro SSO / STS client (auth-code grant with PKCE).
 *
 * Follows the `implementing-etoro-sso` and `handling-etoro-session-expiry`
 * skills and `etoro-api-conventions`:
 *   - Host is `https://www.etoro.com`, body is `application/x-www-form-urlencoded`.
 *   - Refresh-token rotation is mandatory; persist both new tokens together.
 *   - `400 invalid_grant` on refresh means the session is dead — do not retry.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SsoError, SsoSessionExpiredError } from './errors.js';
import type { EtoroMe } from './types.js';

const SSO_BASE = 'https://www.etoro.com';
const PUBLIC_API_BASE = 'https://public-api.etoro.com/api/v1';

export interface SsoTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: 'Bearer';
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export function createPkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function createState(): string {
  return randomBytes(16).toString('hex');
}

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}

export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: p.scope ?? 'openid offline_access',
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${SSO_BASE}/sso/oauth2/authorize?${params.toString()}`;
}

async function ssoTokenRequest(body: URLSearchParams): Promise<SsoTokens> {
  const res = await fetch(`${SSO_BASE}/sso/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    if (err.error === 'invalid_grant') {
      throw new SsoSessionExpiredError('Refresh rejected (invalid_grant)');
    }
    throw new SsoError(
      err.error_description || err.error || `SSO ${res.status}`,
      res.status,
      err.error,
    );
  }
  return (await res.json()) as SsoTokens;
}

export interface ExchangeParams {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
}

/** Step 2 — exchange the authorization code for tokens. */
export async function exchangeCode(p: ExchangeParams): Promise<SsoTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.codeVerifier,
  });
  if (p.clientSecret) body.set('client_secret', p.clientSecret);
  return ssoTokenRequest(body);
}

/** Step 3 — refresh. Caller MUST persist both returned tokens atomically. */
export async function refreshTokens(
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<SsoTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  return ssoTokenRequest(body);
}

/** Step 4 — resolve identity. Use `gcid` as the primary key. */
export async function fetchMe(accessToken: string): Promise<EtoroMe> {
  const res = await fetch(`${PUBLIC_API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-request-id': randomUUID(),
    },
  });
  if (!res.ok) throw new Error(`/me failed: ${res.status}`);
  return (await res.json()) as EtoroMe;
}

/** Best-effort revoke (see session-expiry skill §4). */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(`${SSO_BASE}/sso/v1/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => undefined);
}
