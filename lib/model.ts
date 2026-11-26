// Debut Radar — the valuation and farming model.
//
// One sealed DefiLlama snapshot goes in; one ranked board of pre-token protocols comes out.
// A protocol counts as pre-token when the snapshot records no token for it (both `gecko_id`
// and `symbol` are null). The board ranks the pre-token protocols a farmer could actually
// work: infrastructure categories whose token, if one ever exists, is not farmed from the
// protocol itself — exchanges, bridges, liquid staking and restaking, wrapped and pooled
// asset forms — are set aside by rule and accounted for, not ranked. The snapshot's own
// 40-protocol watchlist is always ranked in full, exceptions included, so coverage of the
// bounty list never depends on a category call.
//
// Implied value is built only from the snapshot's own figures, in two fitted parts:
//
//   implied = launch value x token odds
//
// - launch value: what a token would be worth if it launched. A power law is fitted by
//   least squares to the traded comparables (tokens recorded with a usable market cap,
//   outside the set-aside categories): ln(market cap) = intercept + slope x ln(TVL).
//   A row's range is that curve read through the middle 80% of the fit's own out-of-sample
//   residuals, so the band is the model's measured error, not a decoration.
// - token odds: the share of like protocols that record a token, fitted by logistic
//   regression on every dated protocol in the snapshot (645 of them) over three terms —
//   years on record, the category's own token rate, and size (ln TVL). Fitted on the
//   peers' record, published with its out-of-sample Brier scores; it never claims a
//   named protocol will launch, only how its kind has done.
//
// Farm verdicts come from one printed scenario, the same for every row: a launch drops
// 7% of the implied value to users, a plan stakes 0.02% of the protocol's TVL (kept
// between $1,000 and $20,000), and the plan's own gas and budget — the same constants
// its steps are written with — are charged against the expected drop. FARM when the
// net pays at least $25 an hour of the plan's work, THIN when it merely pays, SKIP
// when the fees eat it. The scenario is an assumption and is labelled one on the page.
//
// Sorting is implied value descending, then TVL descending, then slug ascending, so two
// runs over the same snapshot write identical bytes. No protocol name is special-cased.
// The published components (launch value in whole dollars, odds to 4 places) are what
// the implied value is computed from, so a reader recomputing a row lands exactly.

/** One protocol record: exactly the ten fields the sealed snapshot carries. */
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

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Categories set aside by rule: infrastructure that is accounted for, not ranked. */
export const SET_ASIDE_CATEGORIES: ReadonlySet<string> = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaking',
  'Staking Pool',
  'Anchor BTC',
  'Decentralized BTC',
  'Restaked BTC',
  'Stablecoin Wrapper',
  'Dual-Token Stablecoin',
]);

/** The set-aside rule in four named buckets, for the coverage accounting. */
export const SET_ASIDE_BUCKETS: Array<{ label: string; categories: string[] }> = [
  { label: 'Exchange custody', categories: ['CEX'] },
  { label: 'Bridges', categories: ['Bridge', 'Canonical Bridge'] },
  { label: 'Liquid staking & restaking', categories: ['Liquid Staking', 'Liquid Restaking', 'Restaking'] },
  { label: 'Wrapped & pooled forms', categories: ['Staking Pool', 'Anchor BTC', 'Decentralized BTC', 'Restaked BTC', 'Stablecoin Wrapper', 'Dual-Token Stablecoin'] },
];

/** The farm scenario, identical for every row and printed on the dashboard. */
export const DROP_SHARE = 0.07;
export const PLAN_TVL_SHARE = 0.0002;
export const PLAN_MIN_USD = 1000;
export const PLAN_MAX_USD = 20000;
export const FARM_PER_HOUR_USD = 25;

/** How many already-launched comparables the dashboard shows in its yardstick panel. */
export const LIVE_PEER_ROWS = 24;

/** One ranked row of board.json: the two fitted components shown beside the result. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  watchlist: boolean;
  /** What the fitted curve prices this protocol's token at, if it launches. */
  launch_value_usd: number;
  /** The fitted share of like protocols that record a token, 0-1 to 4 places. */
  odds: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** The same row in the dashboard's data: the range and the farm scenario's verdict. */
export interface RadarRow extends BoardRow {
  implied_lo_usd: number;
  implied_hi_usd: number;
  plan_usd: number;
  expected_drop_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  farm_net_usd: number;
  farm_per_hour: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A traded comparable: shown with the market's own numbers, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  change_7d: number | null;
  /** What the fitted curve reads at this comparable's own TVL. */
  curve_value_usd: number;
}

/** The out-of-sample report card, computed by the same run that writes the board. */
export interface Validation {
  comps: number;
  dated_comps: number;
  /** Walk-forward on dated comps: fit the older half, price the newer half. */
  wf_miss: number;
  wf_flat_miss: number;
  /** Leave-one-out on the same dated comps. */
  loo_miss: number;
  loo_flat_miss: number;
  /** Measured coverage of the printed bands, from all comps' out-of-sample residuals. */
  range50_pct: number;
  range80_pct: number;
  odds_peers: number;
  odds_brier: number;
  odds_brier_wf: number;
  odds_base_brier: number;
  odds_base_brier_wf: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  board_size: number;
  snapshot_size: number;
  tokened_size: number;
  set_aside_size: number;
  set_aside_buckets: Array<{ label: string; count: number }>;
  comps: number;
  /** The fitted curve: market cap = exp(intercept) x TVL ^ slope. */
  fit: { intercept: number; slope: number; at_100m_usd: number };
  odds_peers: number;
  odds_base_rate: number;
  /** The record behind the odds: dated peers by age band and their token rate. */
  age_bands: Array<{ label: string; peers: number; token_pct: number }>;
  scenario: { drop_share_pct: number; plan_share_pct: number; plan_min_usd: number; plan_max_usd: number; farm_per_hour_usd: number };
  integrity: { rows: number; total_implied_usd: number; ledger: number };
  validation: Validation;
  /** Every comparable as a [tvl_usd, mcap_usd] pair, for the yardstick scatter. */
  peer_points: Array<[number, number]>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot cannot be scored by this model. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Whole days from `listedAt` to `asOf`, never negative; null when a date is missing or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** A protocol records no token when both token fields are null. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** A traded comparable: usable market cap over positive TVL, outside the set-aside rule. */
function isComp(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !(p.category !== null && SET_ASIDE_CATEGORIES.has(p.category));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A percentile of a non-empty list by nearest rank on the sorted values. */
function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** Median fold-miss of predicted against actual values. */
function medianMiss(pairs: Array<{ pred: number; actual: number }>): number {
  return Math.round(median(pairs.map(({ pred, actual }) => Math.max(pred / actual, actual / pred))) * 100) / 100;
}

// ------------------------------------------------------------------ the value fit

/** Least squares of ln(market cap) on ln(TVL): the launch-value curve. */
function fitPowerLaw(comps: SnapshotProtocol[]): { intercept: number; slope: number } {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = comps.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = den > 0 ? num / den : 0;
  return { intercept: my - slope * mx, slope };
}

function curveAt(fit: { intercept: number; slope: number }, tvl: number): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(Math.max(tvl, 1)));
}

/** Out-of-sample log residuals of the curve, one per comparable, each fitted without it. */
function looResiduals(comps: SnapshotProtocol[]): number[] {
  return comps.map((self, i) => {
    const fit = fitPowerLaw(comps.filter((_, j) => j !== i));
    return Math.log(self.mcap_usd!) - Math.log(curveAt(fit, self.tvl_usd));
  });
}

// ------------------------------------------------------------------ the odds fit

/** Everything the odds fit needs from the snapshot, computed once. */
interface OddsContext {
  /** Per category: the share of its protocols that record a token. */
  catShare: Map<string, number>;
  globalRate: number;
  /** Median age in years of the dated protocols: the fallback for undated rows. */
  medianAgeYears: number;
  dated: SnapshotProtocol[];
}

function oddsContext(snapshot: Snapshot): OddsContext {
  const totals = new Map<string, number>();
  const tokened = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (p.category === null) continue;
    totals.set(p.category, (totals.get(p.category) ?? 0) + 1);
    if (!isPreToken(p)) tokened.set(p.category, (tokened.get(p.category) ?? 0) + 1);
  }
  const catShare = new Map<string, number>();
  for (const [cat, n] of totals) catShare.set(cat, (tokened.get(cat) ?? 0) / n);
  const dated = snapshot.protocols.filter((p) => p.listed_at !== null);
  const ages = dated.map((p) => ageDays(snapshot.as_of, p.listed_at)! / YEAR_DAYS);
  return {
    catShare,
    globalRate: snapshot.protocols.filter((p) => !isPreToken(p)).length / snapshot.protocols.length,
    medianAgeYears: median(ages),
    dated,
  };
}

/** The odds feature vector: years on record (capped), the category's token rate, size. */
function oddsFeatures(p: SnapshotProtocol, asOf: string, ctx: OddsContext): number[] {
  const age = ageDays(asOf, p.listed_at);
  const years = age === null ? ctx.medianAgeYears : Math.min(age / YEAR_DAYS, 8);
  const share = p.category !== null ? (ctx.catShare.get(p.category) ?? ctx.globalRate) : ctx.globalRate;
  const size = Math.log(Math.max(p.tvl_usd, 100_000)) - Math.log(100_000_000);
  return [1, years, share, size];
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Logistic regression by Newton iterations on the dated protocols. Deterministic. */
function fitOdds(rows: SnapshotProtocol[], asOf: string, ctx: OddsContext): number[] {
  const X = rows.map((p) => oddsFeatures(p, asOf, ctx));
  const y = rows.map((p) => (isPreToken(p) ? 0 : 1));
  const k = 4;
  const beta = [ -1, 0, 0, 0 ];
  for (let iter = 0; iter < 60; iter++) {
    const g = new Array<number>(k).fill(0);
    const H = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < X.length; i++) {
      const xi = X[i]!;
      const pr = sigmoid(xi.reduce((s, v, j) => s + v * beta[j]!, 0));
      const w = Math.max(pr * (1 - pr), 1e-6);
      for (let r = 0; r < k; r++) {
        g[r]! += xi[r]! * (y[i]! - pr);
        for (let c = 0; c < k; c++) H[r]![c]! += xi[r]! * xi[c]! * w;
      }
    }
    for (let i = 0; i < k; i++) H[i]![i]! += 1e-6;
    // Solve H d = g by Gaussian elimination with partial pivoting.
    const M = H.map((row, i) => [...row, g[i]!]);
    for (let c = 0; c < k; c++) {
      let piv = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
      [M[c], M[piv]] = [M[piv]!, M[c]!];
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = M[r]![c]! / M[c]![c]!;
        for (let cc = c; cc <= k; cc++) M[r]![cc]! -= f * M[c]![cc]!;
      }
    }
    let maxStep = 0;
    for (let i = 0; i < k; i++) {
      const d = M[i]![k]! / M[i]![i]!;
      beta[i]! += d;
      maxStep = Math.max(maxStep, Math.abs(d));
    }
    if (maxStep < 1e-7) break;
  }
  return beta;
}

function oddsFor(beta: number[], p: SnapshotProtocol, asOf: string, ctx: OddsContext): number {
  const x = oddsFeatures(p, asOf, ctx);
  return sigmoid(x.reduce((s, v, j) => s + v * beta[j]!, 0));
}

function brier(rows: SnapshotProtocol[], beta: number[], asOf: string, ctx: OddsContext): number {
  const s = rows.reduce((sum, p) => sum + (oddsFor(beta, p, asOf, ctx) - (isPreToken(p) ? 0 : 1)) ** 2, 0);
  return Math.round((s / rows.length) * 1000) / 1000;
}

function baseBrier(rows: SnapshotProtocol[]): number {
  const rate = rows.filter((p) => !isPreToken(p)).length / rows.length;
  const s = rows.reduce((sum, p) => sum + (rate - (isPreToken(p) ? 0 : 1)) ** 2, 0);
  return Math.round((s / rows.length) * 1000) / 1000;
}

// ------------------------------------------------------------------ validation

/** The model's report card, every figure computed out of sample on the snapshot itself.
 *  Value tests run on the dated comparables (the walk-forward needs listing dates);
 *  band coverage is measured on all comparables' leave-one-out residuals; the odds
 *  are scored by 10-fold cross-validation and by the same older-to-newer split. */
export function validateModel(snapshot: Snapshot, ctx: OddsContext): Validation {
  const comps = snapshot.protocols.filter(isComp);
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const older = dated.slice(0, half);
  const newer = dated.slice(half);
  const wfFit = fitPowerLaw(older);
  const wfFlat = median(older.map((p) => p.mcap_usd! / p.tvl_usd));
  const wfMiss = medianMiss(newer.map((p) => ({ pred: curveAt(wfFit, p.tvl_usd), actual: p.mcap_usd! })));
  const wfFlatMiss = medianMiss(newer.map((p) => ({ pred: wfFlat * p.tvl_usd, actual: p.mcap_usd! })));
  const looMiss = medianMiss(
    dated.map((self, i) => {
      const fit = fitPowerLaw(dated.filter((_, j) => j !== i));
      return { pred: curveAt(fit, self.tvl_usd), actual: self.mcap_usd! };
    }),
  );
  const looFlatMiss = medianMiss(
    dated.map((self, i) => {
      const flat = median(dated.filter((_, j) => j !== i).map((p) => p.mcap_usd! / p.tvl_usd));
      return { pred: flat * self.tvl_usd, actual: self.mcap_usd! };
    }),
  );
  const residuals = looResiduals(comps);
  const cover = (lo: number, hi: number): number => Math.round((residuals.filter((r) => r >= lo && r <= hi).length / residuals.length) * 100);
  const range50 = cover(percentile(residuals, 0.25), percentile(residuals, 0.75));
  const range80 = cover(percentile(residuals, 0.1), percentile(residuals, 0.9));
  // Odds: 10-fold cross-validation over the dated protocols, folds by position.
  const all = ctx.dated;
  let foldSq = 0;
  for (let f = 0; f < 10; f++) {
    const train = all.filter((_, i) => i % 10 !== f);
    const test = all.filter((_, i) => i % 10 === f);
    const beta = fitOdds(train, snapshot.as_of, ctx);
    for (const p of test) foldSq += (oddsFor(beta, p, snapshot.as_of, ctx) - (isPreToken(p) ? 0 : 1)) ** 2;
  }
  const sortedAll = [...all].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const oHalf = Math.floor(sortedAll.length / 2);
  const wfBeta = fitOdds(sortedAll.slice(0, oHalf), snapshot.as_of, ctx);
  return {
    comps: comps.length,
    dated_comps: dated.length,
    wf_miss: wfMiss,
    wf_flat_miss: wfFlatMiss,
    loo_miss: looMiss,
    loo_flat_miss: looFlatMiss,
    range50_pct: range50,
    range80_pct: range80,
    odds_peers: all.length,
    odds_brier: Math.round((foldSq / all.length) * 1000) / 1000,
    odds_brier_wf: brier(sortedAll.slice(oHalf), wfBeta, snapshot.as_of, ctx),
    odds_base_brier: baseBrier(all),
    odds_base_brier_wf: baseBrier(sortedAll.slice(oHalf)),
  };
}

// ------------------------------------------------------------------ the board

/** Score every board protocol and rank the results. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const comps = snapshot.protocols.filter(isComp);
  const fit = fitPowerLaw(comps);
  const ctx = oddsContext(snapshot);
  const beta = fitOdds(ctx.dated, snapshot.as_of, ctx);
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p) && (!(p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) || watchlist.has(p.slug)))
    .map((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      const launch = Math.max(1, Math.round(curveAt(fit, p.tvl_usd)));
      const odds = round4(oddsFor(beta, p, snapshot.as_of, ctx));
      const implied = Math.max(1, Math.round(launch * odds));
      return { p, age, launch, odds, implied };
    });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    age_days: s.age,
    listed_at: s.p.listed_at,
    watchlist: watchlist.has(s.p.slug),
    launch_value_usd: s.launch,
    odds: s.odds,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The largest traded comparables, by market cap: the yardstick panel. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const comps = snapshot.protocols.filter(isComp);
  const fit = fitPowerLaw(comps);
  return comps
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_PEER_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: round4(p.mcap_usd! / p.tvl_usd),
      change_7d: p.change_7d,
      curve_value_usd: Math.round(curveAt(fit, p.tvl_usd)),
    }));
}

/** Board plus dashboard data, from one pass over the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = snapshot.protocols.filter(isComp);
  const fit = fitPowerLaw(comps);
  const ctx = oddsContext(snapshot);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const check = validateModel(snapshot, ctx);
  const residuals = looResiduals(comps);
  const bandLo = Math.exp(percentile(residuals, 0.1));
  const bandHi = Math.exp(percentile(residuals, 0.9));
  const pre = snapshot.protocols.filter(isPreToken);
  const watchlist = new Set(snapshot.watchlist);
  const setAside = pre.filter((p) => p.category !== null && SET_ASIDE_CATEGORIES.has(p.category) && !watchlist.has(p.slug));
  const buckets = SET_ASIDE_BUCKETS.map((b) => ({
    label: b.label,
    count: setAside.filter((p) => p.category !== null && b.categories.includes(p.category)).length,
  }));
  const bandDefs: Array<{ label: string; lo: number; hi: number }> = [
    { label: 'under 1 yr', lo: 0, hi: 1 },
    { label: '1-2 yr', lo: 1, hi: 2 },
    { label: '2-3 yr', lo: 2, hi: 3 },
    { label: '3+ yr', lo: 3, hi: Number.POSITIVE_INFINITY },
  ];
  const ageBands = bandDefs.map((b) => {
    const rows = ctx.dated.filter((p) => {
      const y = ageDays(snapshot.as_of, p.listed_at)! / YEAR_DAYS;
      return y >= b.lo && y < b.hi;
    });
    return { label: b.label, peers: rows.length, token_pct: Math.round((rows.filter((p) => !isPreToken(p)).length / Math.max(1, rows.length)) * 100) };
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    snapshot_size: snapshot.protocols.length,
    tokened_size: snapshot.protocols.length - pre.length,
    set_aside_size: setAside.length,
    set_aside_buckets: buckets,
    comps: comps.length,
    fit: { intercept: round4(fit.intercept), slope: round4(fit.slope), at_100m_usd: Math.round(curveAt(fit, 100_000_000)) },
    odds_peers: ctx.dated.length,
    odds_base_rate: round4(ctx.dated.filter((p) => !isPreToken(p)).length / ctx.dated.length),
    age_bands: ageBands,
    scenario: {
      drop_share_pct: Math.round(DROP_SHARE * 100),
      plan_share_pct: PLAN_TVL_SHARE * 100,
      plan_min_usd: PLAN_MIN_USD,
      plan_max_usd: PLAN_MAX_USD,
      farm_per_hour_usd: FARM_PER_HOUR_USD,
    },
    integrity: {
      rows: board.length,
      total_implied_usd: board.reduce((s, r) => s + r.implied_value_usd, 0),
      ledger: snapshot.protocols.length,
    },
    validation: check,
    peer_points: comps.map((p): [number, number] => [p.tvl_usd, p.mcap_usd!]),
    rows: board.map((r) => {
      const econ = farmEconomics(r, r.age_days, r.implied_value_usd);
      return {
        ...r,
        implied_lo_usd: Math.max(1, Math.round(r.launch_value_usd * bandLo * r.odds)),
        implied_hi_usd: Math.max(1, Math.round(r.launch_value_usd * bandHi * r.odds)),
        plan_usd: econ.planUsd,
        expected_drop_usd: econ.expectedDropUsd,
        farm_cost_usd: econ.costUsd,
        farm_hours: econ.hours,
        farm_net_usd: econ.netUsd,
        farm_per_hour: econ.perHour,
        verdict: econ.verdict,
      };
    }),
    live,
  };
  return { board, radar };
}

// ------------------------------------------------------------------ farm plans

/** Typical gas for one transaction on a chain, as a plain cost phrase. */
function gasFor(chain: string): string {
  switch (chain) {
    case 'Ethereum':
      return '$4-12 in gas per transaction';
    case 'Solana':
      return 'under $0.05 in gas per transaction';
    case 'Base':
    case 'Arbitrum':
      return '$0.05-0.30 in gas per transaction';
    case 'Binance':
      return '$0.10-0.50 in gas per transaction';
    default:
      return '$0.10-1.00 in gas per transaction';
  }
}

/** A mid estimate of one transaction's gas on a chain, for routine-cost totals. */
function gasMidFor(chain: string): number {
  switch (chain) {
    case 'Ethereum':
      return 8;
    case 'Solana':
      return 0.05;
    case 'Base':
    case 'Arbitrum':
      return 0.2;
    case 'Binance':
      return 0.3;
    default:
      return 0.5;
  }
}

/** The scenario's plan size for one protocol: 0.02% of its TVL, kept $1,000-$20,000. */
export function planFor(tvl: number): number {
  const raw = Math.round((tvl * PLAN_TVL_SHARE) / 10) * 10;
  return Math.min(PLAN_MAX_USD, Math.max(PLAN_MIN_USD, raw));
}

/** How many weeks a position should be kept active, from the protocol's age. */
function holdWeeksFor(age: number | null): number {
  if (age === null) return 6;
  if (age < 180) return 8;
  if (age < 540) return 6;
  return 4;
}

/** The farm scenario worked out for one row: the plan's expected share of the printed
 *  drop, minus the plan's own gas and budget (the $15 spare budget the first step
 *  names, opening and deepening gas, the weekly routine at 3 transactions a week),
 *  over the hours its steps ask for (10 + 25 + 15 minutes, then 15 a week). */
export function farmEconomics(
  p: { chains: string[]; tvl_usd: number },
  age: number | null,
  implied: number,
): { planUsd: number; expectedDropUsd: number; costUsd: number; hours: number; netUsd: number; perHour: number; verdict: 'FARM' | 'THIN' | 'SKIP' } {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasMidFor(chain);
  const weeks = holdWeeksFor(age);
  const plan = planFor(p.tvl_usd);
  const expected = (implied * DROP_SHARE * plan) / Math.max(p.tvl_usd, 1);
  const cost = 15 + gas * (2 + 3 * weeks);
  const hours = (50 + 15 * weeks) / 60;
  const net = expected - cost;
  const perHour = net / hours;
  const verdict = perHour >= FARM_PER_HOUR_USD ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    planUsd: plan,
    expectedDropUsd: Math.round(expected),
    costUsd: Math.round(cost),
    hours: Math.round(hours * 10) / 10,
    netUsd: Math.round(net),
    perHour: round2(perHour),
    verdict,
  };
}

interface Playbook {
  open: string;
  deepen: string;
  routine: string;
}

/** The category playbooks: the concrete first move, the second move, and the weekly routine. */
function playbookFor(category: string | null): Playbook {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex'))
    return {
      open: 'Swap {cap} of USDC for the main pair asset and add it as liquidity in the deepest pool',
      deepen: 'Widen the position: add a second, smaller liquidity tranche in the next pool and claim any trading fees weekly',
      routine: 'Make 2-3 swaps a week through the main pool so the wallet shows real trading volume, not one deposit',
    };
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncol'))
    return {
      open: 'Supply {cap} of USDC as collateral and borrow a small amount (under 40% of the limit) against it',
      deepen: 'Repay and re-borrow once, then leave both the supply and a modest open borrow in place',
      routine: 'Adjust collateral once a week to keep the health factor comfortably above 1.5 and avoid liquidation',
    };
  if (c.includes('bridge'))
    return {
      open: 'Bridge {cap} of USDC to the destination chain and use the bridged funds in one app there the same day',
      deepen: 'Bridge a second, smaller amount back the following week so both directions appear in the history',
      routine: 'Route one real transfer a week through the bridge instead of a cheaper route, and keep the receipts',
    };
  if (c.includes('staking') || c.includes('restak'))
    return {
      open: 'Stake {cap} worth of the chain asset and keep the liquid receipt token in the same wallet',
      deepen: 'Restake or delegate the receipt once, choosing a second operator so the position is not a single deposit',
      routine: 'Claim and re-stake rewards every week; an untouched position reads as parked, not active',
    };
  if (c.includes('deriv') || c.includes('perpetual') || c.includes('options') || c.includes('synthetic'))
    return {
      open: 'Deposit {cap} of USDC as margin and open one small hedged position (long spot elsewhere, short here)',
      deepen: 'Roll the hedge once and trade a second instrument so volume is spread across markets',
      routine: 'Trade 2-3 small hedged positions a week and keep total leverage under 2x so margin survives volatility',
    };
  if (c.includes('rwa') || c.includes('stable') || c.includes('algo') || c.includes('reserve'))
    return {
      open: 'Mint or deposit {cap} of the yield-bearing asset and hold it in the farming wallet',
      deepen: 'Use the yield asset once as collateral or in a paired pool, if the protocol supports it, to add a second touchpoint',
      routine: 'Top up by a small fixed amount each week and claim yield on schedule rather than in one lump',
    };
  if (c.includes('yield') || c.includes('farm') || c.includes('allocator') || c.includes('curator') || c.includes('liquidity'))
    return {
      open: 'Deposit {cap} of USDC into the flagship vault or strategy and keep the vault shares in the wallet',
      deepen: 'Split a second tranche into a different vault or strategy so activity spans more than one product',
      routine: 'Harvest and re-deposit rewards once a week, and rebalance if one vault grows past 70% of the position',
    };
  if (c.includes('prediction'))
    return {
      open: 'Fund the account with {cap} of USDC and take small positions in three liquid markets',
      deepen: 'Trade both sides of one market over time as prices move, building genuine two-sided volume',
      routine: 'Place 3-4 trades a week across different markets and settle every position you open',
    };
  if (c.includes('insurance'))
    return {
      open: 'Buy {cap} of cover on a position you actually hold, or stake into the underwriting pool',
      deepen: 'Renew the cover once before it lapses so coverage is continuous across snapshots',
      routine: 'Check the cover weekly and vote in any governance poll the protocol opens to holders',
    };
  if (c.includes('nft') || c.includes('gaming') || c.includes('game'))
    return {
      open: 'Spend up to {cap} across the marketplace or in-app economy: one primary purchase plus fees',
      deepen: 'List, lend or use the asset once in the product itself so the wallet shows usage, not just buying',
      routine: 'Make 2-3 small in-product transactions a week and keep the main asset in the wallet',
    };
  if (c.includes('launchpad') || c.includes('index') || c.includes('locker') || c.includes('payment') || c.includes('card'))
    return {
      open: 'Complete the product core action with {cap} of USDC: join, mint the index, lock or pay, as the product defines it',
      deepen: 'Repeat the core action at a smaller size in a second product line the protocol offers',
      routine: 'Use the product 2-3 times a week for real tasks and keep proof of each use in the farm log',
    };
  return {
    open: 'Deposit {cap} of USDC into the protocol main product and keep the position open',
    deepen: 'Add a second, smaller position in another product line or market the protocol offers',
    routine: 'Make 2-3 qualifying transactions a week (deposit, swap, vote or claim) so activity is continuous',
  };
}

/**
 * One protocol's farm plan: five steps, each naming the action, its cost and its time.
 * The position size is the scenario's plan for this row (0.02% of TVL, $1,000-$20,000),
 * so the steps and the verdict are the same plan. The protocol's name is inserted
 * from its record, never written into a template by hand.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const capital = planFor(p.tvl_usd);
  const cap = `$${capital.toLocaleString('en-US')}`;
  const weeks = holdWeeksFor(age);
  const routineTotal = 3 * gasMidFor(chain) * weeks;
  const routineCost = routineTotal < 1 ? 'under $1' : `$${Math.round(routineTotal).toLocaleString('en-US')}`;
  const book = playbookFor(p.category);
  const fill = (text: string): string => text.replaceAll('{cap}', cap);
  const steps = [
    `Set up a dedicated wallet for ${p.name} and fund it on ${chain} with ${cap} plus gas money. Cost: ${gas}, about $10-20 of spare gas budget. Time: 10 minutes.`,
    `${fill(book.open)} on ${chain} through ${p.name}. Cost: ${cap} of working capital plus ${gas}. Time: 20-30 minutes including approvals.`,
    `${fill(book.deepen)}. Cost: about 25% of the first position (roughly $${Math.round(capital / 4).toLocaleString('en-US')}) plus ${gas}. Time: 15 minutes in week two.`,
    `${fill(book.routine)} for ${weeks} weeks. Cost: ${gas}; at about 3 transactions a week the routine totals roughly ${routineCost} in gas. Time: 10 minutes a week for ${weeks} weeks.`,
    `Track ${p.name} official announcements and points page weekly; if a token or claim is announced, act only from the link the protocol itself publishes. Cost: $0 to monitor, never pay a third party to claim. Time: 5 minutes a week.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

// ------------------------------------------------------------------ snapshot in, checks

/** The snapshot out of a file's text, refused unless it has the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
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

/** Why a board fails the gate, or null: size, coverage, ranks, value order, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  for (const r of board) {
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${i} carries rank ${r.rank}`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} trimmed characters`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  return null;
}

/** The dashboard's data as one script: window.RADAR, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
