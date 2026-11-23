// token-radar v7 — the value and farm model.
//
// One sealed snapshot in, one ranked board out. Nothing here names a protocol.
// Every number comes from the snapshot's own fields: tvl_usd, change_7d,
// listed_at, mcap_usd, category, chains, gecko_id and symbol.
//
// The base multiple is not chosen by hand: it is the median market-cap / TVL of
// the trading protocols whose ratio is sane (0.02x..5x). The tokenless-age
// fallback is the median age of the dated pre-token protocols. Both are derived
// afresh from each snapshot, so the dashboard can print the exact arithmetic.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  base_from: number;
  fallback_age_days: number;
  age_from: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_span: number;
  maturity_days: number;
  comparable_cap: number;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  status: 'UPCOMING' | 'TRADING';
  watchlist: boolean;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chips: string[];
  farm_steps: string[];
  farm_total: string;
  farm_horizon: string;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  formula: string;
  assumptions: string[];
  kpi: Record<string, number | string>;
  rows: BoardRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY = 86_400_000;
export const MODEL_VERSION = 'radar-7';

/** Fixed shape of the model; the two calibrated numbers come from the snapshot. */
export const SHAPE = {
  growth_floor: -40,
  growth_cap: 80,
  growth_weight: 0.7,
  maturity_floor: 0.7,
  maturity_span: 0.55,
  maturity_days: 1460,
  ratio_min: 0.02,
  ratio_max: 5,
} as const;

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVED_CATEGORY = /^(Bridge|Canonical Bridge|Liquid Staking|Liquid Restaking|Restaked BTC|CEX)$/i;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Whole days between the snapshot date and DefiLlama's first-tracking day. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY));
}

/** No token is recorded: all three token fields are empty. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The watchlist's own exclusions, applied to the whole snapshot rather than only to the floor. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name) &&
    !DERIVED_CATEGORY.test(p.category ?? '') &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE.test(p.name);
}

/** A trading protocol that can serve as a market-value comparable. */
export function isComparable(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && (p.mcap_usd ?? 0) > 0 && isRankable({ ...p, mcap_usd: null, gecko_id: null, symbol: null });
}

/** The model's two snapshot-derived numbers. */
export function calibrate(snapshot: Snapshot): { base: number; baseFrom: number; fallbackAge: number; ageFrom: number } {
  const ratios = snapshot.protocols
    .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0)
    .map((p) => (p.mcap_usd ?? 0) / p.tvl_usd)
    .filter((r) => r >= SHAPE.ratio_min && r <= SHAPE.ratio_max);
  const ages = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  return {
    base: round4(median(ratios)) || 0.25,
    baseFrom: ratios.length,
    fallbackAge: Math.round(median(ages)) || 365,
    ageFrom: ages.length,
  };
}

/** Growth, maturity and the implied dollar value of one pre-token row. */
export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const usedAge = age ?? model.fallback_age_days;
  const maturityMult = model.maturity_floor + model.maturity_span * Math.sqrt(clamp(usedAge, 0, model.maturity_days) / model.maturity_days);
  const implied = Math.max(1, Math.round(p.tvl_usd * model.base_multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

const money = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its native chain';
}

/** Farm capital follows TVL, not a name: deeper protocols can take a larger position. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2e9) return 250;
  if (p.tvl_usd >= 5e8) return 150;
  if (p.tvl_usd >= 5e7) return 100;
  return 50;
}

/** A younger protocol gets a longer qualifying window. */
function holdFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (/lend|cdp|collateral|reserve|risk curators|allocator/.test(c)) return `Supply $${capital} USDC to ${p.name}'s primary market on ${chain} and keep the receipt.`;
  if (/dex|yield|farm|liquidity|basis/.test(c)) return `Add $${capital} of two-sided liquidity to ${p.name}'s deepest pool on ${chain}.`;
  if (/bridge|chain|canonical/.test(c)) return `Move $${capital} of USDC over ${p.name} to ${chain}, then use it once in the destination app.`;
  if (/stak|restak/.test(c)) return `Stake $${capital} of the chain's native asset through ${p.name} and hold the receipt.`;
  if (/deriv|option|perpetual|synthetic/.test(c)) return `Post $${capital} USDC margin on ${p.name} and open one small hedged position.`;
  if (/prediction/.test(c)) return `Fund $${capital} and take one position on ${p.name}'s longest-running market.`;
  if (/insurance/.test(c)) return `Buy $${capital} of cover from ${p.name} on ${chain} and keep the policy live.`;
  if (/rwa|trade/.test(c)) return `Deposit $${capital} USDC into ${p.name}'s yield product on ${chain}.`;
  return `Deposit $${capital} USDC into ${p.name} on ${chain} and leave the position open.`;
}

/** Six concrete steps with a cost and a duration for every row. */
export function farmSteps(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; total: string; horizon: string } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdFor(age);
  const bridge = /Solana|Base|Arbitrum|Optimism|Avalanche|Polygon|Blast|BSC|BNB/i.test(p.chains.join(' ')) ? 4 : 0;
  const gas = capital >= 150 ? 12 : capital >= 100 ? 9 : 6;
  const total = capital + gas + bridge + 6;
  return {
    steps: [
      { text: `Open a dedicated wallet for ${p.name}; fund it only with the ${money(total)} budget below and store the seed offline.`, cost: `$3 first gas`, time: `5 min` },
      { text: bridge > 0 ? `Bridge $${capital} USDC to ${chain} through a canonical route before using ${p.name}; check the destination address twice.` : `Acquire $${capital} USDC on ${chain}, the first chain ${p.name} reports TVL on.`, cost: `$${bridge} bridge + $2 swap`, time: `10 min` },
      { text: actionFor(p, capital, chain), cost: `$${capital} principal + $${gas} gas`, time: `15 min` },
      { text: `Repeat one small qualifying action each week on ${p.name} — deposit, borrow, swap or vote — so more than one snapshot sees the wallet.`, cost: `$2 gas per week`, time: `10 min / week` },
      { text: `Each Friday, record ${p.name}'s TVL and 7-day change; if TVL falls 30% or the app asks for a new approval, pause the position.`, cost: `no fee`, time: `5 min / week` },
      { text: `At day ${hold}, use only ${p.name}'s own published rewards link to claim, then log the wallet, dates and every transaction.`, cost: `$0 to check; never pay to claim`, time: `20 min` },
    ],
    total: `${money(total)} ($${capital} principal + $${gas} gas + $${bridge} bridge + $6 reserve)`,
    horizon: `${hold}-day hold + ~2.5 h setup`,
  };
}

/** Short, data-derived reasons a reader can scan in the table. */
function chipsFor(p: SnapshotProtocol, age: number | null, growth: number, watch: boolean, implied: number, medianValue: number): string[] {
  const chips: string[] = [];
  if (watch) chips.push('WATCHLIST');
  if (implied >= medianValue * 3) chips.push('TOP SIZE');
  if (growth >= 5) chips.push(`GROWTH +${growth.toFixed(1)}%`);
  else if (growth <= -10) chips.push(`CONTRACTION ${growth.toFixed(1)}%`);
  const years = (age ?? 0) / 365;
  if (years >= 2) chips.push(`TOKENLESS ${years.toFixed(1)}y`);
  else if (age !== null) chips.push(`AGE ${age}d`);
  if (p.chains.length > 1) chips.push(`${p.chains.length} CHAINS`);
  if (p.category) chips.push(p.category.toUpperCase().slice(0, 18));
  return chips.slice(0, 4);
}

const stepText = (s: FarmStep): string => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `${missing.length} watchlist slugs missing`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is wrong`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} breaks value order`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug}: step length`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug}: bad value`;
  }
  return null;
}

/** Build the ranked board and the compact dataset the page renders. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const cal = calibrate(snapshot);
  const watch = new Set(snapshot.watchlist);
  const upcoming = snapshot.protocols.filter(isRankable);

  // The cap is derived from the weakest upcoming row: trading tokens are a
  // reference band, never competitors for the top of the hunt.
  const provisional = upcoming.map((p) => impliedValue(p, snapshot.as_of, {
    base_multiple: cal.base, fallback_age_days: cal.fallbackAge,
    growth_floor: SHAPE.growth_floor, growth_cap: SHAPE.growth_cap, growth_weight: SHAPE.growth_weight,
    maturity_floor: SHAPE.maturity_floor, maturity_span: SHAPE.maturity_span, maturity_days: SHAPE.maturity_days,
    comparable_cap: 0, base_from: cal.baseFrom, age_from: cal.ageFrom,
  }).implied);
  const cap = Math.max(1, Math.floor(Math.min(...provisional) / 2));
  const model: ModelConstants = {
    base_multiple: cal.base,
    base_from: cal.baseFrom,
    fallback_age_days: cal.fallbackAge,
    age_from: cal.ageFrom,
    growth_floor: SHAPE.growth_floor,
    growth_cap: SHAPE.growth_cap,
    growth_weight: SHAPE.growth_weight,
    maturity_floor: SHAPE.maturity_floor,
    maturity_span: SHAPE.maturity_span,
    maturity_days: SHAPE.maturity_days,
    comparable_cap: cap,
  };

  const medianValue = median(provisional);
  const rows: BoardRow[] = [];
  const make = (p: SnapshotProtocol, implied: number, growth: number, growthMult: number, maturityMult: number, age: number | null, status: 'UPCOMING' | 'TRADING'): BoardRow => {
    const plan = farmSteps(p, age);
    return {
      rank: 0, slug: p.slug, name: p.name, status, watchlist: watch.has(p.slug),
      category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
      change_7d: p.change_7d, mcap_usd: p.mcap_usd, listed_at: p.listed_at, age_days: age,
      implied_value_usd: implied,
      growth_pct: round4(growth), growth_multiplier: round4(growthMult), maturity_multiplier: round4(maturityMult),
      chips: status === 'UPCOMING' ? chipsFor(p, age, growth, watch.has(p.slug), implied, medianValue) : ['MARKET CAP / 10k', 'CAPPED', 'TRADING'],
      farm_steps: plan.steps.map(stepText), farm_total: plan.total, farm_horizon: plan.horizon,
    };
  };

  const scored = upcoming.map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  for (const s of scored) rows.push(make(s.p, s.implied, s.growthPct, s.growthMult, s.maturityMult, s.age, 'UPCOMING'));

  const trading = snapshot.protocols.filter(isComparable)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 40);
  for (const p of trading) {
    const comparable = Math.min(model.comparable_cap, Math.max(1, Math.round((p.mcap_usd ?? 0) / 10000)));
    rows.push(make(p, comparable, 0, 1, 1, ageDays(snapshot.as_of, p.listed_at), 'TRADING'));
  }
  rows.forEach((r, i) => { r.rank = i + 1; });

  const upcomingCount = scored.length;
  const tradingTvl = snapshot.protocols.reduce((n, p) => n + p.tvl_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    formula: `implied = TVL × ${model.base_multiple.toFixed(4)} × (1 + clamp(g7, ${model.growth_floor}, +${model.growth_cap}) / 100 × ${model.growth_weight}) × (${model.maturity_floor} + ${model.maturity_span} × √(age / ${model.maturity_days}))`,
    assumptions: [
      `Base ${model.base_multiple.toFixed(4)}× = median mcap/TVL of ${model.baseFrom} trading rows with 0.02×–5× ratios.`,
      `Tokenless age = as_of − listed_at; ${model.fallback_age_days}d fallback = median of ${model.ageFrom} dated pre-token rows.`,
      `Growth clamped to ${model.growth_floor}%..+${model.growth_cap}% so one week cannot dominate.`,
      `Maturity saturates at ${model.maturity_days}d; longer without a token means more accumulated goodwill, never a promise.`,
      `${trading.length} trading comparables are shown at mcap/10k, capped at $${model.comparable_cap.toLocaleString('en-US')}, and never ranked against the hunt.`,
      `No protocol name, ticker or slug enters the score; the same function scores every row.`,
    ],
    kpi: {
      rows: rows.length,
      upcoming: upcomingCount,
      trading: trading.length,
      watchlist: snapshot.watchlist.length,
      watchlist_hit: snapshot.watchlist.filter((s) => rows.some((r) => r.slug === s)).length,
      protocols: snapshot.protocols.length,
      tvl: tradingTvl,
      base: model.base_multiple,
      base_from: model.baseFrom,
      fallback_age: model.fallback_age_days,
      cap: model.comparable_cap,
      median_implied: Math.round(medianValue),
    },
    rows,
  };
  return { board: rows, radar };
}

/** The snapshot's shape, checked before a single row is scored. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('no floor_usd');
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new SnapshotError('no protocols or watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocol ${i} is incomplete`);
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** One compact script, read by the page through ../data.js. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
