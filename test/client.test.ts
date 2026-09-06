import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EtoroClient,
  buildEtoroHeaders,
  type FetchLike,
} from '../src/etoro/client.js';
import {
  EtoroApiError,
  EtoroPayloadTooLargeError,
  EtoroRateLimitError,
  SsoSessionExpiredError,
} from '../src/etoro/errors.js';

const noSleep = () => Promise.resolve();
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('bearer headers set Authorization and never the api-key family', () => {
  const h = buildEtoroHeaders({ mode: 'bearer', accessToken: 'tok' });
  assert.equal(h['Authorization'], 'Bearer tok');
  assert.ok(!('x-api-key' in h));
  assert.ok(!('x-user-key' in h));
  assert.match(h['x-request-id']!, /^[0-9a-f-]{36}$/);
});

test('apiKey headers set x-api-key + x-user-key and never Authorization', () => {
  const h = buildEtoroHeaders({ mode: 'apiKey', userKey: 'uk' }, 'partner-key');
  assert.equal(h['x-api-key'], 'partner-key');
  assert.equal(h['x-user-key'], 'uk');
  assert.ok(!('Authorization' in h));
});

test('429 backs off then succeeds on retry', async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return calls === 1 ? jsonRes({ error: 'rate' }, 429) : jsonRes({ ok: true });
  };
  const client = new EtoroClient({ fetchImpl, sleep: noSleep, backoffBaseMs: 1 });
  const out = await client.get<{ ok: boolean }>('/x', {
    mode: 'bearer',
    accessToken: 't',
  });
  assert.equal(out.ok, true);
  assert.equal(calls, 2);
});

test('persistent 429 surfaces EtoroRateLimitError', async () => {
  const fetchImpl: FetchLike = async () => jsonRes({ error: 'rate' }, 429);
  const client = new EtoroClient({ fetchImpl, sleep: noSleep, maxRetries: 2 });
  await assert.rejects(
    client.get('/x', { mode: 'bearer', accessToken: 't' }),
    (e) => e instanceof EtoroRateLimitError,
  );
});

test('413 surfaces EtoroPayloadTooLargeError without retry', async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return jsonRes({ error: 'too big' }, 413);
  };
  const client = new EtoroClient({ fetchImpl, sleep: noSleep });
  await assert.rejects(
    client.get('/x', { mode: 'bearer', accessToken: 't' }),
    (e) => e instanceof EtoroPayloadTooLargeError,
  );
  assert.equal(calls, 1);
});

test('401 surfaces SsoSessionExpiredError', async () => {
  const fetchImpl: FetchLike = async () => jsonRes({ error: 'unauth' }, 401);
  const client = new EtoroClient({ fetchImpl, sleep: noSleep });
  await assert.rejects(
    client.get('/x', { mode: 'bearer', accessToken: 't' }),
    (e) => e instanceof SsoSessionExpiredError,
  );
});

test('other 4xx surfaces EtoroApiError and does not retry', async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return jsonRes({ error: 'bad request' }, 400);
  };
  const client = new EtoroClient({ fetchImpl, sleep: noSleep });
  await assert.rejects(
    client.get('/x', { mode: 'bearer', accessToken: 't' }),
    (e) => e instanceof EtoroApiError && (e as EtoroApiError).statusCode === 400,
  );
  assert.equal(calls, 1);
});

test('5xx retries with backoff then succeeds', async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return calls < 3 ? jsonRes({ error: 'boom' }, 503) : jsonRes({ ok: 1 });
  };
  const client = new EtoroClient({ fetchImpl, sleep: noSleep, backoffBaseMs: 1 });
  const out = await client.get<{ ok: number }>('/x', {
    mode: 'bearer',
    accessToken: 't',
  });
  assert.equal(out.ok, 1);
  assert.equal(calls, 3);
});
