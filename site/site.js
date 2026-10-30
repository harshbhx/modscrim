/* ModScrim website: the 30-second practice drill, the mod view, console steps and small helpers.
   Everything here is a browser-only demo. Nothing is posted anywhere. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* Wave A for the browser demo: 14 attack lines and 15 regulars, built like ModScrim's engine.
     Every link ends in .invalid, so none of them can ever resolve. */
  var DUR = 30, SLIP = 9;
  var SCRIPT = [
    { t: .5, u: 'mossy_otter', m: 'gg that boss was rough' },
    { t: 1.4, u: 'kettlebell_kay', m: 'is the vod going up tonight?' },
    { t: 2.3, u: 'pixel_parsnip', m: 'first time here, the music is so good' },
    { t: 3.3, u: 'nitrodrops_93', m: 'fr33 nitro for the first 50 viewers → nitrodrop.invalid', s: 1, k: 'link', trick: 'number swaps', r: 'fr33' },
    { t: 3.9, u: 'viewbump_hq', m: 'BUY FOLLOWERS and VIEWERS cheap at viewbump.invalid', s: 1, k: 'spam', trick: 'all caps', r: 'viewbump*' },
    { t: 4.4, u: 'lowtide', m: 'welcome raiders?? who is this' },
    { t: 5, u: 'chibi_by_ren', m: 'hey streamer, need emooootes or overlays? dm me', s: 1, k: 'bot', trick: 'stretched letters', r: 'emooo*' },
    { t: 5.6, u: 'giftsnow_bot', m: 'skins giveaway is live, claim yours at giftsnow.invalid', s: 1, k: 'link', trick: 'plain', r: 'giftsnow*' },
    { t: 6.3, u: 'grandpa_gamer', m: 'LOL the jump at the end' },
    { t: 6.9, u: 'grow_fast_77', m: 'want more v i e w e r s? best promo viewbump .invalid', s: 1, k: 'spam', trick: 'spaced letters', bot: 1 },
    { t: 7.6, u: 'promo_kiki', m: 'nice stream! I do promotion, check your dms', s: 1, k: 'bot', trick: 'plain', r: 'check your dms' },
    { t: 8.3, u: 'nora_reads', m: 'what build are you running?' },
    { t: 8.9, u: 'nitrodrops_94', m: 'streamer is gifting subs!! grab it giftsnow[.]invalid', s: 1, k: 'link', trick: '[.] in link', bot: 1 },
    { t: 9.6, u: 'tealkettle', m: 'hi from Lisbon!' },
    { t: 10.2, u: 'viewbump_hq2', m: 'grow your channel fast, real f0ll0wers viewbump.invalid', s: 1, k: 'spam', trick: 'number swaps', r: 'f0ll0wers' },
    { t: 11.1, u: 'mossy_otter', m: '1' },
    { t: 11.4, u: 'kettlebell_kay', m: '1' },
    { t: 11.7, u: 'quietfox', m: '1' },
    { t: 12.5, u: 'logo_lab_3', m: 'hi, I make chibi l0g0s for streamers, dm me', s: 1, k: 'bot', trick: 'number swaps', r: 'l0g0s' },
    { t: 13.3, u: 'baker_beans', m: 'hydrate check' },
    { t: 14, u: 'nitrodrops_95', m: 'GET VBUCKS FREE before it ends nitrodrop.invalid', s: 1, k: 'link', trick: 'all caps', r: 'nitrodrop*' },
    { t: 15, u: 'pixel_parsnip', m: 'is this a raid? should I leave?' },
    { t: 15.7, u: 'grow_fast_78', m: 'buy followers and viewers cheap at viewbump dot invalid', s: 1, k: 'spam', trick: '"dot" spelled out', bot: 1 },
    { t: 16.6, u: 'quietfox', m: 'mods are on it, ignore them' },
    { t: 17.3, u: 'promo_kiki2', m: 'nice stream! I do prom0ti0n, check your dms', s: 1, k: 'bot', trick: 'number swaps', r: 'check your dms' },
    { t: 18.3, u: 'nora_reads', m: 'that clip needs to go on the channel' },
    { t: 19, u: 'giftsnow_bot2', m: 'get robux free before it ends giftsnow.invalid', s: 1, k: 'link', trick: 'plain', r: 'giftsnow*' },
    { t: 19.9, u: 'lowtide', m: 'free real estate lol' },
    { t: 20.6, u: 'chibi_by_ren2', m: 'hey streamer, need EMOTES or OVERLAYS? dm me', s: 1, k: 'bot', trick: 'all caps', r: 'need emotes' }
  ];
  var CALM = [
    { u: 'mossy_otter', m: 'that last round was clean' },
    { u: 'nora_reads', m: 'back from making tea' },
    { u: 'tealkettle', m: 'the new overlay looks good' }
  ];
  var KINDS = [
    { k: 'link', name: 'Fake giveaway links', ex: '<code>fr33 nitro</code> and a link that ends in <code>.invalid</code>.' },
    { k: 'spam', name: 'Follower and viewer spam', ex: '<code>BUY FOLLOWERS</code>, sometimes with spaced letters.' },
    { k: 'bot', name: 'Art and promo bots', ex: 'Friendly openers that end in <code>dm me</code>.' }
  ];
  var TOTAL = {}; SCRIPT.forEach(function (x) { if (x.s) TOTAL[x.k] = (TOTAL[x.k] || 0) + 1; });
  var SPAM = SCRIPT.filter(function (x) { return x.s; }).length;
  var COLORS = ['#8FE0AE', '#FFC48F', '#A6D8EC', '#F2E58A', '#F6B3A0'];
  function colorOf(u) { var h = 0; for (var i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }

  /* ---------- scoreboard plates ---------- */
  function setPlates(box, text) {
    if (!box) return;
    var cells = $$('.pl', box), chars = String(text).split('');
    cells.forEach(function (el, i) {
      var v = (chars[i] || '').trim();
      if (el.textContent !== v) {
        el.textContent = v;
        if (!reduce && !el.classList.contains('sep')) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
      }
    });
  }
  function pad2(n) { var s = String(Math.min(n, 99)); return s.length < 2 ? ' ' + s : s; }
  function clockText(sec) { var s = Math.max(0, Math.ceil(sec)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /* ---------- the drill (home page: click to delete; mod page: Delete, Timeout, Ban and keys) ---------- */
  function Drill(root) {
    var mode = root.getAttribute('data-drill');
    var feed = $('[data-feed]', root), notes = $('[data-notes]', root), cover = $('[data-cover]', root);
    var live = $('[data-live]', root), paused = $('[data-paused]', root);
    var sb = { mods: $('[data-score="mods"]', root), raid: $('[data-score="raid"]', root), fouls: $('[data-score="fouls"]', root), clock: $('[data-score="clock"]', root) };
    var st = { phase: 'ready', t0: 0, timer: null, next: 0, posted: [], caught: 0, fouls: 0, slipped: 0, react: [], kai: 0, kaiFouls: 0, by: {}, focus: null };

    function score() {
      setPlates(sb.mods, pad2(st.caught - st.kai)); setPlates(sb.raid, pad2(st.slipped)); setPlates(sb.fouls, String(Math.min(st.fouls, 9)));
      if (live) live.textContent = 'Caught ' + st.caught + ', slipped ' + st.slipped + ', fouls ' + st.fouls + '.';
    }
    function chip(rec, cls, text) {
      $$('.hint, .msg-act', rec.el).forEach(function (n) { n.remove(); });
      var s = document.createElement('span'); s.className = 'st ' + cls; s.textContent = text; rec.el.appendChild(s);
    }
    function lineEl(x, animate) {
      var el;
      if (mode === 'mod') {
        el = document.createElement('div'); el.className = 'mod-line' + (animate && !reduce ? ' in' : ''); el.tabIndex = -1;
        el.innerHTML = '<span class="u" style="color:' + colorOf(x.u) + '">' + esc(x.u) + '</span><span class="t">' + esc(x.m) + '</span>' +
          '<span class="msg-act"><button type="button" class="del" data-a="delete">Delete</button><button type="button" data-a="timeout">Timeout</button><button type="button" data-a="ban">Ban</button></span>';
        el.setAttribute('aria-label', x.u + ': ' + x.m);
      } else {
        el = document.createElement('button'); el.type = 'button'; el.className = 'msg' + (animate && !reduce ? ' in' : '');
        el.innerHTML = '<span class="u" style="color:' + colorOf(x.u) + '">' + esc(x.u) + '</span><span class="t">' + esc(x.m) + '</span><span class="hint">Delete</span>';
      }
      return el;
    }
    function add(x, animate) {
      var rec = { x: x, el: lineEl(x, animate), done: false, at: performance.now() };
      if (mode === 'mod') {
        $$('button', rec.el).forEach(function (b) { b.addEventListener('click', function () { act(rec, b.getAttribute('data-a'), 'you'); }); });
        rec.el.addEventListener('focus', function () { st.focus = rec; });
      } else {
        rec.el.addEventListener('click', function () { act(rec, 'delete', 'you'); });
        if (st.phase !== 'live') rec.el.disabled = true;
      }
      var atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
      feed.appendChild(rec.el);
      while (feed.children.length > 60) feed.removeChild(feed.firstChild);
      if (atBottom || !animate) feed.scrollTop = feed.scrollHeight; else if (st.phase === 'live' && paused) paused.hidden = false;
      return rec;
    }
    function act(rec, action, who) {
      if (st.phase !== 'live' || rec.done || rec.calm) return;
      rec.done = true;
      if (rec.el.tagName === 'BUTTON') rec.el.disabled = true;
      $$('.msg-act button', rec.el).forEach(function (b) { b.disabled = true; });
      var secs = ((performance.now() - rec.at) / 1000).toFixed(1);
      var verb = action === 'ban' ? 'Banned' : action === 'timeout' ? 'Timed out' : 'Deleted';
      if (rec.x.s) {
        st.caught++; st.by[rec.x.k] = (st.by[rec.x.k] || 0) + 1;
        rec.el.classList.add('caught', 'done');
        if (who === 'kai') { st.kai++; chip(rec, 'st-other', 'Kai (sim) got it first'); }
        else { st.react.push(+secs); chip(rec, 'st-caught', mode === 'mod' ? verb + ' by you · ' + secs + ' s' : 'Caught · ' + secs + ' s'); }
      } else if (who === 'kai') {
        st.kaiFouls++; rec.el.classList.add('foul', 'done');
        chip(rec, 'st-other', 'Kai (sim) false ban');
      } else {
        st.fouls++; rec.el.classList.add('foul', 'done');
        chip(rec, 'st-foul', 'False ban: that was a regular');
      }
      score(); renderNotes();
      if (mode === 'mod' && who === 'you') focusNext(rec);
    }
    function focusNext(rec) {
      var open = st.posted.filter(function (p) { return !p.done && !p.calm; });
      var after = open.filter(function (p) { return p.at > rec.at; });
      var target = after[0] || open[open.length - 1];
      if (target) target.el.focus({ preventScroll: false });
    }
    function slipCheck(now) {
      st.posted.forEach(function (p) {
        if (!p.done && !p.calm && p.x.s && now - p.at >= SLIP * 1000) {
          p.done = true; p.slipped = true; st.slipped++;
          if (p.el.tagName === 'BUTTON') p.el.disabled = true;
          $$('.msg-act button', p.el).forEach(function (b) { b.disabled = true; });
          p.el.classList.add('slipped', 'done'); chip(p, 'st-slipped', 'Slipped through');
          if (live) live.textContent = 'A line slipped through. Slipped ' + st.slipped + '.';
        }
      });
    }
    function kaiTick(now) {
      if (mode !== 'mod') return;
      st.posted.forEach(function (p) {
        if (!p.done && !p.calm && p.kaiAt && now >= p.kaiAt) act(p, 'timeout', 'kai');
      });
    }
    function renderNotes() {
      if (!notes) return;
      if (st.phase === 'done') return renderResult();
      var rows = KINDS.map(function (k) {
        var n = st.phase === 'live' ? '<span class="n' + ((st.by[k.k] || 0) === TOTAL[k.k] ? ' done' : '') + '">' + (st.by[k.k] || 0) + '/' + TOTAL[k.k] + '</span>' : '';
        return '<li><b>' + k.name + '</b>' + n + '<span class="ex">' + k.ex + '</span></li>';
      }).join('');
      notes.innerHTML = '<h2>' + (mode === 'mod' ? 'Remove attacks, leave regulars alone' : 'What to watch for') + '</h2><ul class="watch">' + rows +
        '<li class="notspam"><b>Not spam</b><span class="ex">A first-time chatter saying hi, a run of 1s when the streamer asks for them, or someone joking about free real estate.</span></li></ul>' +
        '<p class="micro muted">A line nobody removes within ' + SLIP + ' seconds slips through.</p>';
    }
    function renderResult() {
      var slipped = st.posted.filter(function (p) { return p.slipped; });
      var rules = {}, bots = {};
      slipped.forEach(function (p) { if (p.x.bot) bots[p.x.trick] = (bots[p.x.trick] || 0) + 1; else rules[p.x.r] = (rules[p.x.r] || 0) + 1; });
      var avg = st.react.length ? (st.react.reduce(function (a, b) { return a + b; }, 0) / st.react.length).toFixed(1) : null;
      var mine = st.caught - st.kai;
      var head = slipped.length === 0 && st.fouls === 0 ? 'Clean sheet.' : 'You caught ' + mine + ' of ' + SPAM + '.';
      var bits = [];
      bits.push(slipped.length === 0 ? 'Nothing slipped through' : slipped.length + ' slipped through');
      if (st.kai) bits.push('Kai (sim) took ' + st.kai + (st.kaiFouls ? ' and false-banned ' + st.kaiFouls : ''));
      if (st.fouls) bits.push((st.fouls === 1 ? 'one regular was' : st.fouls + ' regulars were') + ' removed by mistake');
      var sub = bits.join(', ') + '.' + (avg ? ' Average reaction ' + avg + ' s.' : '');
      var ruleRows = Object.keys(rules).map(function (r) { return '<li><code>' + esc(r) + '</code><span>blocked term, catches ' + rules[r] + '</span></li>'; }).join('') +
        Object.keys(bots).map(function (b) { return '<li class="bot"><span style="color:var(--chalk)">' + esc(b) + '</span><span>needs a bot rule</span></li>'; }).join('');
      var rej = '<li class="rej"><code>free*</code><span>rejected: also matches a regular’s “free real estate lol”</span></li>';
      notes.innerHTML = '<div class="result"><p class="big">' + head + '</p><p>' + sub + '</p></div>' +
        (ruleRows ? '<div><p class="h3" style="margin-bottom:10px">Fixes for what slipped</p><ul class="rules-out">' + ruleRows + rej + '</ul>' +
          '<p class="micro muted" style="margin-top:10px">On a real channel, Twitch grades your filters, every term is checked against last week’s chat and proven on a fresh wave, and nothing goes live until you press Approve.</p></div>' : '') +
        '<div class="ctas"><button class="btn btn-orange" type="button" data-again>Run it again</button>' +
        (mode === 'mod' ? '<a class="btn btn-line" href="index.html">Back to the home page</a>' : root.id === 'console-drill' ? '<a class="btn btn-line" href="#twitch-grades">See Twitch\u2019s grade</a>' : '<a class="btn btn-line" href="how-it-works.html">See the full loop</a>') + '</div>';
      $('[data-again]', notes).addEventListener('click', start);
    }
    function calm() {
      feed.innerHTML = ''; st.posted = [];
      CALM.forEach(function (x) { var r = add(x, false); r.calm = true; r.done = true; if (r.el.tagName === 'BUTTON') r.el.disabled = true; $$('.msg-act', r.el).forEach(function (n) { n.remove(); }); });
    }
    function start() {
      st.phase = 'live'; st.caught = 0; st.fouls = 0; st.slipped = 0; st.react = []; st.kai = 0; st.kaiFouls = 0; st.by = {}; st.next = 0; st.focus = null;
      calm(); if (cover) cover.hidden = true; if (paused) paused.hidden = true;
      score(); setPlates(sb.clock, clockText(DUR)); renderNotes();
      st.t0 = performance.now(); clearInterval(st.timer); st.timer = setInterval(tick, 100);
      var kaiOn = $('[data-kai]', root); st.kaiOn = mode === 'mod' && (!kaiOn || kaiOn.checked);
      if (mode === 'mod') { feed.focus(); }
    }
    var seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; }
    function tick() {
      var now = performance.now(), el = (now - st.t0) / 1000;
      while (st.next < SCRIPT.length && SCRIPT[st.next].t <= el) {
        var rec = add(SCRIPT[st.next], true); st.posted.push(rec);
        if (st.kaiOn && rec.x.s && rnd() < 0.6) rec.kaiAt = rec.at + (2600 + rnd() * 4200);
        else if (st.kaiOn && !rec.x.s && /free|dm|link/.test(rec.x.m) && rnd() < 0.3) rec.kaiAt = rec.at + (2800 + rnd() * 2600);
        if (mode === 'mod' && !st.focus) { st.focus = rec; rec.el.focus({ preventScroll: true }); }
        st.next++;
      }
      slipCheck(now); kaiTick(now);
      setPlates(sb.clock, clockText(DUR - el));
      if (el >= DUR) finish();
    }
    function finish() {
      clearInterval(st.timer); st.phase = 'done';
      st.posted.forEach(function (p) {
        if (!p.done && !p.calm && p.x.s) { p.done = true; p.slipped = true; st.slipped++; p.el.classList.add('slipped', 'done'); chip(p, 'st-slipped', 'Slipped through'); }
        if (p.el.tagName === 'BUTTON') p.el.disabled = true;
        $$('.msg-act button', p.el).forEach(function (b) { b.disabled = true; });
        if (mode === 'mod' && !p.calm && !p.x.s && !p.done) { chip(p, 'st-other', 'Regular'); }
      });
      if (paused) paused.hidden = true;
      setPlates(sb.clock, '0:00'); score(); renderNotes();
      if (live) live.textContent = 'Final whistle. Caught ' + st.caught + ', slipped ' + st.slipped + ', fouls ' + st.fouls + '.';
    }

    if (paused) {
      paused.addEventListener('click', function () { feed.scrollTop = feed.scrollHeight; paused.hidden = true; });
      feed.addEventListener('scroll', function () { if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48) paused.hidden = true; });
    }
    if (mode === 'mod') {
      feed.addEventListener('keydown', function (e) {
        var lines = st.posted.filter(function (p) { return !p.calm; });
        var i = lines.indexOf(st.focus);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var j = Math.max(0, Math.min(lines.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
          if (lines[j]) lines[j].el.focus();
        } else if (st.focus && /^[dtb]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          act(st.focus, { d: 'delete', t: 'timeout', b: 'ban' }[e.key.toLowerCase()], 'you');
        }
      });
    }
    $$('[data-start]', root).forEach(function (b) { b.addEventListener('click', start); });
    calm(); renderNotes(); score();
  }

  /* ---------- rule cards: Push to channel and Undo ---------- */
  function ruleCards() {
    $$('[data-rules] li').forEach(function (li) {
      var btn = $('button', li), st = $('.state', li);
      if (!btn || !st) return;
      btn.addEventListener('click', function () {
        var isLive = li.getAttribute('data-state') === 'live';
        li.setAttribute('data-state', isLive ? 'ready' : 'live');
        st.className = 'state ' + (isLive ? 'state-ready' : 'state-live');
        st.textContent = isLive ? 'Undone' : 'Live';
        btn.className = 'btn btn-xs ' + (isLive ? 'btn-green' : 'btn-line-dark');
        btn.textContent = isLive ? 'Push to channel' : 'Undo';
      });
    });
  }

  /* ---------- console: hash-routed steps ---------- */
  function consoleSteps() {
    var tabs = $$('[data-step-link]'); if (!tabs.length) return;
    var current = null;
    function show(focus) {
      var id = (location.hash || '#read-filters').slice(1);
      var panel = document.getElementById(id);
      if (!panel || !panel.hasAttribute('data-step')) { if (current) return; id = 'read-filters'; panel = document.getElementById(id); }
      current = id;
      $$('[data-step]').forEach(function (p) { p.hidden = p.id !== id; });
      tabs.forEach(function (a) { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
      if (focus) { var h1 = $('h1', panel); if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); } var bar = $('.stepper'); if (bar) bar.scrollIntoView({ block: 'nearest' }); }
    }
    window.addEventListener('hashchange', function () { show(true); });
    show(false);
  }

  /* ---------- copy buttons ---------- */
  function copies() {
    $$('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var src = document.getElementById(b.getAttribute('data-copy')); if (!src) return;
        var text = src.textContent.trim(), label = b.textContent;
        function ok() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 1600); }
        try {
          navigator.clipboard.writeText(text).then(ok, function () { select(src); b.textContent = 'Selected, press Ctrl+C'; });
        } catch (e) { select(src); }
      });
    });
    function select(el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }

  /* ---------- console actions that change state on the page ---------- */
  function consoleActions() {
    var rot = $('[data-rotate]');
    if (rot) rot.addEventListener('click', function () {
      var k = ''; var a = 'abcdefghijkmnpqrstuvwxyz23456789';
      var arr = new Uint32Array(32); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(arr) : arr.forEach(function (_, i) { arr[i] = Math.random() * 1e9; });
      arr.forEach(function (n) { k += a[n % a.length]; });
      var el = document.getElementById('overlay-url'); if (el) el.textContent = el.textContent.replace(/key=[a-z0-9]+/, 'key=' + k);
      var msg = $('[data-rotate-msg]'); if (msg) msg.textContent = 'New key issued. Old overlay links stop working right away.';
    });
    var del = $('[data-delete-log]'), conf = $('[data-confirm-delete]');
    if (del && conf) {
      del.addEventListener('click', function () { conf.hidden = false; $('button', conf).focus(); });
      $$('[data-confirm]', conf).forEach(function (b) {
        b.addEventListener('click', function () {
          conf.hidden = true; del.focus();
          if (b.getAttribute('data-confirm') === 'yes') {
            $$('[data-logcount]').forEach(function (n) { n.textContent = '0 messages'; });
            var s = $('[data-samples]'); if (s) s.innerHTML = '<li style="font-family:var(--body)">Chat log deleted. New messages are collected from now on.</li>';
          }
        });
      });
    }
    var ref = $('[data-refresh]');
    if (ref) ref.addEventListener('click', function () { var m = $('[data-refresh-msg]'); if (m) m.textContent = 'Read from Twitch just now. 5 public terms, AutoMod levels unchanged.'; });
    var pause = $('[data-pause]');
    if (pause) pause.addEventListener('click', function () {
      var on = pause.getAttribute('aria-pressed') === 'true';
      pause.setAttribute('aria-pressed', on ? 'false' : 'true');
      pause.textContent = on ? 'Pause logging' : 'Resume logging';
      var s = $('[data-logstate]'); if (s) s.textContent = on ? 'Logging' : 'Paused';
    });
    var push = $('[data-push]'), undo = $('[data-undo]'), out = $('[data-push-out]');
    if (push && undo && out) {
      push.addEventListener('click', function () {
        var terms = $$('[data-term]:checked').map(function (i) { return i.value; });
        if (!terms.length) { out.innerHTML = '<p>Select at least one term to push.</p>'; return; }
        out.innerHTML = '<ul class="term-list">' + terms.map(function (t) { return '<li class="term" style="grid-template-columns:minmax(0,1fr) auto"><code>' + esc(t) + '</code><span class="badge">Added</span></li>'; }).join('') + '</ul>' +
          '<p class="micro muted" style="margin-top:10px">Pushed ' + terms.length + ' term' + (terms.length === 1 ? '' : 's') + ' to Twitch. Recorded in the audit log.</p>';
        push.disabled = true; undo.disabled = false; undo.focus();
      });
      undo.addEventListener('click', function () {
        out.innerHTML = '<p>Removed every term this drill pushed. Recorded in the audit log.</p>';
        push.disabled = false; undo.disabled = true; push.focus();
      });
      var boxes = $$('[data-term]');
      function count() { var n = boxes.filter(function (b) { return b.checked; }).length; push.textContent = 'Approve and push ' + n + ' term' + (n === 1 ? '' : 's') + ' to Twitch'; }
      boxes.forEach(function (b) { b.addEventListener('change', count); }); count();
    }
  }

  /* ---------- mod join form ---------- */
  function modJoin() {
    var form = $('[data-join]'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('#join-code').value.replace(/\D/g, ''), name = $('#join-name').value.trim(), err = $('[data-join-err]');
      if (code.length !== 6) { err.textContent = 'Enter the 6-digit code from your streamer.'; $('#join-code').focus(); return; }
      if (code !== '482913') { err.textContent = 'That code doesn’t match a drill on this channel. Check it with your streamer.'; $('#join-code').focus(); return; }
      if (!name) { err.textContent = 'Add a display name so your team knows who caught what.'; $('#join-name').focus(); return; }
      err.textContent = '';
      $$('[data-modname]').forEach(function (n) { n.textContent = name; });
      $('[data-join-view]').hidden = true; $('[data-wait-view]').hidden = false;
      $('[data-wait-view] h1').focus();
    });
    var go = $('[data-go]');
    if (go) go.addEventListener('click', function () {
      $('[data-wait-view]').hidden = true; $('[data-drill-view]').hidden = false;
      var s = $('[data-drill-view] [data-start]'); if (s) s.click();
    });
  }

  /* ---------- overlay preview scaling ---------- */
  function stage() {
    var wrap = $('[data-stage]'); if (!wrap) return;
    var st = $('.stage', wrap);
    function fit() { var k = wrap.clientWidth / 1920; st.style.transform = 'scale(' + k + ')'; wrap.style.height = (1080 * k) + 'px'; }
    window.addEventListener('resize', fit); fit();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $$('[data-drill]').forEach(Drill);
    ruleCards(); consoleSteps(); copies(); consoleActions(); modJoin(); stage();
  });
})();
