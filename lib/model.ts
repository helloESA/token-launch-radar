// Token Launch Radar — the valuation and farming model.
//
// One sealed DefiLlama snapshot goes in; one ranked board of pre-token protocols comes out.
// A protocol counts as pre-token when the snapshot records no token for it (both `gecko_id`
// and `symbol` are null). The board ranks every pre-token protocol with at least $10M of TVL,
// which covers the snapshot's whole 40-protocol watchlist (a $50M floor) with room to spare.
//
// Implied value is built only from the snapshot's own figures:
//
//   implied = round( TVL x categoryMultiple x growthMult x maturityMult ), at least 1
//
// - categoryMultiple: live tokens are the yardstick. For every protocol whose token already
//   trades with a recorded, non-zero market cap, take mcap / TVL. The category multiple is
//   that category's median ratio, shrunk toward the global median so thin categories do not
//   shout: mult = (n x medCategory + 4 x medGlobal) / (n + 4). A category with no traded peer
//   (or no category at all) uses the global median itself.
// - growthMult: the 7-day TVL change, clamped to [-50, +100] percent, moves the value by half
//   its size: 1 + (clamp / 100) x 0.5. A missing change counts as flat (x1.0).
// - maturityMult: a protocol that has run longer with no token earns a premium that saturates:
//   0.85 + 0.3 x (1 - exp(-ageDays / 540)), age counted from `listed_at` to the snapshot's
//   `as_of`. A missing listing date counts as neutral (x1.0).
//
// Sorting is implied value descending, then TVL descending, then slug ascending, so two runs
// over the same snapshot write identical bytes. No protocol name is ever special-cased.
// The three components are rounded to 4 decimal places before the multiplication, and the
// board publishes those rounded components, so the printed row always recomputes exactly.

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

/** The board's TVL floor: every pre-token protocol at or above this is ranked. */
export const BOARD_TVL_FLOOR = 10_000_000;

/** How many already-launched peers the dashboard shows as its yardstick panel. */
export const LIVE_PEER_ROWS = 24;

/** One ranked row of board.json, with the model's working shown beside the result. */
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
  multiple: number;
  category_median: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** The same row in the dashboard's data, farm plan included so page and board agree. */
export interface RadarRow {
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
  multiple: number;
  category_median: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: shown with the market's own numbers, never ranked. */
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
  /** The model figures for this peer's category: raw median, peer count, shrunk multiple. */
  category_median: number;
  peer_count: number;
  multiple: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  board_tvl_floor: number;
  global_multiple: number;
  peer_count: number;
  watchlist_size: number;
  board_size: number;
  live_size: number;
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
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** A traded peer: a recorded, non-zero market cap over a positive TVL. */
function isPeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd !== 0 && p.tvl_usd > 0;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The peer yardstick: the global mcap/TVL median and each category's shrunk multiple. */
export interface PeerModel {
  globalMultiple: number;
  peerCount: number;
  /** Per category: its raw median, its peer count and the shrunk multiple rows are scored with. */
  byCategory: Map<string, { median: number; count: number; multiple: number }>;
}

/** Derive the multiples from the snapshot's traded protocols; nothing is hardcoded. */
export function peerModel(snapshot: Snapshot): PeerModel {
  const peers = snapshot.protocols.filter(isPeer);
  const globalMultiple = median(peers.map((p) => p.mcap_usd! / p.tvl_usd));
  const ratiosByCategory = new Map<string, number[]>();
  for (const p of peers) {
    if (p.category === null) continue;
    const list = ratiosByCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    ratiosByCategory.set(p.category, list);
  }
  const byCategory = new Map<string, { median: number; count: number; multiple: number }>();
  for (const [category, ratios] of ratiosByCategory) {
    const med = median(ratios);
    const n = ratios.length;
    byCategory.set(category, { median: med, count: n, multiple: (n * med + 4 * globalMultiple) / (n + 4) });
  }
  return { globalMultiple, peerCount: peers.length, byCategory };
}

/** The multiple one protocol is scored with, and the evidence behind it. */
function multipleFor(p: SnapshotProtocol, peers: PeerModel): { multiple: number; categoryMedian: number; peerCount: number } {
  if (p.category !== null) {
    const entry = peers.byCategory.get(p.category);
    if (entry !== undefined) return { multiple: entry.multiple, categoryMedian: entry.median, peerCount: entry.count };
  }
  return { multiple: peers.globalMultiple, categoryMedian: peers.globalMultiple, peerCount: peers.peerCount };
}

/** The growth multiplier: half the clamped 7-day change; a missing change is flat. */
export function growthMultiplier(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  const clamped = Math.min(100, Math.max(-50, change7d));
  return 1 + (clamped / 100) * 0.5;
}

/** The maturity multiplier: 0.85 for a brand-new listing, saturating toward 1.15 with age. */
export function maturityMultiplier(age: number | null): number {
  if (age === null) return 1;
  return 0.85 + 0.3 * (1 - Math.exp(-age / 540));
}

/** Score every board protocol and rank the results. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const peers = peerModel(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p) && p.tvl_usd >= BOARD_TVL_FLOOR)
    .map((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      const mult = multipleFor(p, peers);
      // The published components are rounded to 4 places, and the implied value is computed
      // FROM those rounded components, so a reader (or the dashboard) recomputing a row from
      // the numbers the board itself prints lands on the board's figure exactly.
      const multiple = round4(mult.multiple);
      const growth = round4(growthMultiplier(p.change_7d));
      const maturity = round4(maturityMultiplier(age));
      const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity));
      return { p, age, mult, multiple, growth, maturity, implied };
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
    multiple: s.multiple,
    category_median: round4(s.mult.categoryMedian),
    peer_count: s.mult.peerCount,
    growth_multiplier: s.growth,
    maturity_multiplier: s.maturity,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The largest already-launched protocols, by market cap: the peer yardstick panel.
 *  Each carries its category's model figures, so a peer's own page can show exactly
 *  how it feeds the multiples the board is scored with. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const peers = peerModel(snapshot);
  return snapshot.protocols
    .filter(isPeer)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_PEER_ROWS)
    .map((p) => {
      const mult = multipleFor(p, peers);
      return {
        slug: p.slug,
        name: p.name,
        symbol: p.symbol,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        ratio: round4(p.mcap_usd! / p.tvl_usd),
        change_7d: p.change_7d,
        category_median: round4(mult.categoryMedian),
        peer_count: mult.peerCount,
        multiple: round4(mult.multiple),
      };
    });
}

/** Board plus dashboard data, from one pass over the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const peers = peerModel(snapshot);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    board_tvl_floor: BOARD_TVL_FLOOR,
    global_multiple: round4(peers.globalMultiple),
    peer_count: peers.peerCount,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map((r) => ({ ...r })),
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

/** Working capital for one farm position: 0.1% of TVL, kept between $100 and $2,500. */
function capitalFor(tvl: number): number {
  const raw = Math.round((tvl * 0.001) / 10) * 10;
  return Math.min(2500, Math.max(100, raw));
}

/** How many weeks a position should be kept active, from the protocol's age. */
function holdWeeksFor(age: number | null): number {
  if (age === null) return 6;
  if (age < 180) return 8;
  if (age < 540) return 6;
  return 4;
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
 * Every figure comes from the row itself (main chain, TVL-scaled capital, age-scaled hold);
 * the protocol's name is inserted from its record, never written into a template by hand.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
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
