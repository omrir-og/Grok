/**
 * Auth-context resolution and the SSO "sign in with eToro" routes.
 *
 * Resolves an `EtoroRequestContext` for a request:
 *   - mock mode: a placeholder bearer context (the mock transport ignores it).
 *   - live SSO: a bearer context from the session tokens, refreshed once on 401.
 *   - live API-key: an apiKey context from configured partner keys.
 *
 * Session-expiry handling follows the `handling-etoro-session-expiry` skill:
 * a dead session surfaces as EtoroReconnectRequiredError, never a refresh loop.
 */
import { Router } from 'express';
import type { AppConfig } from './config.js';
import type { EtoroRequestContext } from './etoro/client.js';
import {
  EtoroReconnectRequiredError,
  SsoSessionExpiredError,
  isSessionDead,
} from './etoro/errors.js';
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  exchangeCode,
  fetchMe,
  refreshTokens,
} from './etoro/sso.js';

export function resolveAuthContext(
  cfg: AppConfig,
  session: import('express-session').Session &
    Partial<import('express-session').SessionData>,
): EtoroRequestContext | null {
  if (cfg.mode === 'mock') {
    return { mode: 'bearer', accessToken: 'mock-access-token' };
  }
  if (session.etoroTokens) {
    return { mode: 'bearer', accessToken: session.etoroTokens.accessToken };
  }
  if (cfg.apiKey && cfg.userKey) {
    return { mode: 'apiKey', userKey: cfg.userKey };
  }
  return null;
}

/**
 * Run an operation with a bearer context, refreshing the token exactly once on
 * a 401. A second 401 (or a dead refresh) becomes EtoroReconnectRequiredError.
 */
export async function withRefreshOnce<T>(
  cfg: AppConfig,
  session: import('express-session').Session &
    Partial<import('express-session').SessionData>,
  op: (ctx: EtoroRequestContext) => Promise<T>,
): Promise<T> {
  const ctx = resolveAuthContext(cfg, session);
  if (!ctx) throw new EtoroReconnectRequiredError('Not authenticated');
  try {
    return await op(ctx);
  } catch (err) {
    if (err instanceof SsoSessionExpiredError && session.etoroTokens) {
      try {
        const t = await refreshTokens(
          session.etoroTokens.refreshToken,
          cfg.clientId!,
          cfg.clientSecret,
        );
        // Rotation is mandatory — persist BOTH new tokens together.
        session.etoroTokens = {
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt: Date.now() + t.expires_in * 1000,
          gcid: session.etoroTokens.gcid,
        };
        return await op({ mode: 'bearer', accessToken: t.access_token });
      } catch (refreshErr) {
        if (isSessionDead(refreshErr)) {
          throw new EtoroReconnectRequiredError();
        }
        throw refreshErr;
      }
    }
    throw err;
  }
}

export function createAuthRouter(cfg: AppConfig): Router {
  const router = Router();

  router.get('/etoro/start', (req, res) => {
    if (!cfg.clientId) {
      return res
        .status(400)
        .json({ error: 'SSO not configured (set ETORO_CLIENT_ID)' });
    }
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = createState();
    req.session.etoroOauth = { codeVerifier, state };
    res.redirect(
      buildAuthorizeUrl({
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        state,
        codeChallenge,
      }),
    );
  });

  router.get('/etoro/callback', async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    const stored = req.session.etoroOauth;
    if (!code || !stored || stored.state !== state) {
      return res.status(400).json({ error: 'Invalid OAuth state' });
    }
    try {
      const tokens = await exchangeCode({
        code,
        redirectUri: cfg.redirectUri,
        clientId: cfg.clientId!,
        clientSecret: cfg.clientSecret,
        codeVerifier: stored.codeVerifier,
      });
      const me = await fetchMe(tokens.access_token);
      req.session.etoroTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        gcid: me.gcid,
      };
      delete req.session.etoroOauth;
      res.redirect('/');
    } catch (err) {
      res
        .status(502)
        .json({ error: (err as Error).message || 'Token exchange failed' });
    }
  });

  router.post('/logout', (req, res) => {
    delete req.session.etoroTokens;
    res.json({ ok: true });
  });

  return router;
}
