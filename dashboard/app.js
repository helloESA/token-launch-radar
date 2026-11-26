// Debut Radar dashboard over window.RADAR. No network.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', chain: 'all', category: 'all', wl: false, sort: 'value', selected: null, page: 1, pageSize: 100, view: 'board', peer: null, theme: 'dark' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y (' + days + 'd)';
    return days + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }
  function chainLabel(chains) {
    var list = chains || [];
    if (list.length === 0) return '—';
    if (list.length <= 2) return list.join(', ');
    return list.slice(0, 2).join(', ') + ' +' + (list.length - 2);
  }
  // The verdict chip.
  function verdictChip(r) {
    var cls = r.verdict === 'FARM' ? 'first' : r.verdict === 'THIN' ? 'farm' : 'skip';
    return el('span', { class: 'sg ' + cls, text: r.verdict });
  }
  // Recompute implied value from the published components.
  function impliedOf(r) {
    return Math.max(1, Math.round(r.launch_value_usd * r.odds));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      if (k === 'checked' && attrs[k]) node.checked = true;
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function readHash() {
    if (!window.location.hash) return;
    var p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (p.get('q')) state.q = p.get('q');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('pg')) state.page = Math.max(1, parseInt(p.get('pg'), 10) || 1);
    if (p.get('view') === 'peers') state.view = 'peers';
    if (p.get('pp')) state.peer = p.get('pp');
    if (p.get('t') === 'light') state.theme = 'light';
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.wl) p.set('wl', '1');
    if (state.sort !== 'value') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    if (!state.selected && state.page > 1) p.set('pg', String(state.page));
    if (!state.selected && state.view === 'peers') p.set('view', 'peers');
    if (state.peer) p.set('pp', state.peer);
    if (state.theme === 'light') p.set('t', 'light');
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }
  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }
  function openPeer(slug) {
    state.peer = slug;
    writeHash();
    render();
    window.scrollTo(0, 0);
  }
  function closePeer() {
    state.peer = null;
    state.view = 'peers';
    writeHash();
    render();
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av !== bv) return bv - av;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('span', { text: 'DEBUT RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('button', { type: 'button', class: 'themebtn', title: 'Switch between dark and light mode',
          onclick: function () { state.theme = state.theme === 'light' ? 'dark' : 'light'; writeHash(); render(); } },
          state.theme === 'light' ? '\u263E Dark mode' : '\u2600 Light mode')));
  }
  // The running headline.
  function ticker() {
    var v = DATA.validation;
    var farms = DATA.rows.filter(function (r) { return r.verdict === 'FARM'; }).length;
    var top = DATA.rows.slice(0, 5).map(function (r) { return r.name + ' ' + fmtUsd(r.implied_value_usd) + ' \u00B7 odds ' + Math.round(r.odds * 100) + '%'; }).join('  \u00B7  ');
    var txt = 'SNAPSHOT ' + DATA.as_of + '  \u00B7  ' + DATA.board_size + ' PROTOCOLS RANKED  \u00B7  TOTAL IMPLIED ' + fmtUsd(DATA.integrity.total_implied_usd) + '  \u00B7  ' + farms + ' FARM VERDICTS  \u00B7  TOP: ' + top + '  \u00B7  CURVE WALK-FORWARD \u00D7' + v.wf_miss + '  \u00B7  ODDS BRIER ' + v.odds_brier + '  \u00B7  WATCHLIST ' + DATA.watchlist_size + '/' + DATA.watchlist_size + '  \u00B7  ';
    return el('div', { class: 'ticker', 'aria-hidden': 'true' },
      el('div', { class: 'ticktrack' }, el('span', { text: txt }), el('span', { text: txt })));
  }
  // The metrics strip.
  function strip() {
    function item(label, value) {
      return el('span', { class: 'strip-item' }, el('span', { class: 'strip-lab', text: label + ':' }), el('b', { class: 'num', text: value }));
    }
    return el('div', null,
      el('div', { class: 'strip' },
        item('Protocols ranked', String(DATA.board_size)),
        item('Comparables fitted', String(DATA.comps)),
        item('Odds fitted on', DATA.odds_peers + ' dated protocols'),
        item('Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size)),
      el('div', { class: 'integrity', text: DATA.integrity.rows + ' of ' + DATA.integrity.rows + ' rows on this page = board.json \u00B7 ranks 1\u2013' + DATA.integrity.rows + ' in order, values never rise \u00B7 total implied ' + fmtUsd(DATA.integrity.total_implied_usd) + ' \u00B7 ledger ' + DATA.integrity.ledger + ' of ' + DATA.integrity.ledger + ' protocols accounted' }));
  }
  function hero() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = 1; });
    });
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', null, 'Tomorrow\u2019s tokens, ', el('span', { class: 'accent', text: 'priced today.' })),
        el('p', { class: 'sub', text: 'Debut Radar prices the launches that have not happened yet. Every pre-token protocol a farmer could actually work is priced two ways from the snapshot\u2019s own record \u2014 what its token would be worth if it launched, from a curve fitted to the tokens that already trade, times the odds its kind records a token at all \u2014 then each row gets a farm plan and a verdict under one printed scenario. Select any row for the model\u2019s working in a side panel.' }),
        el('p', { class: 'boardfacts' },
          el('b', { text: String(DATA.rows.length) }), ' protocols \u00B7 ',
          el('b', { text: String(Object.keys(cats).length) }), ' categories \u00B7 ',
          el('b', { text: String(Object.keys(chains).length) }), ' chains \u00B7 board rule: no token recorded; infrastructure set aside by category')),
      coverageCard());
  }
  // Coverage status: how much of the snapshot this board covers.
  function coverageCard() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = 1; });
    });
    var boardPct = DATA.snapshot_size ? Math.round(DATA.board_size / DATA.snapshot_size * 100) : 0;
    function row(label, value) {
      return el('div', { class: 'covrow' }, el('span', { text: label }), el('b', { class: 'num', text: value }));
    }
    var buckets = DATA.set_aside_buckets.map(function (b) { return b.label + ' ' + b.count; }).join(' \u00B7 ');
    return el('aside', { class: 'summary' },
      el('div', { class: 'covhead' },
        el('h3', { text: 'Coverage status' }),
        el('span', { class: 'covstat' }, el('span', { class: 'covdot' }), 'FULL LEDGER')),
      row('Snapshot scanned', DATA.snapshot_size + ' protocols'),
      row('Ranked on the board', DATA.board_size + ' (' + boardPct + '%)'),
      row('Set aside by rule', DATA.set_aside_size + ' infrastructure'),
      row('Already tokened, kept apart', String(DATA.tokened_size)),
      row('Comparables fitted', DATA.comps + ' traded \u00B7 odds on ' + DATA.odds_peers + ' dated'),
      row('Breadth', Object.keys(cats).length + ' categories \u00B7 ' + Object.keys(chains).length + ' chains'),
      el('p', { class: 'covfoot', text: 'Set aside: ' + buckets + '. The watchlist is ranked in full, exceptions included. Snapshot ' + DATA.as_of + '.' }));
  }
  function modelPanel() {
    var v = DATA.validation, s = DATA.scenario;
    var bands = DATA.age_bands.map(function (b) { return b.label + ' ' + b.token_pct + '%'; }).join(' \u00B7 ');
    return el('section', { class: 'model' },
      el('h2', { text: 'How this radar values a launch' }),
      el('div', { class: 'formula', text: 'implied value = launch value (a power law on TVL) x token odds (the peers\u2019 record)' }),
      el('details', { class: 'modelmore' },
        el('summary', null, el('span', { class: 'hint', text: 'the method, in six lines \u25BE' })),
        el('ul', null,
        el('li', null, el('b', { text: 'Launch value — ' }), 'a power law fitted by least squares to the ' + DATA.comps + ' traded comparables: market cap = e^' + DATA.fit.intercept.toFixed(2) + ' x TVL^' + DATA.fit.slope.toFixed(2) + '. At $100M of TVL the curve reads ' + fmtUsd(DATA.fit.at_100m_usd) + '. One curve prices every row.'),
        el('li', null, el('b', { text: 'Token odds — ' }), 'a logistic fit on ' + DATA.odds_peers + ' dated protocols over three terms: years on record, the category\u2019s own token rate, and size. Out of sample it scores Brier ' + v.odds_brier + ' (10-fold) and ' + v.odds_brier_wf + ' (older fitted, newer scored) against base rates of ' + v.odds_base_brier + ' and ' + v.odds_base_brier_wf + '. The record behind it, by age: ' + bands + ' of dated peers record a token.'),
        el('li', null, el('b', { text: 'Tested, not kept — ' }), 'category offsets, 7-day growth and age were each tried in the value fit and dropped; a term stays only if it helps both tests. On the ' + v.dated_comps + ' dated comparables the curve\u2019s median miss is \u00D7' + v.wf_miss + ' walk-forward (fit the older half, price the newer) against \u00D7' + v.wf_flat_miss + ' for a flat multiple, and \u00D7' + v.loo_miss + ' leave-one-out against \u00D7' + v.loo_flat_miss + '.'),
        el('li', null, el('b', { text: 'Range honesty — ' }), 'the bar under each value is the middle 80% of the curve\u2019s own out-of-sample residuals, applied to that row. Measured back on the comparables, the printed middle-80% band holds ' + v.range80_pct + '% of actual caps (stated 80) and the middle half holds ' + v.range50_pct + '% (stated 50).'),
        el('li', null, el('b', { text: 'The board rule — ' }), (DATA.board_size + DATA.set_aside_size) + ' protocols record no token. Infrastructure is set aside by category \u2014 ' + DATA.set_aside_buckets.map(function (b) { return b.label.toLowerCase() + ' ' + b.count; }).join(', ') + ' \u2014 because its token, if any, is not farmed from the protocol itself. The ' + DATA.watchlist_size + '-protocol watchlist is ranked in full, exceptions included, leaving ' + DATA.board_size + ' rows.'),
        el('li', null, el('b', { text: 'Farm scenario — ' }), 'one printed assumption for every row: a launch drops ' + s.drop_share_pct + '% of implied value to users, and a plan stakes ' + s.plan_share_pct + '% of the protocol\u2019s TVL (' + fmtUsd(s.plan_min_usd) + '\u2013' + fmtUsd(s.plan_max_usd) + '). The verdict nets the plan\u2019s expected share of the drop against its own gas and budget: FARM pays at least ' + fmtUsd(s.farm_per_hour_usd) + ' an hour of work, THIN pays less, SKIP loses money. An assumption, labelled \u2014 not a forecast.'))));
  }
  // Top 7-day gainers and losers.
  function moversPanel() {
    function moverList(title, cls, list) {
      return el('div', { class: 'mover' },
        el('h3', { class: cls === 'pos' ? 'up' : 'down', text: title }),
        el('ol', null, list.map(function (r) {
          return el('li', { tabindex: '0',
            onclick: function () { openDetail(r.slug); },
            onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
            el('span', { class: 'mname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: ' #' + r.rank })),
            el('span', { class: 'mvals' },
              el('span', { class: 'num ' + cls, text: fmtPct(r.change_7d) }),
              el('span', { class: 'sub num', text: fmtUsd(r.implied_value_usd) })));
        })));
    }
    var withChange = DATA.rows.filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; });
    var gainers = withChange.slice().sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    var losers = withChange.slice().sort(function (a, b) { return a.change_7d - b.change_7d; }).slice(0, 5);
    return el('section', { class: 'movers' },
      moverList('\u25B2 Top gainers \u00B7 7d TVL', 'pos', gainers),
      moverList('\u25BC Top losers \u00B7 7d TVL', 'neg', losers));
  }
  // The scenario's FARM verdicts by net $/hour; selecting one opens its plan.
  function farmFirstPanel() {
    var list = DATA.rows.filter(function (r) { return r.verdict === 'FARM'; })
      .slice().sort(function (a, b) { return b.farm_per_hour - a.farm_per_hour; }).slice(0, 12);
    return el('section', { class: 'farmfirst' },
      el('h3', { text: 'Worth farming \u2014 the scenario\u2019s FARM verdicts' }),
      el('div', { class: 'ffgrid' }, list.map(function (r) {
        return el('button', { type: 'button', class: 'ffitem', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'mname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: ' #' + r.rank })),
          el('span', { class: 'mvals' },
            el('span', { class: 'num pos', text: fmtPct(r.change_7d) }),
            el('span', { class: 'sub num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'sub num', text: '$' + r.farm_per_hour.toFixed(2) + '/h net' })));
      })));
  }
  function controls() {
    var chains = {}, cats = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chains[c] = true; });
      cats[r.category || 'Other'] = true;
    });
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, chain, category', value: state.q, 'aria-label': 'Search the board' });
    // Search refreshes the board only; a full render would kill this input.
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); refreshBoard(); });
    function select(id, label, values, current, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label + ': all' }),
        values.map(function (v) {
          var o = el('option', { value: v, text: v });
          if (v === current) o.setAttribute('selected', 'selected');
          return o;
        }));
      s.value = current;
      s.addEventListener('change', function () { onChange(s.value); state.page = 1; writeHash(); render(); });
      return s;
    }
    var chainSel = select('chain', 'Chain', Object.keys(chains).sort(), state.chain, function (v) { state.chain = v; });
    var catSel = select('category', 'Category', Object.keys(cats).sort(), state.category, function (v) { state.category = v; });
    var sortSel = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['value', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age']].map(function (pair) {
        var o = el('option', { value: pair[0], text: pair[1] });
        if (pair[0] === state.sort) o.setAttribute('selected', 'selected');
        return o;
      }));
    sortSel.value = state.sort;
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; state.page = 1; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; state.page = 1; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Order' }), sortSel),
      el('label', { class: 'check' }, wlBox, el('span', { text: 'Watchlist only' })),
      el('span', { class: 'count', id: 'row-count', text: visibleRows().length + ' of ' + DATA.board_size + ' rows' }));
  }
  // The board-wide log extent every row's range whisker is drawn against.
  var WLO = Math.log10(Math.min.apply(null, DATA.rows.map(function (r) { return r.implied_lo_usd; })));
  var WHI = Math.log10(Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_hi_usd; })));
  // A row's middle-80% range as a whisker under its value.
  function whisker(r) {
    function pct(v) { return (Math.log10(Math.max(1, v)) - WLO) / (WHI - WLO) * 100; }
    var lo = pct(r.implied_lo_usd), hi = pct(r.implied_hi_usd);
    return el('div', { class: 'wbar', title: 'Middle-80% range ' + fmtUsd(r.implied_lo_usd) + ' \u2013 ' + fmtUsd(r.implied_hi_usd) },
      el('i', { class: 'wrange', style: 'left:' + lo.toFixed(1) + '%;width:' + Math.max(1.5, hi - lo).toFixed(1) + '%' }),
      el('i', { class: 'wdot', style: 'left:' + pct(r.implied_value_usd).toFixed(1) + '%' }));
  }
  function boardTable() {
    var list = sorted(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel', id: 'board-area' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.chain = 'all'; state.category = 'all'; state.wl = false; state.page = 1; writeHash(); render(); } })));
    }
    // Paged, 100 rows by default.
    var pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > pages) state.page = pages;
    var from = (state.page - 1) * state.pageSize;
    var pageRows = list.slice(from, from + state.pageSize);
    var tbody = el('tbody');
    pageRows.forEach(function (r) {
      var tr = el('tr', { tabindex: '0', class: r.watchlist ? 'wlrow' : '',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num star ' + (r.watchlist ? 'on' : ''), text: r.watchlist ? '\u2605' : '\u2606' }),
        el('td', { class: 'num' }, r.rank <= 3 ? el('span', { class: 'rk', text: String(r.rank) }) : String(r.rank)),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num r' }, el('div', { text: fmtUsd(r.implied_value_usd) }), whisker(r)),
        el('td', { class: 'num r', text: Math.round(r.odds * 100) + '%' }),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtAge(r.age_days) }),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: chainLabel(r.chains) }),
        el('td', null, verdictChip(r)));
      tbody.appendChild(tr);
    });
    var table = el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied value: launch value times token odds. The bar under each value is its middle-80% range. Select a row to open the protocol\u2019s side panel.' }),
        el('thead', null, el('tr', null,
          el('th', { text: '' }), el('th', { text: '#' }), el('th', { text: 'Protocol' }),
          el('th', { class: 'r', text: 'Implied value' }), el('th', { class: 'r', text: 'Odds' }), el('th', { class: 'r', text: 'TVL' }),
          el('th', { class: 'r', text: '7d %' }), el('th', { class: 'r', text: 'Age' }),
          el('th', { text: 'Category' }), el('th', { text: 'Chains' }), el('th', { text: 'Verdict' }))),
        tbody)));
    return el('div', { id: 'board-area' }, table, pager(list.length, pages, from, pageRows.length));
  }
  // Swap only the board region.
  function refreshBoard() {
    var area = document.getElementById('board-area');
    if (area) area.replaceWith(boardTable());
    var count = document.getElementById('row-count');
    if (count) count.textContent = visibleRows().length + ' of ' + DATA.board_size + ' rows';
  }
  function pager(total, pages, from, shown) {
    var sizeSel = el('select', { id: 'psize', 'aria-label': 'Rows per page' },
      [20, 50, 100].map(function (n) {
        var o = el('option', { value: String(n), text: String(n) });
        if (n === state.pageSize) o.setAttribute('selected', 'selected');
        return o;
      }));
    sizeSel.value = String(state.pageSize);
    sizeSel.addEventListener('change', function () { state.pageSize = parseInt(sizeSel.value, 10) || 100; state.page = 1; render(); });
    function btn(label, page, opts) {
      opts = opts || {};
      var b = el('button', { type: 'button', class: 'pgbtn' + (opts.cur ? ' cur' : ''), text: label });
      if (opts.off) b.setAttribute('disabled', 'disabled');
      else b.addEventListener('click', function () { state.page = page; writeHash(); render(); window.scrollTo(0, 0); });
      return b;
    }
    var nums = [];
    var want = {};
    [1, 2, state.page - 1, state.page, state.page + 1, pages - 1, pages].forEach(function (n) { if (n >= 1 && n <= pages) want[n] = true; });
    var last = 0;
    Object.keys(want).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      if (last && n - last > 1) nums.push(el('span', { class: 'pgdots', text: '\u2026' }));
      nums.push(btn(String(n), n, { cur: n === state.page }));
      last = n;
    });
    return el('div', { class: 'pager' },
      el('span', { class: 'sub', text: 'Showing ' + (total === 0 ? 0 : from + 1) + '\u2013' + (from + shown) + ' of ' + total }),
      el('label', { class: 'sub' }, 'Rows ', sizeSel),
      el('span', { class: 'pgnums' },
        btn('\u2190 Prev', state.page - 1, { off: state.page <= 1 }),
        nums,
        btn('Next \u2192', state.page + 1, { off: state.page >= pages })));
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // One labelled figure tile.
  function tile(label, value, note) {
    return el('div', { class: 'tile' },
      el('span', { text: label }), el('b', { class: 'num', text: value }),
      note ? el('span', { class: 'sub', text: note }) : null);
  }
  // A horizontal bar chart of named values, one row in gold (SVG text).
  function barPanel(title, aria, items, o) {
    var max = 0;
    items.forEach(function (r) { if (r.v > max) max = r.v; });
    var parts = [];
    items.forEach(function (r, i) {
      var bw = Math.max(3, Math.round(o.tw * r.v / (max || 1)));
      var y = i * 25;
      var name = r.name.length > o.nl ? r.name.slice(0, o.nl - 1) + '\u2026' : r.name;
      parts.push('<text x="0" y="' + (y + 12) + '" font-size="11" class="' + (r.mine ? 'tx-gold' : 'tx-name') + '"' + (r.mine ? ' font-weight="700"' : '') + '>' + esc(name) + '</text>');
      parts.push('<rect x="' + o.tx + '" y="' + (y + 3) + '" width="' + o.tw + '" height="10" rx="3" class="trk"/>');
      parts.push('<rect x="' + o.tx + '" y="' + (y + 3) + '" width="' + bw + '" height="10" rx="3" class="' + (r.mine ? 'bar-mine' : 'bar-off') + '"/>');
      parts.push('<text x="' + o.vx + '" y="' + (y + 12) + '" font-size="11" font-family="ui-monospace, Menlo, monospace" class="' + (r.mine ? 'tx-gold' : 'tx-mut') + '" text-anchor="end">' + esc(fmtUsd(r.v)) + '</text>');
    });
    var box = el('div', { class: 'chart' }, el('h3', { text: title }));
    var holder = el('div');
    holder.innerHTML = '<svg viewBox="0 0 ' + o.W + ' ' + (items.length * 25 + 2) + '" role="img" aria-label="' + aria + '">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  // Chart 1: the value build-up (log scale).
  function buildUpPanel(row) {
    var stages = [
      { label: 'TVL', v: row.tvl_usd, cls: 'st0' },
      { label: 'curve reads (launch value)', v: row.launch_value_usd, cls: 'st1' },
      { label: 'x token odds ' + row.odds.toFixed(2), v: impliedOf(row), cls: 'st3' }
    ];
    var logs = stages.map(function (s) { return Math.log10(Math.max(1, s.v)); });
    var lo = Math.min.apply(null, logs), hi = Math.max.apply(null, logs);
    var parts = [];
    stages.forEach(function (s, i) {
      var w = hi > lo ? 10 + 90 * (logs[i] - lo) / (hi - lo) : 100;
      var bw = Math.round(400 * w / 100);
      var y = i * 31;
      parts.push('<text x="0" y="' + (y + 10) + '" font-size="10.5" class="tx-mut">' + esc(s.label) + '</text>');
      parts.push('<rect x="0" y="' + (y + 14) + '" width="400" height="10" rx="3" class="trk"/>');
      parts.push('<rect x="0" y="' + (y + 14) + '" width="' + bw + '" height="10" rx="3" class="' + s.cls + '"/>');
      parts.push('<text x="515" y="' + (y + 23) + '" font-size="11" font-family="ui-monospace, Menlo, monospace" class="tx-val" text-anchor="end">' + esc(fmtUsd(s.v)) + '</text>');
    });
    var box = el('div', { class: 'chart' }, el('h3', { text: 'How the value builds up (log scale)' }));
    var holder = el('div');
    holder.innerHTML = '<svg viewBox="0 0 520 95" role="img" aria-label="Bar chart of the value build-up">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  // Chart 2: the category leaders.
  function categoryPanel(row) {
    var cat = row.category || 'Other';
    var list = DATA.rows.filter(function (r) { return (r.category || 'Other') === cat; })
      .slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    var title = 'Where it sits in ' + cat;
    if (list.length < 3) { list = DATA.rows.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }); title = 'Where it sits on the board'; }
    var top = list.slice(0, 6);
    if (!top.some(function (r) { return r.slug === row.slug; })) top.push(row);
    return barPanel(title, 'Bar chart of the category leaders',
      top.map(function (r) { return { name: r.name, v: r.implied_value_usd, mine: r.slug === row.slug }; }),
      { W: 520, tx: 178, tw: 262, vx: 515, nl: 24 });
  }
  // Split a farm step into action, cost and time.
  function parseStep(s) {
    var m = /^(.*?)\s*Cost:\s*(.*?)\.\s*Time:\s*(.*?)\.?\s*$/.exec(s);
    if (!m) return { action: s, cost: null, time: null };
    return { action: m[1], cost: m[2], time: m[3] };
  }
  // The farm plan as a to-do list.
  function farmTodo(row) {
    return el('div', { class: 'farmtodo' }, row.farm_steps.map(function (s) {
      var p = parseStep(s);
      return el('label', { class: 'todo' },
        el('input', { type: 'checkbox' }),
        el('span', { class: 'todomain' },
          el('span', { class: 'action', text: p.action }),
          (p.cost || p.time) ? el('span', { class: 'todometa' },
            p.cost ? el('span', { class: 'chip cost' }, el('b', { text: 'Cost ' }), p.cost) : null,
            p.time ? el('span', { class: 'chip time' }, el('b', { text: 'Time ' }), p.time) : null) : null));
    }));
  }
  // Protocol detail as a side panel over the board.
  function detailPanel(row) {
    var check = impliedOf(row);
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Launch value (the fitted curve at this TVL)' }), el('b', { class: 'num', text: fmtUsd(row.launch_value_usd) })),
      el('div', null, el('span', { text: 'Token odds (age ' + fmtAge(row.age_days) + ', its category\u2019s record, its size)' }), el('b', { class: 'num', text: Math.round(row.odds * 100) + '%' })),
      el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })));
    return el('aside', { class: 'sidepanel', id: 'detail', 'aria-label': 'Protocol detail' },
      el('div', { class: 'panel-top' },
        el('span', { class: 'rank', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (row.watchlist ? '  ·  \u2605 WATCHLIST' : '') + '  ·  VERDICT: ' + row.verdict }),
        el('button', { class: 'closebtn', type: 'button', text: '\u2715', 'aria-label': 'Close detail', onclick: closeDetail })),
      el('h2', { text: row.name }),
      el('div', null,
          // Category and chain pills — one opens the board filtered by it.
          el('div', { class: 'pills' },
            el('button', { type: 'button', class: 'pill cat', title: 'See the board filtered to this category',
              onclick: function () { state.category = row.category || 'Other'; state.chain = 'all'; state.page = 1; closeDetail(); } },
              'Category: ' + (row.category || 'Other')),
            (row.chains || []).slice(0, 4).map(function (c) {
              return el('button', { type: 'button', class: 'pill chain', title: 'See the board filtered to this chain',
                onclick: function () { state.chain = c; state.category = 'all'; state.page = 1; closeDetail(); } }, c);
            }),
            (row.chains && row.chains.length > 4) ? el('span', { class: 'pill more', text: '+' + (row.chains.length - 4) + ' more chains' }) : null,
            !(row.chains && row.chains.length) ? el('span', { class: 'pill chain off', text: 'no chain recorded' }) : null),
          el('p', { class: 'sub', text: 'First tracked ' + (row.listed_at || 'unknown') + ' · records no token' })),
        el('div', { class: 'coin-value' },
          el('span', { text: 'Implied value' }),
          el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }),
          el('span', { class: 'num ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg'), text: 'TVL 7d ' + fmtPct(row.change_7d) })),
      el('p', { class: 'sub', text: 'Range, not just a point: the middle 80% of the curve\u2019s out-of-sample error prices this at ' + fmtUsd(row.implied_lo_usd) + ' \u2013 ' + fmtUsd(row.implied_hi_usd) + '.' }),
      el('div', { class: 'tiles' },
        tile('TVL (snapshot)', fmtUsd(row.tvl_usd), 'across ' + (row.chains ? row.chains.length : 0) + ' chains'),
        tile('Launch value', fmtUsd(row.launch_value_usd), 'the fitted curve at this TVL'),
        tile('Token odds', Math.round(row.odds * 100) + '%', 'the share of like peers recording a token'),
        tile('Age on record', fmtAge(row.age_days), 'first tracked ' + (row.listed_at || 'unknown'))),
      el('h3', { class: 'panel-h', text: 'Farm plan — your to-do list' }),
      el('p', { class: 'sub', text: 'The scenario\u2019s verdict: a ' + fmtUsd(row.plan_usd) + ' plan expects a ' + fmtUsd(row.expected_drop_usd) + ' share of the drop against ' + fmtUsd(row.farm_cost_usd) + ' of gas and budget \u2014 net ' + fmtUsd(row.farm_net_usd) + ' over about ' + row.farm_hours + ' hours of work, $' + row.farm_per_hour.toFixed(2) + ' an hour. Verdict: ' + row.verdict + '.' }),
      farmTodo(row),
      el('p', { class: 'sub', text: 'Tick a step off as you do it. These are the same steps board.json carries for this row.' }),
      el('h3', { class: 'panel-h', text: 'How the value is built' }),
      eq,
      el('p', { class: 'sub', text: 'The panel recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — the same figure board.json carries.' : ' — which differs from the board figure; trust board.json.') + ' An implied value is this radar\u2019s claim, not a price prediction.' }),
      el('div', { class: 'charts' }, buildUpPanel(row), categoryPanel(row)));
  }
  // The two tabs.
  function tabs() {
    function tab(view, label) {
      return el('button', { type: 'button', class: 'tab' + (state.view === view ? ' on' : ''),
        onclick: function () { state.view = view; state.selected = null; writeHash(); render(); window.scrollTo(0, 0); } }, label);
    }
    return el('nav', { class: 'tabs', 'aria-label': 'Views' },
      tab('board', 'Pre-token protocols'),
      tab('peers', 'Already launched'));
  }
  function peersTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0',
        onclick: function () { openPeer(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPeer(r.slug); } } },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num', text: r.symbol || '—' }),
        el('td', { class: 'num r', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r', text: fmtMult(r.ratio) }),
        el('td', { class: 'num r ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { text: r.category || 'Other' })));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'The largest already-launched protocols in the snapshot, by market cap. Select a row to open the peer\u2019s page.' }),
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }), el('th', { text: 'Symbol' }), el('th', { class: 'r', text: 'Market cap' }),
          el('th', { class: 'r', text: 'TVL' }), el('th', { class: 'r', text: 'Mcap / TVL' }), el('th', { class: 'r', text: '7d %' }), el('th', { text: 'Category' }))),
        tbody)));
  }
  // Peer chart: its category's largest traded peers.
  function peerCategoryPanel(peer) {
    var cat = peer.category || 'Other';
    var list = DATA.live.filter(function (r) { return (r.category || 'Other') === cat; })
      .slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    var title = 'Largest traded in ' + cat;
    if (list.length < 3) { list = DATA.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }); title = 'Largest traded peers'; }
    var top = list.slice(0, 6);
    if (!top.some(function (r) { return r.slug === peer.slug; })) top.push(peer);
    return barPanel(title, 'Bar chart of the largest traded peers in the category',
      top.map(function (r) { return { name: r.name, v: r.mcap_usd, mine: r.slug === peer.slug }; }),
      { W: 1040, tx: 300, tw: 620, vx: 1035, nl: 34 });
  }
  // A traded peer's page.
  function peerPage(peer) {
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'Market cap (snapshot)' }), el('b', { class: 'num', text: fmtUsd(peer.mcap_usd) })),
      el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(peer.tvl_usd) })),
      el('div', null, el('span', { text: 'Its mcap / TVL ratio' }), el('b', { class: 'num', text: fmtMult(peer.ratio) })),
      el('div', null, el('span', { text: 'The fitted curve at this TVL' }), el('b', { class: 'num', text: fmtUsd(peer.curve_value_usd) })),
      el('div', { class: 'total' }, el('span', { text: 'Market cap against the curve' }), el('b', { class: 'num', text: fmtMult(Math.max(peer.mcap_usd / peer.curve_value_usd, peer.curve_value_usd / peer.mcap_usd)) + (peer.mcap_usd >= peer.curve_value_usd ? ' above' : ' below') })));
    return el('section', { class: 'coin', id: 'detail' },
      el('button', { class: 'back', type: 'button', text: '\u2190 Back to already launched', onclick: closePeer }),
      el('div', { class: 'coin-head' },
        el('div', null,
          el('span', { class: 'rank', text: 'ALREADY LAUNCHED' + (peer.symbol ? '  ·  ' + peer.symbol : '') }),
          el('h1', { text: peer.name }),
          el('div', { class: 'pills' },
            el('button', { type: 'button', class: 'pill cat', title: 'See the pre-token board filtered to this category',
              onclick: function () { state.peer = null; state.view = 'board'; state.category = peer.category || 'Other'; state.chain = 'all'; state.page = 1; writeHash(); render(); } },
              'Category: ' + (peer.category || 'Other')),
            (peer.chains || []).map(function (c) {
              return el('button', { type: 'button', class: 'pill chain', title: 'See the pre-token board filtered to this chain',
                onclick: function () { state.peer = null; state.view = 'board'; state.chain = c; state.category = 'all'; state.page = 1; writeHash(); render(); } }, c);
            })),
          el('p', { class: 'sub', text: 'Already trades — part of the yardstick, never ranked on the pre-token board' })),
        el('div', { class: 'coin-value' },
          el('span', { text: 'Market cap' }),
          el('b', { class: 'num', text: fmtUsd(peer.mcap_usd) }),
          el('span', { class: 'num ' + (peer.change_7d === null ? '' : peer.change_7d >= 0 ? 'pos' : 'neg'), text: 'TVL 7d ' + fmtPct(peer.change_7d) }))),
      el('div', { class: 'tiles' },
        tile('Market cap', fmtUsd(peer.mcap_usd), peer.symbol || 'no symbol recorded'),
        tile('TVL (snapshot)', fmtUsd(peer.tvl_usd), 'across ' + (peer.chains ? peer.chains.length : 0) + ' chains'),
        tile('Mcap / TVL', fmtMult(peer.ratio), 'the market\u2019s own pricing of this protocol'),
        tile('Curve value', fmtUsd(peer.curve_value_usd), 'what the fitted curve reads at this TVL')),
      el('div', { class: 'charts one' }, peerCategoryPanel(peer)),
      el('div', { class: 'detail-grid' },
        el('div', null, el('h3', { text: 'How this peer feeds the model' }), eq),
        el('div', null,
          el('h3', { text: 'Why it is here' }),
          el('p', { text: 'This token is one of the ' + DATA.comps + ' comparables the launch curve is fitted to: its market cap and TVL are one point the power law is drawn through, and one of the records the token odds are learned from. It already trades, so it gets no farm plan and no implied value \u2014 it is part of the yardstick the pre-token board is measured with.' }))));
  }
  // The yardstick, plotted.
  function scatterPanel() {
    var pts = DATA.peer_points || [];
    var xs = pts.map(function (p) { return Math.log10(p[0]); });
    var ys = pts.map(function (p) { return Math.log10(p[1]); });
    var xlo = Math.floor(Math.min.apply(null, xs)), xhi = Math.ceil(Math.max.apply(null, xs));
    var ylo = Math.floor(Math.min.apply(null, ys)), yhi = Math.ceil(Math.max.apply(null, ys));
    var W = 640, H = 252, L = 46, B = 20, T = 6, R = 8;
    function px(v) { return L + (v - xlo) / (xhi - xlo) * (W - L - R); }
    function py(v) { return T + (yhi - v) / (yhi - ylo) * (H - T - B); }
    var parts = [], k;
    for (k = xlo; k <= xhi; k++) parts.push('<line x1="' + px(k) + '" y1="' + T + '" x2="' + px(k) + '" y2="' + (H - B) + '" class="grd"/><text x="' + px(k) + '" y="' + (H - 6) + '" font-size="10" class="tx-mut" text-anchor="middle">' + esc(fmtUsd(Math.pow(10, k))) + '</text>');
    for (k = ylo; k <= yhi; k++) parts.push('<line x1="' + L + '" y1="' + py(k) + '" x2="' + (W - R) + '" y2="' + py(k) + '" class="grd"/><text x="' + (L - 5) + '" y="' + (py(k) + 3) + '" font-size="10" class="tx-mut" text-anchor="end">' + esc(fmtUsd(Math.pow(10, k))) + '</text>');
    var yAt = function (x) { return DATA.fit.intercept / Math.LN10 + DATA.fit.slope * x; };
    var ly1 = Math.max(ylo, Math.min(yhi, yAt(xlo))), ly2 = Math.max(ylo, Math.min(yhi, yAt(xhi)));
    parts.push('<line x1="' + px(xlo) + '" y1="' + py(ly1) + '" x2="' + px(xhi) + '" y2="' + py(ly2) + '" class="med"/>');
    pts.forEach(function (p) { parts.push('<circle cx="' + px(Math.log10(p[0])).toFixed(1) + '" cy="' + py(Math.log10(p[1])).toFixed(1) + '" r="3" class="pt"/>'); });
    var box = el('div', { class: 'chart' },
      el('h3', { text: 'The yardstick, plotted — market cap against TVL' }),
      el('p', { class: 'sub', text: 'All ' + pts.length + ' traded comparables, log-log. The dashed line is the fitted curve every launch value is read from; the scatter around it is the error the printed ranges are measured from.' }));
    var holder = el('div');
    holder.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter chart of peer market cap against TVL">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  function peersView() {
    return el('section', { class: 'peers' },
      el('h1', { text: 'Already launched — the peer yardstick' }),
      el('p', { class: 'sub', text: 'These protocols already trade, so they are never ranked. They are the comparables the launch curve is fitted to and the records the odds are learned from — all ' + DATA.comps + ' of them; the ' + DATA.live.length + ' largest are listed here.' }),
      scatterPanel(),
      peersTable());
  }
  function foot() {
    return el('p', { class: 'foot', text: 'Data: ' + DATA.source + '. Implied values are this radar\u2019s own model claims, not make.fun\u2019s and not investment advice. \u201CRecords no token\u201D is the snapshot\u2019s record, not proof none exists.' });
  }
  function render() {
    document.documentElement.setAttribute('data-theme', state.theme);
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(strip());
    shell.appendChild(ticker());
    var selectedRow = null;
    if (state.selected) DATA.rows.forEach(function (r) { if (r.slug === state.selected) selectedRow = r; });
    var peerRow = null;
    if (state.peer) DATA.live.forEach(function (r) { if (r.slug === state.peer) peerRow = r; });
    if (peerRow && !selectedRow) {
      shell.appendChild(peerPage(peerRow));
    } else if (state.view === 'peers' && !selectedRow) {
      shell.appendChild(tabs());
      shell.appendChild(peersView());
    } else {
      shell.appendChild(tabs());
      shell.appendChild(hero());
      shell.appendChild(modelPanel());
      shell.appendChild(moversPanel());
      shell.appendChild(farmFirstPanel());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
    }
    if (selectedRow) {
      shell.appendChild(el('div', { class: 'backdrop', onclick: closeDetail }));
      shell.appendChild(detailPanel(selectedRow));
    }
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.selected) closeDetail();
    else if (state.peer) closePeer();
  });

  readHash();
  render();
})();
