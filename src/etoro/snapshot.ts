/**
 * Account snapshot aggregation.
 *
 * Implements the `etoro-account-snapshot` rule §1 formulas verbatim. All four
 * account-level figures come from the single `/trading/info/{env}/pnl`
 * response (`clientPortfolio`). Do not shortcut these — the official formulas
 * include per-mirror-position amounts, the
 * `mirrors[].availableAmount − closedPositionsNetProfit` adjustment, and the
 * `totalExternalCosts` term that simpler approximations miss.
 */
import type {
  EtoroClientPortfolio,
  EtoroPosition,
  InstrumentMeta,
  EtoroRate,
} from './types.js';
import { selectInstrumentImageUrl } from './instruments.js';

export interface AccountSummary {
  availableCash: number;
  totalInvested: number;
  profitLoss: number;
  equity: number;
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

export function computeAvailableCash(p: EtoroClientPortfolio): number {
  return (
    p.credit -
    sum(p.ordersForOpen.filter((o) => o.mirrorID === 0).map((o) => o.amount)) -
    sum(p.orders.map((o) => o.amount))
  );
}

export function computeTotalInvested(p: EtoroClientPortfolio): number {
  const manualOrders = p.ordersForOpen.filter((o) => o.mirrorID === 0);
  return (
    sum(p.positions.map((pos) => pos.amount)) +
    sum(p.mirrors.flatMap((m) => m.positions.map((pos) => pos.amount))) +
    sum(p.mirrors.map((m) => m.availableAmount - m.closedPositionsNetProfit)) +
    sum(manualOrders.map((o) => o.amount)) +
    sum(p.orders.map((o) => o.amount)) +
    sum(manualOrders.map((o) => o.totalExternalCosts ?? 0))
  );
}

export function computeProfitLoss(p: EtoroClientPortfolio): number {
  return (
    sum(p.positions.map((pos) => pos.unrealizedPnL?.pnL ?? 0)) +
    sum(
      p.mirrors.flatMap((m) =>
        m.positions.map((pos) => pos.unrealizedPnL?.pnL ?? 0),
      ),
    ) +
    sum(p.mirrors.map((m) => m.closedPositionsNetProfit))
  );
}

export function computeAccountSummary(
  p: EtoroClientPortfolio,
): AccountSummary {
  const availableCash = computeAvailableCash(p);
  const totalInvested = computeTotalInvested(p);
  const profitLoss = computeProfitLoss(p);
  return {
    availableCash,
    totalInvested,
    profitLoss,
    equity: availableCash + totalInvested + profitLoss,
  };
}

/**
 * Collect every instrument ID for enrichment. Walk BOTH `positions[]` and
 * `mirrors[].positions[]` so no copy-position instrument is missed (rule §5),
 * even though display later uses `positions[]` as the single source of truth.
 */
export function collectInstrumentIds(p: EtoroClientPortfolio): number[] {
  const ids = new Set<number>();
  for (const pos of p.positions) ids.add(pos.instrumentID);
  for (const m of p.mirrors) {
    for (const pos of m.positions) ids.add(pos.instrumentID);
  }
  return [...ids];
}

export interface PositionView {
  positionID: number;
  instrumentID: number;
  symbol: string;
  displayName: string;
  imageUrl: string | null;
  isBuy: boolean;
  leverage: number;
  units: number;
  amount: number;
  /** Entry price. For leveraged positions use `openRate` directly (rule §3). */
  entryPrice: number;
  /** USD-equivalent entry price for non-USD unleveraged instruments (rule §2). */
  usdEntryPrice: number;
  currentRate: number | null;
  pnl: number;
  isCopy: boolean;
}

export function buildPositionView(
  pos: EtoroPosition,
  meta: InstrumentMeta | undefined,
  rate: EtoroRate | undefined,
): PositionView {
  // Rule §2/§3: only synthesize a USD price for UNLEVERAGED positions.
  const usdEntryPrice =
    pos.leverage > 1 || pos.units === 0
      ? pos.openRate
      : pos.amount / pos.units;
  return {
    positionID: pos.positionID,
    instrumentID: pos.instrumentID,
    symbol: meta?.symbolFull ?? String(pos.instrumentID),
    displayName: meta?.instrumentDisplayName ?? `#${pos.instrumentID}`,
    imageUrl: selectInstrumentImageUrl(meta?.images),
    isBuy: pos.isBuy,
    leverage: pos.leverage,
    units: pos.units,
    amount: pos.amount,
    entryPrice: pos.openRate,
    usdEntryPrice,
    // Never synthesize a live rate from PnL — only a real rate endpoint value.
    currentRate: rate ? (pos.isBuy ? rate.bid : rate.ask) : null,
    pnl: pos.unrealizedPnL?.pnL ?? 0,
    isCopy: pos.mirrorID > 0,
  };
}
