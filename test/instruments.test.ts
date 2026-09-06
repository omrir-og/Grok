import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EtoroClient, type FetchLike } from '../src/etoro/client.js';
import {
  fetchInstrumentsResilient,
  selectInstrumentImageUrl,
} from '../src/etoro/instruments.js';

test('image selection prefers the svg card, else the widest png', () => {
  const card = selectInstrumentImageUrl([
    { uri: 'a.png', format: 'png', width: 50 },
    { uri: 'b.svg', format: 'svg', backgroundColor: '#000' },
    { uri: 'c.png', format: 'png', width: 150 },
  ]);
  assert.equal(card, 'b.svg');

  const widest = selectInstrumentImageUrl([
    { uri: 'a.png', format: 'png', width: 50 },
    { uri: 'c.png', format: 'png', width: 150 },
    { uri: 'b.png', format: 'png', width: 90 },
  ]);
  assert.equal(widest, 'c.png');

  assert.equal(selectInstrumentImageUrl([]), null);
  assert.equal(selectInstrumentImageUrl(undefined), null);
});

test('instrument IDs are serialized with a literal comma (never %2C)', async () => {
  const seen: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    seen.push(url);
    return new Response(JSON.stringify({ instrumentDisplayDatas: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new EtoroClient({ fetchImpl });
  await fetchInstrumentsResilient(client, [1, 2, 3], {
    mode: 'bearer',
    accessToken: 't',
  });
  assert.ok(seen[0]!.includes('instrumentIds=1,2,3'));
  assert.ok(!seen[0]!.includes('%2C'));
});

test('413 shrinks the batch (50 → 25); 200 at smaller size resolves all', async () => {
  const ids = Array.from({ length: 60 }, (_, i) => 1000 + i);
  const sizes: number[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const u = new URL(url);
    const chunk = (u.searchParams.get('instrumentIds') ?? '').split(',');
    sizes.push(chunk.length);
    if (chunk.length > 25) {
      return new Response('too big', { status: 413 });
    }
    const instrumentDisplayDatas = chunk.map((s) => ({
      instrumentID: Number(s),
      instrumentDisplayName: `Name ${s}`,
      symbolFull: `S${s}`,
    }));
    return new Response(JSON.stringify({ instrumentDisplayDatas }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new EtoroClient({ fetchImpl });
  const out = await fetchInstrumentsResilient(client, ids, {
    mode: 'bearer',
    accessToken: 't',
  });
  assert.equal(out.size, 60);
  // First attempt used 50 (→413), then everything used 25.
  assert.equal(sizes[0], 50);
  assert.ok(sizes.slice(1).every((n) => n <= 25));
});
