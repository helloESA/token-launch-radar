// Token Launch Radar — the dashboard page. Reads window.RADAR (data.js, written by main.ts
// beside this folder) and renders the ranked pre-token board, a per-protocol detail view with
// the value model's working and the farm plan, filters and sorting, and the already-launched
// peer panel the model's multiples come from. No network: every byte shown ships in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', chain: 'all', category: 'all', wl: false, sort: 'value', selected: null };

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
  // The page recomputes a row's implied value from the components the board publishes, so a
  // reader can check that the page and board.json carry the same arithmetic.
  function impliedOf(r) {
    return Math.max(1, Math.round(r.tvl_usd * r.multiple * r.growth_multiplier * r.maturity_multiplier));
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
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.wl) p.set('wl', '1');
    if (state.sort !== 'value') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
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
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('span', { text: 'TOKEN LAUNCH RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.board_size + ' pre-token protocols ranked' }),
        el('span', { text: 'Watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' covered' })));
  }
  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Which protocol with no token yet is worth farming next?' }),
        el('p', { class: 'sub', text: 'Every protocol in the snapshot that records no token and holds at least $10M of TVL, ranked by what its launch would be worth if its record stayed as it is — with the steps to farm each one. The 40-protocol watchlist (TVL at or above $50M) is the floor of this board, never its ceiling.' })),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Traded peers behind the model' }), el('b', { text: String(DATA.peer_count) })),
        el('div', { class: 'stat' }, el('span', { text: 'Global median mcap / TVL' }), el('b', { text: fmtMult(DATA.global_multiple) }))));
  }
  function modelPanel() {
    return el('section', { class: 'model' },
      el('h2', { text: 'How this radar values a launch' }),
      el('div', { class: 'formula', text: 'implied value = TVL x category multiple x growth adjustment x maturity adjustment' }),
      el('ul', null,
        el('li', null, el('b', { text: 'Category multiple — ' }), 'the median market-cap/TVL of protocols in the same category whose token already trades, shrunk toward the global median (' + fmtMult(DATA.global_multiple) + ' across ' + DATA.peer_count + ' traded peers) so a thin category cannot shout: (n x category median + 4 x global median) / (n + 4). No traded peer, no multiple of its own: the global median applies.'),
        el('li', null, el('b', { text: 'Growth adjustment — ' }), 'half the 7-day TVL change, clamped to -50%..+100%: +20% growth multiplies value by 1.10, -20% by 0.90. Unreported growth counts as flat.'),
        el('li', null, el('b', { text: 'Maturity adjustment — ' }), '0.85 for a brand-new listing, rising with the days it has run with no token and saturating at 1.15: 0.85 + 0.3 x (1 - exp(-age/540)). No listing date counts as neutral.'),
        el('li', null, el('b', { text: 'Separation — ' }), 'protocols whose token already trades are never ranked here; the largest of them sit in the peer yardstick below with the market\u2019s own numbers.')));
  }
  function controls() {
    var chains = {}, cats = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chains[c] = true; });
      cats[r.category || 'Other'] = true;
    });
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, chain, category', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(false); });
    function select(id, label, values, current, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label + ': all' }),
        values.map(function (v) {
          var o = el('option', { value: v, text: v });
          if (v === current) o.setAttribute('selected', 'selected');
          return o;
        }));
      s.value = current;
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(false); });
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
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; writeHash(); render(false); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(false); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Order' }), sortSel),
      el('label', { class: 'check' }, wlBox, el('span', { text: 'Watchlist only' })),
      el('span', { class: 'count', text: visibleRows().length + ' of ' + DATA.board_size + ' rows' }));
  }
  function detail() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var check = impliedOf(row);
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'no category') + ': median ' + fmtMult(row.category_median) + ', ' + row.peer_count + ' peers, shrunk)' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
      el('div', null, el('span', { text: 'Growth adjustment (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
      el('div', null, el('span', { text: 'Maturity adjustment (age ' + fmtAge(row.age_days) + ')' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
      el('div', { class: 'total' }, el('span', { text: 'Implied launch value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })));
    return el('section', { class: 'detail', id: 'detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'rank', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (row.watchlist ? '  ·  WATCHLIST' : '') }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'no chain recorded') + ' · first tracked ' + (row.listed_at || 'unknown') + ' · records no token' })),
        el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(false); } })),
      el('div', { class: 'detail-grid' },
        el('div', null, eq,
          el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — the same figure board.json carries.' : ' — which differs from the board figure; trust board.json.') + ' An implied value is this radar\u2019s claim, not a price prediction.' })),
        el('div', null,
          el('h3', { text: 'Farm plan' }),
          el('ol', { class: 'steps' }, row.farm_steps.map(function (s) { return el('li', { text: s }); })))));
  }
  function boardTable() {
    var list = sorted(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.chain = 'all'; state.category = 'all'; state.wl = false; writeHash(); render(false); } })));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', { tabindex: '0', 'data-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { state.selected = r.slug; writeHash(); render(true); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = r.slug; writeHash(); render(true); } } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num' }, el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })), el('span', { text: fmtUsd(r.implied_value_usd) })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { text: chainLabel(r.chains) }),
        el('td', { text: r.category || 'Other' }),
        el('td', null, r.watchlist ? el('span', { class: 'wl', text: 'WATCHLIST' }) : el('span', { class: 'sub', text: 'early' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied launch value. Select a row for its model working and farm plan.' }),
        el('thead', null, el('tr', null,
          el('th', { text: 'Rank' }), el('th', { text: 'Protocol' }), el('th', { text: 'Implied value' }),
          el('th', { text: 'TVL' }), el('th', { text: '7d' }), el('th', { text: 'Age' }),
          el('th', { text: 'Chains' }), el('th', { text: 'Category' }), el('th', { text: 'List' }))),
        tbody)));
  }
  function peersPanel() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num', text: r.symbol || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtMult(r.ratio) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { text: r.category || 'Other' })));
    });
    return el('section', { class: 'peers' },
      el('h2', { text: 'Already launched — the peer yardstick' }),
      el('p', { class: 'sub', text: 'These protocols already trade, so they are never ranked on the board. Their market-cap/TVL ratios are the yardstick the board\u2019s category multiples are medians of.' }),
      el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Protocol' }), el('th', { text: 'Symbol' }), el('th', { text: 'Market cap' }),
            el('th', { text: 'TVL' }), el('th', { text: 'Mcap / TVL' }), el('th', { text: '7d' }), el('th', { text: 'Category' }))),
          tbody))));
  }
  function render(scrollToDetail) {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(modelPanel());
    shell.appendChild(controls());
    var d = detail();
    if (d) shell.appendChild(d);
    shell.appendChild(boardTable());
    shell.appendChild(peersPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Data: ' + DATA.source + '. Implied values are this radar\u2019s own model claims about a launch that may never happen; they are not make.fun\u2019s claims and not investment advice. A protocol here records no token in the snapshot — that is a record, not proof none exists.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (scrollToDetail) {
      var node = document.getElementById('detail');
      if (node) node.scrollIntoView({ block: 'start' });
    }
  }

  readHash();
  render(false);
})();
