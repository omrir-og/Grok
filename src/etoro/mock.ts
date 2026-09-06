/**
 * Mock eToro transport.
 *
 * Returns a `fetch`-compatible function that serves representative fixtures for
 * the endpoints the dashboard uses. This lets the whole app — header building,
 * retry/parse in `EtoroClient`, enrichment, and the §1 aggregation formulas —
 * run end-to-end without eToro credentials or network access. Only the network
 * boundary is stubbed; all business logic is the real code path.
 *
 * The fixture models a realistic account: manual positions (incl. a leveraged
 * index and a non-USD London stock), a copy-trading mirror, and pending orders.
 * Top-level `positions[]` holds manual positions only; copy positions live
 * under `mirrors[].positions[]` (disjoint), matching the account-snapshot §1
 * formulas which sum the two arrays separately.
 */
import type { FetchLike } from './client.js';
import type {
  EtoroClientPortfolio,
  InstrumentMeta,
  EtoroRate,
} from './types.js';

export const MOCK_PORTFOLIO: EtoroClientPortfolio = {
  credit: 5000,
  positions: [
    { positionID: 501, instrumentID: 1001, mirrorID: 0, amount: 500, units: 2.5, openRate: 200, leverage: 1, isBuy: true, totalFees: -3.2, unrealizedPnL: { pnL: 50 } },
    { positionID: 502, instrumentID: 1002, mirrorID: 0, amount: 300, units: 1.2, openRate: 250, leverage: 1, isBuy: true, totalFees: 0, unrealizedPnL: { pnL: -20 } },
    { positionID: 503, instrumentID: 1003, mirrorID: 0, amount: 1000, units: 0.02, openRate: 50000, leverage: 1, isBuy: true, totalFees: 4.5, unrealizedPnL: { pnL: 250 } },
    { positionID: 504, instrumentID: 1004, mirrorID: 0, amount: 200, units: 0.4, openRate: 5000, leverage: 5, isBuy: true, totalFees: 1.1, unrealizedPnL: { pnL: 30 } },
    { positionID: 505, instrumentID: 1005, mirrorID: 0, amount: 400, units: 80, openRate: 500, leverage: 1, isBuy: true, totalFees: -1.8, unrealizedPnL: { pnL: 15 } },
  ],
  mirrors: [
    {
      mirrorID: 55,
      CID: 12345,
      parentUsername: 'JeppeKirkBonde',
      availableAmount: 1030,
      closedPositionsNetProfit: 30,
      positions: [
        { positionID: 601, instrumentID: 1006, mirrorID: 55, amount: 500, units: 4, openRate: 125, leverage: 1, isBuy: true, unrealizedPnL: { pnL: 80 } },
        { positionID: 602, instrumentID: 1007, mirrorID: 55, amount: 500, units: 1.2, openRate: 410, leverage: 1, isBuy: true, unrealizedPnL: { pnL: 40 } },
      ],
    },
  ],
  orders: [{ orderID: 9002, instrumentID: 1001, mirrorID: 0, amount: 150 }],
  ordersForOpen: [
    { orderID: 9001, instrumentID: 1002, mirrorID: 0, amount: 250, totalExternalCosts: 5 },
  ],
};

interface MockInstrument extends InstrumentMeta {
  rate: Omit<EtoroRate, 'instrumentID'>;
}

const MOCK_INSTRUMENTS: Record<number, MockInstrument> = {
  1001: img(1001, 'AAPL', 'Apple', '#000000', { ask: 220.4, bid: 220.2 }),
  1002: img(1002, 'TSLA', 'Tesla Motors', '#cc0000', { ask: 233.1, bid: 232.9 }),
  1003: img(1003, 'BTC', 'Bitcoin', '#f7931a', { ask: 62500, bid: 62450 }),
  1004: img(1004, 'SPX500', 'S&P 500 Index', '#1f4e79', { ask: 5075, bid: 5074 }),
  1005: img(1005, 'BP.L', 'BP plc', '#009900', { ask: 512, bid: 511 }),
  1006: img(1006, 'NVDA', 'NVIDIA', '#76b900', { ask: 141.2, bid: 141.0 }),
  1007: img(1007, 'MSFT', 'Microsoft', '#0067b8', { ask: 445.6, bid: 445.3 }),
};

function img(
  id: number,
  symbol: string,
  name: string,
  bg: string,
  rate: { ask: number; bid: number },
): MockInstrument {
  return {
    instrumentID: id,
    symbolFull: symbol,
    instrumentDisplayName: name,
    images: [
      { uri: `https://etoro-cdn.example/${symbol}-90.png`, format: 'png', width: 90 },
      { uri: `https://etoro-cdn.example/${symbol}-150.png`, format: 'png', width: 150 },
      { uri: `https://etoro-cdn.example/${symbol}-card.svg`, format: 'svg', backgroundColor: bg, textColor: '#ffffff' },
    ],
    rate: { ...rate, lastExecution: Date.now() },
  };
}

const ME = { gcid: 987654321, realCid: 111222, demoCid: 333444 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseIds(url: URL): number[] {
  const raw = url.searchParams.get('instrumentIds') ?? '';
  return raw
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/** Build a `fetch`-compatible transport over the fixtures above. */
export function createMockFetch(): FetchLike {
  return async (rawUrl: string): Promise<Response> => {
    const url = new URL(rawUrl);
    const path = url.pathname;

    if (path.endsWith('/pnl')) {
      return json({ clientPortfolio: MOCK_PORTFOLIO });
    }
    if (path.endsWith('/me')) {
      return json(ME);
    }
    if (path.includes('/market-data/instruments/rates')) {
      const rates = parseIds(url)
        .filter((id) => MOCK_INSTRUMENTS[id])
        .map((id) => ({ instrumentID: id, ...MOCK_INSTRUMENTS[id]!.rate }));
      return json({ rates });
    }
    if (path.includes('/market-data/instruments')) {
      const instrumentDisplayDatas = parseIds(url)
        .filter((id) => MOCK_INSTRUMENTS[id])
        .map((id) => {
          const { rate, ...meta } = MOCK_INSTRUMENTS[id]!;
          void rate;
          return meta;
        });
      return json({ instrumentDisplayDatas });
    }
    return json({ error: `mock: unhandled path ${path}` }, 404);
  };
}
