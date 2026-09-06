import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Transient PKCE + CSRF state during the OAuth round-trip. */
    etoroOauth?: { codeVerifier: string; state: string };
    /** eToro SSO tokens, keyed in-session to the browser (demo storage). */
    etoroTokens?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      gcid: number;
    };
  }
}
