import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import { loadConfig, type AppConfig } from './config.js';
import { EtoroClient } from './etoro/client.js';
import { createMockFetch } from './etoro/mock.js';
import { EtoroReconnectRequiredError } from './etoro/errors.js';
import { buildDashboard } from './portfolio.js';
import {
  createAuthRouter,
  resolveAuthContext,
  withRefreshOnce,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

export function createApp(cfg: AppConfig): express.Express {
  const app = express();

  const client = new EtoroClient({
    fetchImpl: cfg.mode === 'mock' ? createMockFetch() : undefined,
    apiKey: cfg.apiKey,
  });

  app.use(express.json());
  app.use(
    session({
      secret: cfg.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax' },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: cfg.mode, env: cfg.etoroEnv });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      mode: cfg.mode,
      env: cfg.etoroEnv,
      ssoConfigured: Boolean(cfg.clientId),
      authenticated:
        cfg.mode === 'mock' ||
        Boolean(resolveAuthContext(cfg, req.session)),
    });
  });

  app.get('/api/portfolio', async (req, res) => {
    try {
      const payload = await withRefreshOnce(cfg, req.session, (ctx) =>
        buildDashboard(client, ctx, cfg.etoroEnv),
      );
      res.json(payload);
    } catch (err) {
      if (err instanceof EtoroReconnectRequiredError) {
        return res
          .status(401)
          .json({ error: 'reconnect_required', message: err.message });
      }
      console.error('portfolio error:', err);
      res
        .status(502)
        .json({ error: 'portfolio_failed', message: (err as Error).message });
    }
  });

  app.use('/api/auth', createAuthRouter(cfg));
  app.use(express.static(PUBLIC_DIR));

  return app;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const cfg = loadConfig();
  const app = createApp(cfg);
  app.listen(cfg.port, () => {
    console.log(
      `Grok eToro dashboard listening on http://localhost:${cfg.port} ` +
        `(mode=${cfg.mode}, env=${cfg.etoroEnv})`,
    );
  });
}
