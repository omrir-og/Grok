# Grok — eToro Portfolio Dashboard

A reference application built on the **eToro Public API**. It renders a live
portfolio dashboard — equity, available cash, total invested, profit/loss,
open positions (with logos and live rates), and copy-trading mirrors — computed
with eToro's official account-snapshot formulas.

The app runs **end-to-end without any eToro credentials** via a built-in mock
data source, and switches to the real eToro Public API when credentials are
provided.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000  (mock mode by default)
```

Open http://localhost:3000 to view the dashboard.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload (tsx watch). |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled server (`dist/server.js`). |
| `npm test` | Run the unit + end-to-end test suite (`node:test`). |
| `npm run typecheck` | Type-check without emitting. |

## Configuration

Copy `.env.example` to `.env` to customize. Key variables:

- `ETORO_MODE` — `mock` (default) serves fixtures; `live` calls the real API.
- `ETORO_ENV` — `demo` (paper) or `real` for live mode.
- `ETORO_CLIENT_ID` / `ETORO_CLIENT_SECRET` / `ETORO_REDIRECT_URI` — SSO app.
- `ETORO_API_KEY` / `ETORO_USER_KEY` — partner API-key auth (alternative to SSO).

In `live` mode the app authenticates either via **"Sign in with eToro"**
(OAuth auth-code grant with PKCE) or the partner API-key pair — never both auth
families at once.

## Architecture

```
src/
  server.ts            Express app: routes + static hosting
  config.ts            Environment-driven configuration
  auth.ts              Auth-context resolution + SSO routes + refresh-once
  portfolio.ts         Assembles the dashboard payload
  etoro/
    client.ts          Public API client (creds union, retry by error class)
    sso.ts             SSO/STS client (form-encoded, token rotation)
    snapshot.ts        Account-snapshot §1 aggregation formulas
    instruments.ts     Metadata enrichment + adaptive batching + image select
    mock.ts            Mock transport (fixtures) for credential-free runs
    errors.ts          Typed error hierarchy
    types.ts           Wire types (per-endpoint casing preserved)
public/                Dashboard UI (vanilla HTML/CSS/JS)
test/                  Unit + end-to-end tests
```

The design follows the eToro API conventions and skills: two distinct hosts
(Public API vs SSO), a discriminated-union credential model, per-request
`x-request-id`, retry strategy split by HTTP error class (401 / 413-414 / 429 /
5xx), literal-comma list params, per-endpoint identifier casing, and the
official Available Cash / Total Invested / Profit-Loss / Equity formulas.

## Cloud Agent environment

`.cursor/environment.json` provisions the app for Cursor Cloud Agents:
`npm ci` installs dependencies and a `dev-server` terminal runs `npm run dev`
on port 3000. Mock mode means the dashboard works immediately without secrets.
