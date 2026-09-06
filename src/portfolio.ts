/**
 * Portfolio service — assembles the dashboard payload from the eToro Public API
 * (or the mock transport), following the portfolio-dashboard pattern in the
 * `etoro-apps` skill and the `etoro-account-snapshot` rule.
 */
import { EtoroClient, type EtoroRequestContext } from './etoro/client.js';
import {
  fetchInstrumentsResilient,
  fetchRates,
} from './etoro/instruments.js';
import {
  buildPositionView,
  collectInstrumentIds,
  computeAccountSummary,
  type AccountSummary,
  type PositionView,
} from './etoro/snapshot.js';
import type {
  EtoroClientPortfolio,
  EtoroEnv,
  EtoroPnlResponse,
} from './etoro/types.js';

export interface DashboardPayload {
  env: EtoroEnv;
  summary: AccountSummary;
  positions: PositionView[];
  copyTraders: { username: string; pnl: number; positionCount: number }[];
  generatedAt: string;
}

export async function buildDashboard(
  client: EtoroClient,
  ctx: EtoroRequestContext,
  env: EtoroEnv,
): Promise<DashboardPayload> {
  const { clientPortfolio } = await client.get<EtoroPnlResponse>(
    `/trading/info/${env}/pnl`,
    ctx,
  );
  return assembleDashboard(client, ctx, env, clientPortfolio);
}

export async function assembleDashboard(
  client: EtoroClient,
  ctx: EtoroRequestContext,
  env: EtoroEnv,
  portfolio: EtoroClientPortfolio,
): Promise<DashboardPayload> {
  const ids = collectInstrumentIds(portfolio);
  const [meta, rates] = await Promise.all([
    fetchInstrumentsResilient(client, ids, ctx),
    fetchRates(client, ids, ctx),
  ]);

  // Manual + copy positions are disjoint in the response; show both.
  const allPositions = [
    ...portfolio.positions,
    ...portfolio.mirrors.flatMap((m) => m.positions),
  ];
  const positions = allPositions
    .map((pos) =>
      buildPositionView(pos, meta.get(pos.instrumentID), rates.get(pos.instrumentID)),
    )
    .sort((a, b) => b.amount - a.amount);

  const copyTraders = portfolio.mirrors.map((m) => ({
    username: m.parentUsername ?? `CID ${m.CID}`,
    pnl:
      m.positions.reduce((acc, p) => acc + (p.unrealizedPnL?.pnL ?? 0), 0) +
      m.closedPositionsNetProfit,
    positionCount: m.positions.length,
  }));

  return {
    env,
    summary: computeAccountSummary(portfolio),
    positions,
    copyTraders,
    generatedAt: new Date().toISOString(),
  };
}
