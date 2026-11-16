// Token Launch Radar — the dashboard page, shaped like a market-cap ranking site: a metrics
// strip, a dense ranked table, and a full detail page per protocol (a row click navigates to
// it, the way a coin row opens its coin page). Reads window.RADAR (data.js, written by main.ts
// beside this folder). No network: every byte shown ships in data.js.
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
  // The board's one-word verdict per protocol, derived only from fields the board already
  // publishes — watchlist standing (TVL at or above $50M), 7-day TVL direction, and age —
  // so any reader can re-derive it: Farm first = watchlist and TVL not shrinking; Farm =
  // watchlist, or hot TVL growth on a protocol at least a year old; Watch = TVL growing or
  // a two-year survivor; Skip = everything else.
  function suggestionOf(r) {
    var growing = r.change_7d !== null && r.change_7d !== undefined && r.change_7d >= 0;
    var hot = r.change_7d !== null && r.change_7d !== undefined && r.change_7d >= 15;
    var yearOld = r.age_days !== null && r.age_days !== undefined && r.age_days >= 365;
    var veteran = r.age_days !== null && r.age_days !== undefined && r.age_days >= 730;
    if (r.watchlist && growing) return { label: 'Farm first', cls: 'first' };
    if (r.watchlist || (hot && yearOld)) return { label: 'Farm', cls: 'farm' };
    if (growing || veteran) return { label: 'Watch', cls: 'watch' };
    return { label: 'Skip', cls: 'skip' };
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
    window.scrollTo(0, 0);
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
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('span', { text: 'TOKEN LAUNCH RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' covered' }),
        el('button', { type: 'button', class: 'themebtn', title: 'Switch between dark and light mode',
          onclick: function () { state.theme = state.theme === 'light' ? 'dark' : 'light'; writeHash(); render(); } },
          state.theme === 'light' ? '\u263E Dark mode' : '\u2600 Light mode')));
  }
  // The thin metrics strip a ranking site carries under its header: the whole board in one line.
  function strip() {
    function item(label, value) {
      return el('span', { class: 'strip-item' }, el('span', { class: 'strip-lab', text: label + ':' }), el('b', { class: 'num', text: value }));
    }
    return el('div', { class: 'strip' },
      item('Protocols ranked', String(DATA.board_size)),
      item('Pre-token TVL floor', '$10.0M'),
      item('Traded peers', String(DATA.peer_count)),
      item('Global median mcap/TVL', fmtMult(DATA.global_multiple)),
      item('Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size));
  }
  function hero() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = 1; });
    });
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Pre-token protocols by implied launch value' }),
        el('p', { class: 'sub', text: 'Every protocol in the snapshot that records no token and holds at least $10M of TVL, ranked by what its launch would be worth if its record stayed as it is — with the steps to farm each one. Select any row to open its full page: the model\u2019s working and its farm plan. The 40-protocol watchlist (TVL at or above $50M) is the floor of this board, never its ceiling.' }),
        el('div', { class: 'quickrow' },
          el('button', { type: 'button', class: 'qchip', onclick: function () {
            state.wl = true; state.page = 1; writeHash(); render();
            var c = document.querySelector('form.controls'); if (c) c.scrollIntoView();
          } }, '\u2605 Watchlist only'),
          el('button', { type: 'button', class: 'qchip', onclick: function () {
            var m = document.querySelector('.movers'); if (m) m.scrollIntoView();
          } }, 'Top movers \u2193'),
          el('button', { type: 'button', class: 'qchip', onclick: function () {
            state.view = 'peers'; writeHash(); render(); window.scrollTo(0, 0);
          } }, 'Already launched \u2192')),
        el('p', { class: 'boardfacts' },
          el('b', { text: String(DATA.rows.length) }), ' protocols \u00B7 ',
          el('b', { text: String(Object.keys(cats).length) }), ' categories \u00B7 ',
          el('b', { text: String(Object.keys(chains).length) }), ' chains \u00B7 board rule: no token recorded, TVL at or above $10M')),
      summaryCard());
  }
  // The board in one card, for the space beside the title: what the whole board
  // holds, what the model says it would be worth, and how the suggestions split.
  // Every figure is a sum or a count over the board's own published rows.
  function summaryCard() {
    var totalTvl = 0, totalImplied = 0;
    var counts = { first: 0, farm: 0, watch: 0, skip: 0 };
    DATA.rows.forEach(function (r) {
      totalTvl += r.tvl_usd;
      totalImplied += r.implied_value_usd;
      counts[suggestionOf(r).cls] += 1;
    });
    var n = DATA.rows.length || 1;
    function seg(cls, count) {
      return el('span', { class: 'seg ' + cls, style: 'width:' + (count / n * 100).toFixed(2) + '%', title: count + ' protocols' });
    }
    function legend(cls, label, count) {
      return el('div', { class: 'lrow' },
        el('span', { class: 'dot ' + cls }),
        el('span', { text: label }),
        el('b', { class: 'num', text: String(count) }));
    }
    return el('aside', { class: 'summary' },
      el('h3', { text: 'Board summary' }),
      el('div', { class: 'sumstats' },
        el('div', { class: 'sumstat' }, el('span', { text: 'Combined TVL' }), el('b', { class: 'num', text: fmtUsd(totalTvl) })),
        el('div', { class: 'sumstat' }, el('span', { text: 'Combined implied value' }), el('b', { class: 'num', text: fmtUsd(totalImplied) }))),
      el('div', { class: 'segbar', 'aria-hidden': 'true' }, seg('first', counts.first), seg('farm', counts.farm), seg('watch', counts.watch), seg('skip', counts.skip)),
      el('div', { class: 'legend' },
        legend('first', 'Farm first', counts.first),
        legend('farm', 'Farm', counts.farm),
        legend('watch', 'Watch', counts.watch),
        legend('skip', 'Skip', counts.skip)));
  }
  function modelPanel() {
    return el('section', { class: 'model' },
      el('h2', { text: 'How this radar values a launch' }),
      el('div', { class: 'formula', text: 'implied value = TVL x category multiple x growth adjustment x maturity adjustment' }),
      el('ul', null,
        el('li', null, el('b', { text: 'Category multiple — ' }), 'the median market-cap/TVL of protocols in the same category whose token already trades, shrunk toward the global median (' + fmtMult(DATA.global_multiple) + ' across ' + DATA.peer_count + ' traded peers) so a thin category cannot shout: (n x category median + 4 x global median) / (n + 4). No traded peer, no multiple of its own: the global median applies.'),
        el('li', null, el('b', { text: 'Growth adjustment — ' }), 'half the 7-day TVL change, clamped to -50%..+100%: +20% growth multiplies value by 1.10, -20% by 0.90. Unreported growth counts as flat.'),
        el('li', null, el('b', { text: 'Maturity adjustment — ' }), '0.85 for a brand-new listing, rising with the days it has run with no token and saturating at 1.15: 0.85 + 0.3 x (1 - exp(-age/540)). No listing date counts as neutral.'),
        el('li', null, el('b', { text: 'Separation — ' }), 'protocols whose token already trades are never ranked here; the largest of them sit in the peer yardstick below with the market\u2019s own numbers.'),
        el('li', null, el('b', { text: 'Suggestion — ' }), 'the board\u2019s one-word verdict, derived from published fields only: Farm first = watchlist and TVL not shrinking; Farm = watchlist, or 7-day TVL growth of 15%+ on a protocol at least a year old; Watch = TVL growing, or a two-year survivor; Skip = everything else.')));
  }
  // The movers cards a ranking site carries over its table: the board's sharpest
  // 7-day TVL gainers and losers. Every figure is the snapshot's own change_7d;
  // selecting a row opens that protocol's page, same as the board.
  function moversPanel() {
    function moverList(title, cls, list) {
      return el('div', { class: 'mover' },
        el('h3', { text: title }),
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
  function controls() {
    var chains = {}, cats = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chains[c] = true; });
      cats[r.category || 'Other'] = true;
    });
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, chain, category', value: state.q, 'aria-label': 'Search the board' });
    // Typing must never rebuild the controls: a full render would destroy this very
    // input mid-keystroke and throw the caret out. Search refreshes the board only.
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
  function boardTable() {
    var list = sorted(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel', id: 'board-area' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.chain = 'all'; state.category = 'all'; state.wl = false; state.page = 1; writeHash(); render(); } })));
    }
    // Paged like a ranking site: 100 rows to a page by default, never the whole board at once.
    var pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > pages) state.page = pages;
    var from = (state.page - 1) * state.pageSize;
    var pageRows = list.slice(from, from + state.pageSize);
    var tbody = el('tbody');
    pageRows.forEach(function (r) {
      var tr = el('tr', { tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num star ' + (r.watchlist ? 'on' : ''), text: r.watchlist ? '\u2605' : '\u2606' }),
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num r', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtAge(r.age_days) }),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: chainLabel(r.chains) }),
        el('td', null, (function () { var s = suggestionOf(r); return el('span', { class: 'sg ' + s.cls, text: s.label }); })()));
      tbody.appendChild(tr);
    });
    var table = el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied launch value. Select a row to open the protocol\u2019s page.' }),
        el('thead', null, el('tr', null,
          el('th', { text: '' }), el('th', { text: '#' }), el('th', { text: 'Protocol' }),
          el('th', { class: 'r', text: 'Implied value' }), el('th', { class: 'r', text: 'TVL' }),
          el('th', { class: 'r', text: '7d %' }), el('th', { class: 'r', text: 'Age' }),
          el('th', { text: 'Category' }), el('th', { text: 'Chains' }), el('th', { text: 'Suggestion' }))),
        tbody)));
    return el('div', { id: 'board-area' }, topPager(list.length, pages, from, pageRows.length), table, pager(list.length, pages, from, pageRows.length));
  }
  // Swap only the board region (pagers + table) and the row count, leaving the
  // controls — above all the search box being typed in — untouched in the DOM.
  function refreshBoard() {
    var area = document.getElementById('board-area');
    if (area) area.replaceWith(boardTable());
    var count = document.getElementById('row-count');
    if (count) count.textContent = visibleRows().length + ' of ' + DATA.board_size + ' rows';
  }
  // The top pager is options only — rows-per-page and prev/next — the numbered
  // pager under the table carries the full set of controls.
  function topPager(total, pages, from, shown) {
    var sizeSel = el('select', { id: 'psize-top', 'aria-label': 'Rows per page' },
      [20, 50, 100].map(function (n) {
        var o = el('option', { value: String(n), text: String(n) });
        if (n === state.pageSize) o.setAttribute('selected', 'selected');
        return o;
      }));
    sizeSel.value = String(state.pageSize);
    sizeSel.addEventListener('change', function () { state.pageSize = parseInt(sizeSel.value, 10) || 100; state.page = 1; render(); });
    function btn(label, page, off) {
      var b = el('button', { type: 'button', class: 'pgbtn', text: label });
      if (off) b.setAttribute('disabled', 'disabled');
      else b.addEventListener('click', function () { state.page = page; writeHash(); render(); });
      return b;
    }
    return el('div', { class: 'pager top' },
      el('span', { class: 'sub', text: 'Showing ' + (total === 0 ? 0 : from + 1) + '\u2013' + (from + shown) + ' of ' + total }),
      el('label', { class: 'sub' }, 'Rows ', sizeSel),
      el('span', { class: 'pgnums' },
        btn('\u2190 Prev', state.page - 1, state.page <= 1),
        el('span', { class: 'sub', text: 'Page ' + state.page + ' of ' + pages }),
        btn('Next \u2192', state.page + 1, state.page >= pages)));
  }
  // Page controls under the board: rows-per-page plus numbered pages with prev/next.
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
  // Chart 1: how the implied value builds up from TVL through the three model factors.
  // Bars sit on a log scale — a multiple can stretch a bar a hundredfold — and every bar
  // is labelled with the figure it carries, computed from the same components board.json
  // publishes, so the picture cannot drift from the numbers.
  function buildUpPanel(row) {
    var stages = [
      { label: 'TVL', v: row.tvl_usd, cls: 'st0' },
      { label: 'x category multiple ' + fmtMult(row.multiple), v: row.tvl_usd * row.multiple, cls: 'st1' },
      { label: 'x growth adjustment ' + fmtMult(row.growth_multiplier), v: row.tvl_usd * row.multiple * row.growth_multiplier, cls: 'st2' },
      { label: '= implied value', v: impliedOf(row), cls: 'st3' }
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
    holder.innerHTML = '<svg viewBox="0 0 520 126" role="img" aria-label="Bar chart of the value build-up">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  // Chart 2: where this protocol sits among its own category on the board — the top of
  // the category by implied value, with this protocol always shown and lit in gold.
  function categoryPanel(row) {
    var cat = row.category || 'Other';
    var list = DATA.rows.filter(function (r) { return (r.category || 'Other') === cat; })
      .slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    var title = 'Where it sits in ' + cat;
    if (list.length < 3) { list = DATA.rows.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }); title = 'Where it sits on the board'; }
    var top = list.slice(0, 6);
    var present = top.some(function (r) { return r.slug === row.slug; });
    if (!present) top.push(row);
    var max = 0;
    top.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var parts = [];
    top.forEach(function (r, i) {
      var mine = r.slug === row.slug;
      var bw = Math.max(3, Math.round(262 * r.implied_value_usd / (max || 1)));
      var y = i * 25;
      var name = r.name.length > 24 ? r.name.slice(0, 23) + '\u2026' : r.name;
      parts.push('<text x="0" y="' + (y + 12) + '" font-size="11" class="' + (mine ? 'tx-gold' : 'tx-name') + '"' + (mine ? ' font-weight="700"' : '') + '>' + esc(name) + '</text>');
      parts.push('<rect x="178" y="' + (y + 3) + '" width="262" height="10" rx="3" class="trk"/>');
      parts.push('<rect x="178" y="' + (y + 3) + '" width="' + bw + '" height="10" rx="3" class="' + (mine ? 'bar-mine' : 'bar-off') + '"/>');
      parts.push('<text x="515" y="' + (y + 12) + '" font-size="11" font-family="ui-monospace, Menlo, monospace" class="' + (mine ? 'tx-gold' : 'tx-mut') + '" text-anchor="end">' + esc(fmtUsd(r.implied_value_usd)) + '</text>');
    });
    var box = el('div', { class: 'chart' }, el('h3', { text: title }));
    var holder = el('div');
    holder.innerHTML = '<svg viewBox="0 0 520 ' + (top.length * 25 + 2) + '" role="img" aria-label="Bar chart of the category leaders">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  // The protocol's own page: what a row click opens. Big value up top like a coin page,
  // the model's working as stat tiles and an equation, then the farm plan.
  function detailPage(row) {
    var check = impliedOf(row);
    function tile(label, value, note) {
      return el('div', { class: 'tile' },
        el('span', { text: label }), el('b', { class: 'num', text: value }),
        note ? el('span', { class: 'sub', text: note }) : null);
    }
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'no category') + ': median ' + fmtMult(row.category_median) + ', ' + row.peer_count + ' peers, shrunk)' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
      el('div', null, el('span', { text: 'Growth adjustment (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
      el('div', null, el('span', { text: 'Maturity adjustment (age ' + fmtAge(row.age_days) + ')' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
      el('div', { class: 'total' }, el('span', { text: 'Implied launch value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })));
    return el('section', { class: 'coin', id: 'detail' },
      el('button', { class: 'back', type: 'button', text: '\u2190 Back to all protocols', onclick: closeDetail }),
      el('div', { class: 'coin-head' },
        el('div', null,
          el('span', { class: 'rank', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (row.watchlist ? '  ·  \u2605 WATCHLIST' : '') + '  ·  SUGGESTION: ' + suggestionOf(row).label.toUpperCase() }),
          el('h1', { text: row.name }),
          // Category and chains as topic pills, the way a market site tags its pages —
          // and they work: selecting one goes back to the board filtered by it.
          el('div', { class: 'pills' },
            el('button', { type: 'button', class: 'pill cat', title: 'See the board filtered to this category',
              onclick: function () { state.category = row.category || 'Other'; state.chain = 'all'; state.page = 1; closeDetail(); } },
              'Category: ' + (row.category || 'Other')),
            (row.chains || []).map(function (c) {
              return el('button', { type: 'button', class: 'pill chain', title: 'See the board filtered to this chain',
                onclick: function () { state.chain = c; state.category = 'all'; state.page = 1; closeDetail(); } }, c);
            }),
            !(row.chains && row.chains.length) ? el('span', { class: 'pill chain off', text: 'no chain recorded' }) : null),
          el('p', { class: 'sub', text: 'First tracked ' + (row.listed_at || 'unknown') + ' · records no token' })),
        el('div', { class: 'coin-value' },
          el('span', { text: 'Implied launch value' }),
          el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }),
          el('span', { class: 'num ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg'), text: 'TVL 7d ' + fmtPct(row.change_7d) }))),
      el('div', { class: 'tiles' },
        tile('TVL (snapshot)', fmtUsd(row.tvl_usd), 'across ' + (row.chains ? row.chains.length : 0) + ' chains'),
        tile('Category multiple', fmtMult(row.multiple), 'median ' + fmtMult(row.category_median) + ' from ' + row.peer_count + ' traded peers, shrunk'),
        tile('Growth adjustment', fmtMult(row.growth_multiplier), '7d TVL change ' + fmtPct(row.change_7d)),
        tile('Maturity adjustment', fmtMult(row.maturity_multiplier), 'age ' + fmtAge(row.age_days))),
      el('div', { class: 'charts' }, buildUpPanel(row), categoryPanel(row)),
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h3', { text: 'How the value is built' }), eq,
          el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — the same figure board.json carries.' : ' — which differs from the board figure; trust board.json.') + ' An implied value is this radar\u2019s claim, not a price prediction.' })),
        el('div', null,
          el('h3', { text: 'Farm plan' }),
          el('ol', { class: 'steps' }, row.farm_steps.map(function (s) { return el('li', { text: s }); })))));
  }
  // The two top-level tabs, ranking-site style: the pre-token board, and the
  // already-launched peers on their own page instead of dumped under the board.
  function tabs() {
    function tab(view, label) {
      return el('button', { type: 'button', class: 'tab' + (state.view === view && !state.selected ? ' on' : ''),
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
  // Chart for a peer page: the largest traded peers of its category by market cap,
  // with this peer lit in gold — all from the live panel's own published figures.
  function peerCategoryPanel(peer) {
    var cat = peer.category || 'Other';
    var list = DATA.live.filter(function (r) { return (r.category || 'Other') === cat; })
      .slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    var title = 'Largest traded in ' + cat;
    if (list.length < 3) { list = DATA.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }); title = 'Largest traded peers'; }
    var top = list.slice(0, 6);
    if (!top.some(function (r) { return r.slug === peer.slug; })) top.push(peer);
    var max = 0;
    top.forEach(function (r) { if (r.mcap_usd > max) max = r.mcap_usd; });
    var parts = [];
    top.forEach(function (r, i) {
      var mine = r.slug === peer.slug;
      var bw = Math.max(3, Math.round(620 * r.mcap_usd / (max || 1)));
      var y = i * 25;
      var name = r.name.length > 34 ? r.name.slice(0, 33) + '\u2026' : r.name;
      parts.push('<text x="0" y="' + (y + 12) + '" font-size="11" class="' + (mine ? 'tx-gold' : 'tx-name') + '"' + (mine ? ' font-weight="700"' : '') + '>' + esc(name) + '</text>');
      parts.push('<rect x="300" y="' + (y + 3) + '" width="620" height="10" rx="3" class="trk"/>');
      parts.push('<rect x="300" y="' + (y + 3) + '" width="' + bw + '" height="10" rx="3" class="' + (mine ? 'bar-mine' : 'bar-off') + '"/>');
      parts.push('<text x="1035" y="' + (y + 12) + '" font-size="11" font-family="ui-monospace, Menlo, monospace" class="' + (mine ? 'tx-gold' : 'tx-mut') + '" text-anchor="end">' + esc(fmtUsd(r.mcap_usd)) + '</text>');
    });
    var box = el('div', { class: 'chart' }, el('h3', { text: title }));
    var holder = el('div');
    holder.innerHTML = '<svg viewBox="0 0 1040 ' + (top.length * 25 + 2) + '" role="img" aria-label="Bar chart of the largest traded peers in the category">' + parts.join('') + '</svg>';
    box.appendChild(holder);
    return box;
  }
  // A traded peer's own page: its market figures, and exactly how it feeds the model —
  // its ratio is one of the observations its category's median is taken over.
  function peerPage(peer) {
    function tile(label, value, note) {
      return el('div', { class: 'tile' },
        el('span', { text: label }), el('b', { class: 'num', text: value }),
        note ? el('span', { class: 'sub', text: note }) : null);
    }
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'Market cap (snapshot)' }), el('b', { class: 'num', text: fmtUsd(peer.mcap_usd) })),
      el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(peer.tvl_usd) })),
      el('div', null, el('span', { text: 'Its mcap / TVL ratio' }), el('b', { class: 'num', text: fmtMult(peer.ratio) })),
      el('div', null, el('span', { text: 'Category median (' + (peer.category || 'no category') + ', ' + peer.peer_count + ' traded peers)' }), el('b', { class: 'num', text: fmtMult(peer.category_median) })),
      el('div', null, el('span', { text: 'Shrunk multiple the board scores this category with' }), el('b', { class: 'num', text: fmtMult(peer.multiple) })),
      el('div', { class: 'total' }, el('span', { text: 'Global median (all categories)' }), el('b', { class: 'num', text: fmtMult(DATA.global_multiple) })));
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
        tile('TVL 7d', fmtPct(peer.change_7d), 'change over the snapshot week')),
      el('div', { class: 'charts one' }, peerCategoryPanel(peer)),
      el('div', { class: 'detail-grid' },
        el('div', null, el('h3', { text: 'How this peer feeds the model' }), eq),
        el('div', null,
          el('h3', { text: 'Why it is here' }),
          el('p', { text: 'The board\u2019s category multiple for ' + (peer.category || 'Other') + ' is the median mcap/TVL of its ' + peer.peer_count + ' traded peers, shrunk toward the global median so a thin category cannot shout. This protocol\u2019s own ratio of ' + fmtMult(peer.ratio) + ' is one of the observations inside that median. It already trades, so it gets no farm plan and no implied value — it is part of the yardstick the pre-token board is measured with.' }))));
  }
  function peersView() {
    return el('section', { class: 'peers' },
      el('h1', { text: 'Already launched — the peer yardstick' }),
      el('p', { class: 'sub', text: 'These protocols already trade, so they are never ranked on the pre-token board. Their market-cap/TVL ratios are the yardstick the board\u2019s category multiples are medians of — computed across all ' + DATA.peer_count + ' traded peers in the snapshot; the ' + DATA.live.length + ' largest of them are listed here with the market\u2019s own numbers.' }),
      peersTable());
  }
  function foot() {
    return el('p', { class: 'foot', text: 'Data: ' + DATA.source + '. Implied values are this radar\u2019s own model claims about a launch that may never happen; they are not make.fun\u2019s claims and not investment advice. A protocol here records no token in the snapshot — that is a record, not proof none exists.' });
  }
  function render() {
    document.documentElement.setAttribute('data-theme', state.theme);
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(strip());
    var selectedRow = null;
    if (state.selected) DATA.rows.forEach(function (r) { if (r.slug === state.selected) selectedRow = r; });
    var peerRow = null;
    if (state.peer) DATA.live.forEach(function (r) { if (r.slug === state.peer) peerRow = r; });
    if (selectedRow) {
      shell.appendChild(detailPage(selectedRow));
    } else if (peerRow) {
      shell.appendChild(peerPage(peerRow));
    } else if (state.view === 'peers') {
      shell.appendChild(tabs());
      shell.appendChild(peersView());
    } else {
      shell.appendChild(tabs());
      shell.appendChild(hero());
      shell.appendChild(modelPanel());
      shell.appendChild(moversPanel());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
    }
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
})();
