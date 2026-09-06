import type { EtoroEnv } from './etoro/types.js';

export interface AppConfig {
  port: number;
  sessionSecret: string;
  mode: 'mock' | 'live';
  etoroEnv: EtoroEnv;
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  apiKey?: string;
  userKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mode = env.ETORO_MODE === 'live' ? 'live' : 'mock';
  const etoroEnv: EtoroEnv = env.ETORO_ENV === 'real' ? 'real' : 'demo';
  return {
    port: Number(env.PORT ?? 3000),
    sessionSecret: env.SESSION_SECRET ?? 'dev-only-change-me',
    mode,
    etoroEnv,
    clientId: env.ETORO_CLIENT_ID || undefined,
    clientSecret: env.ETORO_CLIENT_SECRET || undefined,
    redirectUri:
      env.ETORO_REDIRECT_URI ||
      'http://localhost:3000/api/auth/etoro/callback',
    apiKey: env.ETORO_API_KEY || undefined,
    userKey: env.ETORO_USER_KEY || undefined,
  };
}
