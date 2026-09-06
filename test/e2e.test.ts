import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

async function withServer(
  run: (base: string) => Promise<void>,
): Promise<void> {
  const cfg = loadConfig({ ETORO_MODE: 'mock', PORT: '0' } as NodeJS.ProcessEnv);
  const app = createApp(cfg);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /api/health reports mock/demo', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'ok');
    assert.equal(body.mode, 'mock');
  });
});

test('GET /api/portfolio returns the fully-assembled dashboard end-to-end', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/portfolio`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;

    // §1 aggregate figures, computed from the real code path over the mock API.
    assert.equal(data.summary.equity, 9880);
    assert.equal(data.summary.availableCash, 4600);
    assert.equal(data.summary.totalInvested, 4805);
    assert.equal(data.summary.profitLoss, 475);

    // 5 manual + 2 copy positions, enriched with display names + logos.
    assert.equal(data.positions.length, 7);
    const aapl = data.positions.find((p: any) => p.symbol === 'AAPL');
    assert.equal(aapl.displayName, 'Apple');
    assert.ok(aapl.imageUrl.endsWith('.svg')); // card variant selected
    assert.equal(aapl.currentRate, 220.2); // buy → bid

    // Copy trader surfaced.
    assert.equal(data.copyTraders.length, 1);
    assert.equal(data.copyTraders[0].username, 'JeppeKirkBonde');
  });
});

test('GET /api/config reports authenticated in mock mode', async () => {
  await withServer(async (base) => {
    const data = (await fetch(`${base}/api/config`).then((r) => r.json())) as any;
    assert.equal(data.mode, 'mock');
    assert.equal(data.authenticated, true);
  });
});
