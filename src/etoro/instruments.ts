/**
 * Instrument resolution / enrichment.
 *
 * Follows the `resolving-etoro-instruments` skill:
 *   - Batch metadata lookups at 25–50 IDs; shrink ONLY on 413/414.
 *   - Serialize the ID list with a literal `,` (never `%2C`) — a raw
 *     `ids.join(',')`, since URLSearchParams would percent-encode the comma.
 *   - Never use `images[0]` unconditionally; select the best variant first.
 */
import type { EtoroClient, EtoroRequestContext } from './client.js';
import { EtoroPayloadTooLargeError } from './errors.js';
import type {
  EtoroInstrumentImage,
  InstrumentMeta,
  InstrumentsResponse,
  RatesResponse,
  EtoroRate,
} from './types.js';

const BATCH_SIZE_LADDER = [50, 25] as const;

export async function fetchInstrumentsResilient(
  client: EtoroClient,
  ids: number[],
  ctx: EtoroRequestContext,
): Promise<Map<number, InstrumentMeta>> {
  const out = new Map<number, InstrumentMeta>();
  const unique = [...new Set(ids)];
  let batchSize: number = BATCH_SIZE_LADDER[0];
  let i = 0;

  while (i < unique.length) {
    const chunk = unique.slice(i, i + batchSize);
    try {
      const data = await client.get<InstrumentsResponse>(
        `/market-data/instruments?instrumentIds=${chunk.join(',')}`,
        ctx,
      );
      for (const item of data.instrumentDisplayDatas) {
        out.set(item.instrumentID, item);
      }
      i += batchSize;
    } catch (err) {
      if (err instanceof EtoroPayloadTooLargeError) {
        const idx = BATCH_SIZE_LADDER.indexOf(batchSize as 50 | 25);
        const next = BATCH_SIZE_LADDER[idx + 1];
        if (next) {
          batchSize = next;
          continue; // retry the SAME chunk, smaller
        }
        console.warn('Instrument batch failed at minimum size:', chunk);
        i += batchSize;
      } else {
        throw err; // 429 / 5xx — let the client's backoff layer own it
      }
    }
  }
  return out;
}

export async function fetchRates(
  client: EtoroClient,
  ids: number[],
  ctx: EtoroRequestContext,
): Promise<Map<number, EtoroRate>> {
  const out = new Map<number, EtoroRate>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const data = await client.get<RatesResponse>(
    `/market-data/instruments/rates?instrumentIds=${unique.join(',')}`,
    ctx,
  );
  for (const r of data.rates) out.set(r.instrumentID, r);
  return out;
}

/** Pick the best image variant — vector card first, else widest PNG. */
export function selectInstrumentImageUrl(
  images: EtoroInstrumentImage[] | undefined,
): string | null {
  if (!images?.length) return null;
  const card = images.find((i) => i.format === 'svg' && i.backgroundColor);
  if (card) return card.uri;
  const pngs = images.filter(
    (i) => i.format === 'png' && typeof i.width === 'number',
  );
  if (pngs.length) {
    return [...pngs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]!.uri;
  }
  return images[0]!.uri;
}
