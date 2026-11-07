/* Hero (experiment): the old contour lines, rebuilt from terminal symbols and
 * whipped up into a rough sea.
 * - Each vertical line is now a column of monospace glyphs. Their sideways
 *   position comes from the same kind of flow field as before (sums of sines),
 *   but with bigger, faster swells, so neighbouring lines swing into each other
 *   and cross: the waves crash.
 * - Where lines bunch up or cross (the local spacing collapses) and on passing
 *   crests, the water is "foamy": glyphs brighten and turn into dense symbols
 *   that flicker. Calm stretches are faint dots and dashes.
 * - The cursor is a ball moving through the water: a smooth dent where it sits,
 *   and a Kelvin-style V wake behind it. The wake is built the way a real one
 *   is: points along the cursor's path each emit a circular wavelet that
 *   spreads slower than the cursor moves, and their envelope forms the V.
 *   Clicking (or tapping) drops a ring ripple that spreads and fades.
 *   (Cost control: only glyphs inside the effects' bounding box are tested.)
 * - Glyphs dim behind the headline so it stays readable.
 * - Only animates while the hero is on screen; reduced motion = one still frame.
 */
(function () {
  "use strict";
  var hero = document.getElementById("top");
  var canvas = document.getElementById("hero-lines");
  var titleEl = document.getElementById("hero-titlewrap");
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // glyph ramps, calm -> foam
  var RAMP = [
    ".  .",            // 0 calm (spaces = gaps in the line)
    ".,:'`",           // 1
    ":;-~_",           // 2
    "=+<>-~",          // 3
    "/\\|{}[]()*",     // 4
    "#$%&@01"          // 5 foam
  ];
  var W = 0, H = 0, cw = 11, ch = 18, cols = 0, rows = 0;
  var rgb = "255,255,255", baseA = 0.9;
  var t = 0, last = 0, running = false, raf = 0, inView = true;
  var seeds = [];                 // per-cell random, so calm glyphs stay put
  var title = { x: 0, y: 0, rx: 1, ry: 1 };
  var pointer = { x: 0, y: 0, inside: false };
  var ball = { x: 0, y: 0, s: 0 };   // eases after the pointer; s = presence 0..1
  var trail = [];                     // wake emitters: { x, y, t, amp }
  var ripples = [];                   // click ripples: { x, y, t }
  var WAKE_C = 110, WAKE_LIFE = 1.8;  // wavelet speed (px/s) and lifetime (s)
  var RIP_C = 260, RIP_LIFE = 2.6;
  var lastMove = { x: 0, y: 0, at: 0 };

  function readTheme() {
    var light = document.documentElement.dataset.theme === "light";
    rgb = light ? "18,18,18" : "243,241,238";
    baseA = light ? 0.85 : 0.95;
  }
  function resize() {
    var r = hero.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var small = W < 700;
    cw = small ? 12 : 11; ch = small ? 15 : 15;
    cols = Math.ceil(W / cw) + 1; rows = Math.ceil(H / ch) + 1;
    seeds = new Float32Array(Math.max(cols * rows, 1) * 2);
    for (var i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    ctx.font = (small ? 12 : 13) + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (titleEl) {
      var tr = titleEl.getBoundingClientRect();
      title.x = tr.left - r.left + tr.width / 2; title.y = tr.top - r.top + tr.height / 2;
      title.rx = tr.width * 0.62; title.ry = tr.height * 0.75;
    }
  }

  // peaked crest: 0 in the trough, 1 at a sharp top
  function crest(p) { var s = 0.5 + 0.5 * Math.sin(p); return s * s * s; }

  // sideways swing of the line resting at x0, at height y (big and fast: lines cross)
  function swing(x0, y) {
    var env = 0.6 + 0.4 * Math.sin(x0 * 0.003 + y * 0.002 - t * 0.35 + 0.7);
    var s = 56 * Math.sin(x0 * 0.0042 + y * 0.0062 + t * 0.85 + 2.3)            // big swell
          + 42 * Math.sin(-x0 * 0.0031 + y * 0.0049 - t * 1.05 + 0.4)           // opposing swell: collisions
          + env * (18 * Math.sin(x0 * 0.012 + y * 0.017 + t * 1.5)
                 + 10 * Math.sin(-x0 * 0.021 + y * 0.03 - t * 1.9 + 1.7)
                 +  5 * Math.sin(x0 * 0.03 + y * 0.05 + t * 2.6 + 4.1));
    return s;
  }

  // The cursor's effect at a glyph's position: { ox, oy } push and extra foam.
  // Rings (wake wavelets + click ripples) are prepared once per frame in
  // prepRings(); glyphs outside their combined bounding box skip all of this.
  var dist = { ox: 0, oy: 0, foam: 0 };
  var rings = [], nRings = 0, box = { x0: 0, y0: 0, x1: -1, y1: -1 };
  function addRing(cx, cy, r, w, amp, push, glow) {
    if (amp < 0.03) return;
    var lim = r + 3 * w, inner = Math.max(0, r - 3 * w);
    var o = rings[nRings] || (rings[nRings] = {});
    o.cx = cx; o.cy = cy; o.r = r; o.w = w; o.amp = amp; o.push = push; o.glow = glow;
    o.lim2 = lim * lim; o.in2 = inner * inner; nRings++;
    if (cx - lim < box.x0) box.x0 = cx - lim; if (cx + lim > box.x1) box.x1 = cx + lim;
    if (cy - lim < box.y0) box.y0 = cy - lim; if (cy + lim > box.y1) box.y1 = cy + lim;
  }
  function prepRings() {
    nRings = 0; box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity;
    for (var i = 0; i < trail.length; i++) {             // the wake
      var p = trail[i], age = t - p.t, f = 1 - age / WAKE_LIFE;
      addRing(p.x, p.y, WAKE_C * age, 8 + age * 16, f * f * p.amp, 9, 0.55);
    }
    for (var j = 0; j < ripples.length; j++) {           // click ripples
      var q = ripples[j], qa = t - q.t, g = 1 - qa / RIP_LIFE;
      addRing(q.x, q.y, RIP_C * qa, 10 + qa * 12, g * g, 22, 0.9);
    }
    if (ball.s > 0.01) {                                   // the ball's reach
      if (ball.x - 80 < box.x0) box.x0 = ball.x - 80; if (ball.x + 80 > box.x1) box.x1 = ball.x + 80;
      if (ball.y - 80 < box.y0) box.y0 = ball.y - 80; if (ball.y + 80 > box.y1) box.y1 = ball.y + 80;
    }
  }
  function disturb(x, y) {
    dist.ox = 0; dist.oy = 0; dist.foam = 0;
    for (var i = 0; i < nRings; i++) {
      var o = rings[i], dx = x - o.cx, dy = y - o.cy, d2 = dx * dx + dy * dy;
      if (d2 > o.lim2 || d2 < o.in2) continue;           // outside this ring's band: no sqrt needed
      var d = Math.sqrt(d2), u = (d - o.r) / o.w;
      var wv = Math.cos(u * 2.2) * Math.exp(-u * u) * o.amp, inv = 1 / (d + 1);
      dist.ox += wv * o.push * dx * inv; dist.oy += wv * o.push * dy * inv;
      dist.foam += Math.abs(wv) * o.glow;
    }
    if (ball.s > 0.01) {                                   // the ball: a smooth dent with a foamy rim
      var bx = x - ball.x, by = (y - ball.y) * 0.9, R = 70, b2 = (bx * bx + by * by) / (R * R);
      if (b2 < 1) {
        var k = 1 - b2; k *= k;
        dist.ox += bx * 0.7 * k * ball.s; dist.oy += by * 0.45 * k * ball.s;
        dist.foam += k * (1 - k) * 1.4 * ball.s;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var tick = Math.floor(t * 12);   // foam re-rolls its symbols ~12x a second
    var busy = ball.s > 0.01 || trail.length > 0 || ripples.length > 0;
    if (busy) prepRings();
    var gap = cw * 1.35;             // resting distance between lines
    var n = Math.ceil(W / gap) + 8;
    for (var li = 0; li < n; li++) {
      var x0 = (li - 4) * gap;
      for (var r = 0; r < rows; r++) {
        var y = r * ch + ch / 2;
        var vy = y / H, edge = Math.min(1, vy / 0.16, (1 - vy) / 0.2);
        if (edge <= 0) continue;
        var sw = swing(x0, y);
        var x = x0 + sw;
        if (x < -cw || x > W + cw) continue;
        // spacing to the next line: < 1 means bunching, < 0 means the lines crossed
        var spacing = 1 + (swing(x0 + gap, y) - sw) / gap;
        var bunch = Math.max(0, Math.min(1, (1 - spacing) * 0.85));
        var wave = crest(y * 0.012 - x0 * 0.004 - t * 2.2) * 0.5 + crest(-y * 0.009 + x0 * 0.006 - t * 1.7 + 2) * 0.38;
        var gy = y;
        var near = busy && x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1;
        if (near) { disturb(x, y); x += dist.ox; gy += dist.oy; }
        var I = Math.min(1, 0.12 + bunch + wave + (near ? dist.foam : 0));
        var lvl = I < 0.2 ? 0 : I < 0.32 ? 1 : I < 0.46 ? 2 : I < 0.6 ? 3 : I < 0.78 ? 4 : 5;
        var set = RAMP[lvl], idx = (li * rows + r) % seeds.length;
        var pick = lvl === 5 ? (seeds[idx] * 97 + tick) | 0 : (seeds[idx] * 31) | 0;
        var g = set.charAt(pick % set.length);
        if (g === " ") continue;
        var ex = (x - title.x) / title.rx, ey = (y - title.y) / title.ry;
        var e2 = ex * ex + ey * ey, hush = e2 < 1 ? 0.15 + 0.85 * e2 * e2 : 1;
        var a = baseA * edge * hush * (0.16 + 0.84 * Math.pow(I, 1.4));
        if (a < 0.06) continue;
        ctx.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
        ctx.fillText(g, x, gy);
      }
    }
  }

  function frame(now) {
    var dt = last ? Math.min(now - last, 100) : 16.7;
    last = now; t += dt / 1000;
    var k = Math.min(1, dt / 16.7);
    if (pointer.inside) { ball.x += (pointer.x - ball.x) * 0.25 * k; ball.y += (pointer.y - ball.y) * 0.25 * k; }
    ball.s += ((pointer.inside ? 1 : 0) - ball.s) * (pointer.inside ? 0.08 : 0.04) * k;
    while (trail.length && t - trail[0].t > WAKE_LIFE) trail.shift();
    while (ripples.length && t - ripples[0].t > RIP_LIFE) ripples.shift();
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduce.matches || !inView || document.hidden) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    var r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointer.inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    if (!pointer.inside) return;
    if (ball.s < 0.02) { ball.x = x; ball.y = y; }
    pointer.x = x; pointer.y = y;
    // drop a wake emitter every ~14px of travel; faster moves make a stronger wake
    var now = performance.now(), mx = x - lastMove.x, my = y - lastMove.y, moved = Math.sqrt(mx * mx + my * my);
    if (moved >= 20) {
      var speed = moved / Math.max(8, now - lastMove.at) * 1000;          // px/s
      trail.push({ x: x, y: y, t: t, amp: Math.max(0.25, Math.min(1, speed / 700)) });
      if (trail.length > 24) trail.shift();
      lastMove.x = x; lastMove.y = y; lastMove.at = now;
    }
  }, { passive: true });
  // click / tap: a ring ripple (not when pressing a link or button)
  hero.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || e.target.closest("a, button, kbd")) return;
    var r = hero.getBoundingClientRect();
    ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: t });
    if (ripples.length > 5) ripples.shift();
    if (!running) start();
  });
  document.documentElement.addEventListener("pointerleave", function () { pointer.inside = false; });

  readTheme(); resize(); t = 3; draw();
  start();
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { resize(); draw(); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { resize(); draw(); });
  new MutationObserver(function () { readTheme(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { inView = en[0].isIntersecting; inView ? start() : stop(); }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

  // Nav is see-through only at the very top of the page (carried over from hero.js).
  var nav = document.getElementById("nav");
  if (nav) {
    var syncNav = function () { nav.classList.toggle("nav--clear", window.scrollY < 8); };
    window.addEventListener("scroll", syncNav, { passive: true });
    syncNav();
  }
})();
