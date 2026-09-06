import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_PORTFOLIO } from '../src/etoro/mock.js';
import {
  computeAvailableCash,
  computeTotalInvested,
  computeProfitLoss,
  computeAccountSummary,
  collectInstrumentIds,
  buildPositionView,
} from '../src/etoro/snapshot.js';

test('account-snapshot §1 formulas match hand-computed fixture values', () => {
  assert.equal(computeAvailableCash(MOCK_PORTFOLIO), 4600);
  assert.equal(computeTotalInvested(MOCK_PORTFOLIO), 4805);
  assert.equal(computeProfitLoss(MOCK_PORTFOLIO), 475);

  const s = computeAccountSummary(MOCK_PORTFOLIO);
  assert.equal(s.equity, 9880);
  // Equity is exactly the sum of its three components.
  assert.equal(s.equity, s.availableCash + s.totalInvested + s.profitLoss);
});

test('collectInstrumentIds walks both positions[] and mirrors[].positions[]', () => {
  const ids = collectInstrumentIds(MOCK_PORTFOLIO).sort((a, b) => a - b);
  assert.deepEqual(ids, [1001, 1002, 1003, 1004, 1005, 1006, 1007]);
});

test('leveraged position uses openRate as entry price (rule §3)', () => {
  const spx = MOCK_PORTFOLIO.positions.find((p) => p.leverage > 1)!;
  const view = buildPositionView(spx, undefined, undefined);
  // amount/units would be 200/0.4 = 500 (5x too low); must use openRate.
  assert.equal(view.usdEntryPrice, 5000);
});

test('non-USD unleveraged position converts price via amount/units (rule §2)', () => {
  const bpl = MOCK_PORTFOLIO.positions.find((p) => p.instrumentID === 1005)!;
  const view = buildPositionView(bpl, undefined, undefined);
  // openRate is 500 (pence); USD-equivalent is 400/80 = 5.
  assert.equal(view.usdEntryPrice, 5);
});
