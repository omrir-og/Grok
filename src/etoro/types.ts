/**
 * eToro Public API wire types.
 *
 * Per the `etoro-api-conventions` rule, identifier-field casing varies by
 * endpoint and responses are returned verbatim. Each type below mirrors the
 * casing of the endpoint it comes from — capital-suffix (`instrumentID`) for
 * the PnL / instruments endpoints, lowerCamel (`instrumentId`) for search.
 * Do not "normalize" these at the deserialization layer.
 */

/** Nested unrealized-PnL object on a per-position field. Inner key is `pnL`. */
export interface UnrealizedPnL {
  pnL: number;
}

/** A single open position from `/trading/info/{env}/pnl`. */
export interface EtoroPosition {
  positionID: number;
  instrumentID: number;
  mirrorID: number;
  parentPositionID?: number;
  /** USD margin committed (see account-snapshot rule §3). */
  amount: number;
  /** Underlying exposure size in shares/contracts. */
  units: number;
  /** Entry price in the instrument's NATIVE currency (rule §2). */
  openRate: number;
  leverage: number;
  isBuy: boolean;
  /** `actual_fees − dividends_received`, not separable (rule §4). */
  totalFees?: number;
  unrealizedPnL?: UnrealizedPnL;
}

/** A copy-trading mirror grouping (rule §5). */
export interface EtoroMirror {
  mirrorID: number;
  CID: number;
  parentUsername?: string;
  availableAmount: number;
  closedPositionsNetProfit: number;
  positions: EtoroPosition[];
}

/** A pending order (already reserved cash). */
export interface EtoroOrder {
  orderID: number;
  instrumentID: number;
  mirrorID: number;
  amount: number;
  totalExternalCosts?: number;
}

export interface EtoroClientPortfolio {
  credit: number;
  unrealizedPnL?: number;
  positions: EtoroPosition[];
  mirrors: EtoroMirror[];
  orders: EtoroOrder[];
  ordersForOpen: EtoroOrder[];
}

export interface EtoroPnlResponse {
  clientPortfolio: EtoroClientPortfolio;
}

/** Instrument image variant from `/market-data/instruments`. */
export interface EtoroInstrumentImage {
  uri: string;
  format?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
}

/** Metadata from `/market-data/instruments` (capital `D` in `instrumentID`). */
export interface InstrumentMeta {
  instrumentID: number;
  instrumentDisplayName: string;
  symbolFull: string;
  images?: EtoroInstrumentImage[];
}

export interface InstrumentsResponse {
  instrumentDisplayDatas: InstrumentMeta[];
}

/** Live rate from `/market-data/instruments/rates`. */
export interface EtoroRate {
  instrumentID: number;
  ask: number;
  bid: number;
  lastExecution?: number;
}

export interface RatesResponse {
  rates: EtoroRate[];
}

/** Identity from `/api/v1/me` (lowerCamel). */
export interface EtoroMe {
  gcid: number;
  realCid: number;
  demoCid: number;
}

export type EtoroEnv = 'demo' | 'real';
