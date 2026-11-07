/* Hero (experiment): the old contour lines, rebuilt from terminal symbols and
 * whipped up into a rough sea.
 * - Each vertical line is now a column of monospace glyphs. Their sideways
 *   position comes from the same kind of flow field as before (sums of sines),
 *   but with bigger, faster swells, so neighbouring lines swing into each other
 *   and cross: the waves crash.
 * - Where lines bunch up or cross (the local spacing collapses) and on passing
 *   crests, the water is "foamy": glyphs brighten and turn into dense symbols
 *   that flicker. Calm stretches are faint dots and dashes.
 * - The cursor is a boat: it leaves a Kelvin wake that lives in the water, not
 *   on the cursor. Every bit of the recent path remembers when it was made and
 *   how fast the cursor was going. Waves made there spread sideways as they
 *   age: the arms sit at |n| = 0.354 x speed x age (about 19.5 degrees for a
 *   steady straight run, the Kelvin angle), each a few streaks fanning at
 *   slightly smaller angles, with churn just behind the cursor and calmer water
 *   inside the V. So the wake stays where it was made, keeps spreading and
 *   fades: when the cursor stops it dissipates. Each path segment covers the
 *   glyphs beside it (rounded caps at the path's end and at sharp turns), and where segments overlap the
 *   strongest one wins rather than adding up. Sharp turns damp the V arms, so
 *   wiggling back and forth leaves churn near the path, not a solid block.
 * - Clicking (or tapping) drops a ring ripple that spreads and fades.
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
  var path = [];                      // cursor's recent path, oldest first: { x, y, t, u (speed px/s) }
  var ripples = [];                   // click ripples: { x, y, t }
  var WAKE_LIFE = 2.2;                // seconds a wave made on the path lives
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
  // Prepared once per frame; glyphs outside the combined bounding box skip it.
  var dist = { ox: 0, oy: 0, foam: 0, calm: 0 };   // calm: how much to settle the sea here (inside a wake)
  var box = { x0: 0, y0: 0, x1: -1, y1: -1 };
  function grow(x0, y0, x1, y1) {
    if (x0 < box.x0) box.x0 = x0; if (x1 > box.x1) box.x1 = x1;
    if (y0 < box.y0) box.y0 = y0; if (y1 > box.y1) box.y1 = y1;
  }

  // Click ripples: rings.
  var rings = [], nRings = 0;
  function prepRipples() {
    nRings = 0;
    for (var j = 0; j < ripples.length; j++) {
      var q = ripples[j], qa = t - q.t, g = 1 - qa / RIP_LIFE, amp = g * g;
      if (amp < 0.03) continue;
      var r = RIP_C * qa, w = 10 + qa * 12, lim = r + 3 * w, inner = Math.max(0, r - 3 * w);
      var o = rings[nRings] || (rings[nRings] = {});
      o.cx = q.x; o.cy = q.y; o.r = r; o.w = w; o.amp = amp; o.lim2 = lim * lim; o.in2 = inner * inner; nRings++;
      grow(q.x - lim, q.y - lim, q.x + lim, q.y + lim);
    }
  }

  // The wake: path segments from the cursor backwards (newest first).
  // 0.354 = tan(19.47 deg), the Kelvin wake half-angle.
  var segs = [], nSegs = 0, MAX_SPREAD = 260;
  function prepWake() {
    nSegs = 0;
    if (!path.length) return;
    var pts = path.slice();
    if (pointer.inside) pts.push({ x: pointer.x, y: pointer.y, t: t, u: path[path.length - 1].u });
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, reach = 0;
    for (var i = pts.length - 1; i > 0; i--) {
      var A = pts[i], B = pts[i - 1], dx = B.x - A.x, dy = B.y - A.y, len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.5 || t - B.t > WAKE_LIFE) continue;
      var o = segs[nSegs] || (segs[nSegs] = {});
      o.ax = A.x; o.ay = A.y; o.ux = dx / len; o.uy = dy / len; o.len = len;
      o.ta = A.t; o.tb = B.t; o.ua = A.u; o.ub = B.u;
      var oldest = t - B.t, w = 3 + oldest * 22;
      o.maxN = Math.min(MAX_SPREAD, 0.354 * Math.max(A.u, B.u) * oldest) + 3 * w + 8;
      reach = Math.max(reach, o.maxN);
      nSegs++;
      minX = Math.min(minX, A.x, B.x); maxX = Math.max(maxX, A.x, B.x);
      minY = Math.min(minY, A.y, B.y); maxY = Math.max(maxY, A.y, B.y);
    }
    // straightness: how well each segment lines up with its neighbours (1 straight, 0 at a reversal)
    // ...and where its ends get a rounded cap: the path's oldest end and sharp
    // turns only (never at the cursor, so nothing shows ahead of it)
    for (var s = 0; s < nSegs; s++) {
      var o2 = segs[s], dA = 1, dB = 1;
      if (s > 0) dA = o2.ux * segs[s - 1].ux + o2.uy * segs[s - 1].uy;
      if (s < nSegs - 1) dB = o2.ux * segs[s + 1].ux + o2.uy * segs[s + 1].uy;
      o2.straight = Math.max(0, Math.min(1, (Math.min(dA, dB) - 0.1) / 0.8));
      o2.capA = s > 0 && dA < 0.3;
      o2.capB = s === nSegs - 1 || dB < 0.3;
    }
    if (nSegs) grow(minX - reach, minY - reach, maxX + reach, maxY + reach);
  }
  var STREAKS = [1, 0.85, 0.7, 0.54], STREAK_W = [1, 0.7, 0.55, 0.4];   // fractions of the Kelvin arm
  function wakeAt(x, y) {
    var bestV = 0, bestCalm = 0, pushX = 0, pushY = 0;
    for (var i = 0; i < nSegs; i++) {
      var o = segs[i], px = x - o.ax, py = y - o.ay;
      var along = px * o.ux + py * o.uy;
      var n = o.ux * py - o.uy * px;
      // past a segment's ends the wave spreads from the end point like a point
      // source (a rounded cap), so wakes never end in a hard edge
      var over = along < 0 ? -along : along > o.len ? along - o.len : 0;
      var capped = over > 0 && (along < 0 ? o.capA : o.capB);
      if (along < 0 && segs[0] === o) continue;              // ahead of the cursor: nothing
      var an = capped ? Math.sqrt(over * over + n * n) : (n < 0 ? -n : n);
      if (an > o.maxN) continue;
      var f = along / o.len, fc = f < 0 ? 0 : f > 1 ? 1 : f;
      var age = t - (o.ta + (o.tb - o.ta) * fc);
      if (age < 0 || age > WAKE_LIFE) continue;
      var w = 3 + age * 22, taper = 1;
      if (over > 0 && !capped) {                             // smooth joint: short taper only
        if (over > w * 1.5) continue;
        taper = 1 - over / (w * 1.5);
      }
      var U = o.ua + (o.ub - o.ua) * fc;
      var spread = Math.min(MAX_SPREAD, 0.354 * U * age);
      var fade = Math.pow(1 - age / WAKE_LIFE, 1.6) * Math.max(0.3, Math.min(1, U / 600)) * taper;
      var arms = 0;
      for (var k = 0; k < STREAKS.length; k++) {
        var r = (an - spread * STREAKS[k]) / w;
        arms += STREAK_W[k] * Math.exp(-r * r);
      }
      var cwid = 4 + age * 18, cen = Math.exp(-(an * an) / (cwid * cwid)) * Math.exp(-age / 0.3);
      var armK = capped ? 1 : 0.35 + 0.65 * o.straight;      // turns soften the arms; caps keep them
      var v = (arms * 1.5 * armK * Math.min(1, age / 0.12) + cen * 0.8) * fade;
      if (v > bestV) {
        bestV = v;
        var side = n < 0 ? -1 : 1;                            // push glyphs away from the path
        pushX = -o.uy * side * v * 5; pushY = o.ux * side * v * 5;
      }
      var inside = Math.max(0, Math.min(1, (spread - an) / (w * 2)));
      bestCalm = Math.max(bestCalm, inside * fade * o.straight * 0.7);
    }
    dist.ox += pushX; dist.oy += pushY;
    dist.foam += bestV;
    dist.calm = Math.max(dist.calm, bestCalm);
  }

  function disturb(x, y) {
    dist.ox = 0; dist.oy = 0; dist.foam = 0; dist.calm = 0;
    for (var i = 0; i < nRings; i++) {
      var o = rings[i], dx = x - o.cx, dy = y - o.cy, d2 = dx * dx + dy * dy;
      if (d2 > o.lim2 || d2 < o.in2) continue;               // outside this ring's band: no sqrt needed
      var d = Math.sqrt(d2), u = (d - o.r) / o.w;
      var wv = Math.cos(u * 2.2) * Math.exp(-u * u) * o.amp, inv = 1 / (d + 1);
      dist.ox += wv * 22 * dx * inv; dist.oy += wv * 22 * dy * inv;
      dist.foam += Math.abs(wv) * 0.9;
    }
    if (nSegs) wakeAt(x, y);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var tick = Math.floor(t * 12);   // foam re-rolls its symbols ~12x a second
    box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity;
    prepRipples(); prepWake();
    var busy = nRings > 0 || nSegs > 0;
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
        var sea = 0.12 + bunch + wave;
        var I = near ? Math.min(1, sea * (1 - dist.calm) + dist.foam) : Math.min(1, sea);
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
    while (path.length && t - path[0].t > WAKE_LIFE) path.shift();
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
    pointer.x = x; pointer.y = y;
    // record the path every ~12px; faster moves make a stronger wake
    var now = performance.now(), mx = x - lastMove.x, my = y - lastMove.y, moved = Math.sqrt(mx * mx + my * my);
    if (moved >= 12 || !path.length) {
      var speed = moved / Math.max(8, now - lastMove.at) * 1000;          // px/s
      path.push({ x: x, y: y, t: t, u: Math.max(120, Math.min(1100, speed)) });
      if (path.length > 70) path.shift();
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
