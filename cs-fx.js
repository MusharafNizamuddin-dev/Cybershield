/*
 * CyberShield FX  (loaded by every page with <script src="cs-fx.js" defer>)
 *  1. Animated "live network" background behind every screen, including inside tools.
 * No libraries, no permissions. Respects the phone's "remove animations" setting.
 */
(function () {
  'use strict';
  if (window.__csFx) return;
  window.__csFx = true;

  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ------------------------------------------------------------------ */
  /*  1. BACKGROUND MOTION                                               */
  /* ------------------------------------------------------------------ */
  var bgControl = { pause: function () {}, resume: function () {} };

  function initBackground() {
    // Make the page background see-through so the canvas (behind everything) shows.
    var htmlBg = getComputedStyle(root).backgroundColor;
    if (!htmlBg || htmlBg === 'rgba(0, 0, 0, 0)' || htmlBg === 'transparent') {
      root.style.backgroundColor = getComputedStyle(document.body).backgroundColor || '#020914';
    }
    // The soft colour glows live on the canvas layer: a "fixed" body background repaints on every scroll frame.
    var st = document.createElement('style');
    st.textContent =
      'body{background-color:transparent!important;background-image:none!important;background-attachment:scroll!important}' +
      // Blur effects over a moving layer are expensive. Opaque-ish backgrounds look the same and scroll much smoother.
      '*{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}' +
      '.modal,.modal-backdrop{background:rgba(var(--cs-bg-rgb,2,9,20),.9)!important}' +
      '#cs-fx-bg{position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;max-width:none;transform:translateZ(0);' +
      'background:radial-gradient(820px 400px at 50% -140px,rgba(var(--cs-accent-2-rgb,0,217,255),.09),transparent 70%),' +
      'radial-gradient(500px 300px at 100% 30%,rgba(var(--cs-accent-rgb,0,255,157),.05),transparent 70%)}';
    document.head.appendChild(st);

    var cv = document.createElement('canvas');
    cv.id = 'cs-fx-bg';
    cv.setAttribute('aria-hidden', 'true');
    root.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var cA = '0,217,255', cB = '0,255,157', light = false;
    function cssRgb(name, fb) {
      var v = getComputedStyle(root).getPropertyValue(name).trim();
      return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) ? v : fb;
    }
    function readColors() {
      cA = cssRgb('--cs-accent-2-rgb', '0,217,255');
      cB = cssRgb('--cs-accent-rgb', '0,255,157');
      light = root.getAttribute('data-cs-scheme') === 'light';
    }
    readColors();
    setInterval(function () { if (!scrolling) readColors(); }, 3000); // picks up theme / palette changes (never during a scroll)

    var W = 0, H = 0, link = 120, nodes = [], packets = [], raf = 0, last = 0, nextPacket = 0;
    var gap = 40, level = 0, emaCost = 0, frames = 0, stopped = false, scrolling = false, scrollTimer = 0, paused = false;
    var lb = [[], [], [], []], LA = [0.10, 0.20, 0.30, 0.42];
    var targetNodes = 0;

    function mk() {
      var a = Math.random() * 6.2832, s = 5 + Math.random() * 12;
      return { x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
               r: 1 + Math.random() * 1.4, g: Math.random() < 0.28 };
    }
    function resize() {
      // 1x canvas on purpose: this is soft ambient art, and it is 4x cheaper than full phone resolution.
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W; cv.height = H;
      targetNodes = Math.max(30, Math.min(64, Math.round(W * H / 12000)));
      var n = Math.round(targetNodes * (level === 0 ? 1 : level === 1 ? 0.7 : 0.5));
      while (nodes.length < n) nodes.push(mk());
      nodes.length = n;
      link = Math.max(95, Math.min(150, W * 0.32));
      if (reduce || stopped) draw(0, 0);
    }

    function draw(dt, t) {
      var k = light ? 0.55 : 1, i, j, b, n, m, dx, dy, d, q, arr;
      ctx.clearRect(0, 0, W, H);

      // slow scan band
      var by = ((t / 1000) % 11) / 11 * (H + 240) - 120;
      var g = ctx.createLinearGradient(0, by - 120, 0, by + 120);
      g.addColorStop(0, 'rgba(' + cA + ',0)');
      g.addColorStop(0.5, 'rgba(' + cA + ',' + (0.06 * k).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + cA + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, by - 120, W, 240);

      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
      }

      // links: sorted into 4 strength buckets so the whole frame needs only 4 stroke calls
      for (b = 0; b < 4; b++) lb[b].length = 0;
      var l2 = link * link;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          m = nodes[j]; dx = n.x - m.x; dy = n.y - m.y;
          d = dx * dx + dy * dy;
          if (d < l2) {
            q = 1 - Math.sqrt(d) / link;
            arr = lb[q > 0.75 ? 3 : q > 0.5 ? 2 : q > 0.25 ? 1 : 0];
            arr.push(n.x, n.y, m.x, m.y);
          }
        }
      }
      ctx.lineWidth = 1;
      for (b = 0; b < 4; b++) {
        arr = lb[b];
        if (!arr.length) continue;
        ctx.strokeStyle = 'rgba(' + cA + ',' + (LA[b] * k).toFixed(3) + ')';
        ctx.beginPath();
        for (i = 0; i < arr.length; i += 4) { ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]); }
        ctx.stroke();
      }

      // nodes: one path per colour
      var pass, col;
      for (pass = 0; pass < 2; pass++) {
        col = pass ? cB : cA;
        if (pass) {
          ctx.fillStyle = 'rgba(' + col + ',' + (0.10 * k).toFixed(3) + ')';
          ctx.beginPath();
          for (i = 0; i < nodes.length; i++) if (nodes[i].g) { ctx.moveTo(nodes[i].x + nodes[i].r + 4, nodes[i].y); ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r + 4, 0, 6.2832); }
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(' + col + ',' + (0.85 * k).toFixed(3) + ')';
        ctx.beginPath();
        for (i = 0; i < nodes.length; i++) if (!!nodes[i].g === !!pass) { ctx.moveTo(nodes[i].x + nodes[i].r, nodes[i].y); ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r, 0, 6.2832); }
        ctx.fill();
      }

      // little "data packets" travelling along links (switched off on slower phones)
      if (!reduce && level < 2 && t > nextPacket && packets.length < 3) {
        nextPacket = t + 900 + Math.random() * 900;
        var s = nodes[(Math.random() * nodes.length) | 0], best = null;
        for (j = 0; j < nodes.length; j++) {
          m = nodes[j]; if (m === s) continue;
          dx = s.x - m.x; dy = s.y - m.y;
          if (dx * dx + dy * dy < l2 && Math.random() < 0.5) { best = m; break; }
        }
        if (best) packets.push({ a: s, b: best, p: 0, v: 0.6 + Math.random() * 0.6 });
      }
      for (i = packets.length - 1; i >= 0; i--) {
        var pk = packets[i];
        pk.p += pk.v * dt;
        dx = pk.a.x - pk.b.x; dy = pk.a.y - pk.b.y;
        if (pk.p >= 1 || dx * dx + dy * dy > l2 * 1.7) { packets.splice(i, 1); continue; }
        var px = pk.a.x + (pk.b.x - pk.a.x) * pk.p, py = pk.a.y + (pk.b.y - pk.a.y) * pk.p;
        ctx.fillStyle = 'rgba(' + cB + ',' + (0.18 * k).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(' + cB + ',' + (0.95 * k).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 6.2832); ctx.fill();
      }
    }

    // Self-tuning: if the phone is struggling, use fewer dots, then a lower frame rate, then stop moving.
    function govern(cost) {
      emaCost = emaCost ? emaCost * 0.9 + cost * 0.1 : cost;
      if (++frames % 45 !== 0) return;
      if (emaCost > 12) { stopped = true; stop(); draw(0, 0); return; }
      if (emaCost > 6) {
        if (level < 2) { level++; resize(); emaCost = 0; }
        else if (gap < 50) { gap = 50; emaCost = 0; }
      }
    }

    function step(t) {
      raf = requestAnimationFrame(step);
      if (paused) { last = t; return; }                // only pop-ups pause it
      if (t - last < (scrolling && gap < 66 ? 66 : gap)) return;  // while scrolling: same motion, fewer frames
      var dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      var t0 = performance.now();
      draw(dt, t);
      govern(performance.now() - t0);
    }
    function start() { if (!raf && !reduce && !stopped && !paused) { last = performance.now(); raf = requestAnimationFrame(step); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    // While the page is moving the animation keeps running (it never freezes),
    // it just draws fewer frames per second so scrolling stays smooth.
    function onMoving() {
      scrolling = true; clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () { scrolling = false; }, 200);
    }
    var po = { passive: true, capture: true };
    window.addEventListener('scroll', onMoving, po);
    window.addEventListener('touchmove', onMoving, po);
    window.addEventListener('wheel', onMoving, po);

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    bgControl.pause = function () { paused = true; };
    bgControl.resume = function () { paused = false; last = performance.now(); start(); };
    resize();
    start();
  }

  /* ------------------------------------------------------------------ */
  /*  1b. SMOOTHNESS + CLARITY POLISH (all pages)                        */
  /* ------------------------------------------------------------------ */
  function initPolish() {
    var st = document.createElement('style');
    st.textContent =
      // soft, quick press feedback everywhere (":where" = zero weight, so a page's own style always wins)
      ':where(a.tool,.menu-item,.btn,.ig-btn,.mini,button,summary){transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .2s ease,border-color .2s ease,opacity .2s ease,box-shadow .2s ease}' +
      ':where(a.tool,.menu-item,.btn,.ig-btn,button):active{transform:scale(.975)}' +
      ':where(a,button,summary,input,select,label,[onclick]){touch-action:manipulation}' +
      // native feel: buttons and headings should not start a text selection on long-press
      ':where(button,.btn,.ig-btn,a.tool,.menu-item,.top,nav,summary,.pill,.eyebrow,h1,h2,h3){-webkit-user-select:none;user-select:none}' +
      // comfortable tap sizes
      '.ig-btn,.manual-btn,#connBtn{min-height:44px}' +
      ':where(summary){padding-top:12px;padding-bottom:12px}' +
      // very narrow phones (320dp): keep the light/dark + palette buttons on screen
      '@media (max-width:350px){html .cs-brand{font-size:17px!important;gap:6px!important}html .cs-brand .cs-shield{width:21px!important;height:21px!important}' +
      'html .csx-hbar{gap:5px!important;flex:none!important}html .csx-hbtn{width:34px!important;height:34px!important;min-width:0!important}' +
      'html .cs-back,html .back{width:36px!important;height:36px!important;min-width:0!important}}';
    document.head.appendChild(st);

    // Muted "dim" text must stay readable (at least 4.8:1) in every theme, dark or light.
    var lastAdj = '';
    function hexRgb(h) {
      var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((h || '').trim());
      if (!m) return null;
      var x = m[1];
      if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
      return [parseInt(x.substr(0, 2), 16), parseInt(x.substr(2, 2), 16), parseInt(x.substr(4, 2), 16)];
    }
    function lum(c) {
      var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }
    function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    function adjustDim() {
      var raw = root.style.getPropertyValue('--cs-dim').trim();
      var bg = hexRgb(root.style.getPropertyValue('--cs-bg'));
      var d = hexRgb(raw);
      if (!raw || raw === lastAdj || !bg || !d) return;
      var target = lum(bg) < 0.4 ? [255, 255, 255] : [0, 0, 0], i = 0;
      while (ratio(d, bg) < 4.8 && i++ < 40) {
        d = [Math.round(d[0] + (target[0] - d[0]) * 0.05), Math.round(d[1] + (target[1] - d[1]) * 0.05), Math.round(d[2] + (target[2] - d[2]) * 0.05)];
      }
      lastAdj = '#' + d.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
      root.style.setProperty('--cs-dim', lastAdj);
    }
    try { new MutationObserver(adjustDim).observe(root, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}
    adjustDim();
  }


  /* ------------------------------------------------------------------ */
  /*  1c. SMOOTH PAGE TRANSITIONS + BACK HANDLING (all pages)            */
  /*      - every page slides/fades in, and slides/fades out on leaving  */
  /*      - the arrow on top and the phone Back button behave the same   */
  /*      - one place for this, so every tool feels identical            */
  /* ------------------------------------------------------------------ */
  var NAV_KEY = 'cs_nav_dir';
  var onHome = /(^|\/)index\.html$/.test(location.pathname);
  var leaving = false;

  function initNav() {
    // 1) which way did we arrive? ("fwd" into a tool, "back" to the dashboard, "" = first start)
    var dir = '';
    try { dir = sessionStorage.getItem(NAV_KEY) || ''; sessionStorage.removeItem(NAV_KEY); } catch (e) {}
    var st = document.createElement('style');
    st.id = 'cs-nav-css';
    st.textContent =
      '@keyframes cs-in{from{opacity:.4}to{opacity:1}}' +
      'html.cs-in-fwd body,html.cs-in-back body,html.cs-in-fade body{animation:cs-in .2s ease-out both}' +
      '@media (prefers-reduced-motion:reduce){html.cs-in-fwd body,html.cs-in-back body,html.cs-in-fade body{animation:none!important}}';
    document.head.appendChild(st);

    var cls = 'cs-in-' + (dir === 'fwd' || dir === 'back' ? dir : 'fade');
    root.classList.add(cls);
    // Keep the class: the finished animation holds the page still, so the page's own
    // fade-in can never start again (that was the second blink).
    window.addEventListener('pageshow', function () {
      leaving = false;
      root.classList.remove('cs-lv-fwd', 'cs-lv-back');
    });

    // 2) every link to another bundled page goes through the same animated path
    window.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      var h = a.getAttribute('href') || '';
      if (!/^[\w-]+\.html([?#].*)?$/.test(h)) return;
      e.preventDefault(); // pages' older fade handlers see "defaultPrevented" and stay out of the way
      go(h);
    }, true);

    // 3) the dashboard menu opens tools with menuGoTo(): give it the same animation
    var prev = window.menuGoTo;
    if (typeof prev === 'function') {
      window.menuGoTo = function (page) {
        try { if (typeof window.closeMenu === 'function') window.closeMenu(); } catch (e) {}
        go(page);
      };
    }
  }

  // Go to another bundled page with the leave animation. Returns true if a trip started.
  function go(href) {
    if (leaving) return true;
    leaving = true;
    var toHome = /^index\.html/.test(href);
    var back = toHome && !onHome;
    try { sessionStorage.setItem(NAV_KEY, back ? 'back' : 'fwd'); } catch (e) {}
    // no waiting: the old page stays on screen until the new one is ready (no empty screen)
    // coming back to the dashboard REPLACES the tool page, so the phone's Back button never loops
    if (back) location.replace(href); else location.href = href;
    // if nothing happened (blocked), do not leave the screen blank
    setTimeout(function () { if (document.visibilityState !== 'hidden') { leaving = false; root.classList.remove('cs-lv-fwd', 'cs-lv-back'); } }, 2500);
    return true;
  }

  // Is this element really on screen right now?
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05 || cs.pointerEvents === 'none') return false;
    var r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }

  // Phone Back button: close what is open on this page first, otherwise go to the dashboard.
  // Returns true when it did something (so the app does not also leave).
  function pressBack() {
    try {
      var sheet = document.querySelector('.csx-sheet.on');                      // appearance sheet
      if (sheet && window.CS && typeof window.CS.closeAppearance === 'function') { window.CS.closeAppearance(); return true; }
      if (typeof window.closeMenu === 'function' && document.querySelector('.menu-overlay.show')) { window.closeMenu(); return true; }
      // a pop-up with an obvious Close / Cancel button
      var boxes = document.querySelectorAll('.modal,.sheet,.manual-modal,.sk-modal,.cs-sheet,[role=dialog]');
      for (var i = boxes.length - 1; i >= 0; i--) {
        var b = boxes[i];
        if (!visible(b)) continue;
        var btns = b.querySelectorAll('button,a,[role=button]');
        for (var j = 0; j < btns.length; j++) {
          var t = ((btns[j].textContent || '') + ' ' + (btns[j].getAttribute('aria-label') || '') + ' ' + (btns[j].id || '') + ' ' + (btns[j].className || '')).toLowerCase();
          if (visible(btns[j]) && /(^|[\s_-])(close|cancel|dismiss|not now|no thanks)([\s_-]|$)|\u2715|\u00d7/.test(t) && !/delete|remove|erase|uninstall|yes/.test(t)) { btns[j].click(); return true; }
        }
      }
      if (onHome) return false;                                                 // dashboard: let the app decide (leave the app)
      go('index.html');
      return true;
    } catch (e) { return false; }
  }

  window.CSNav = { go: go, back: pressBack };

  try { initNav(); } catch (e) { /* transitions are optional, never break a page */ }

  function boot() {
    try { initPolish(); } catch (e) { /* polish is optional, never break a page */ }
    try { initBackground(); } catch (e) { /* the background is decoration only, never break a page */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
