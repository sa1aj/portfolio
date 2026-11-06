/* Hero line field.
 * - Dense, faint vertical lines meander like contour lines. Their shape comes from
 *   a smooth "flow field": five sine waves at different sizes and angles, scaled
 *   by a slowly drifting envelope, so neighbouring lines share bends but drift in
 *   and out of step (bunching here, spreading there). All motion stays slow.
 * - No-crossing guarantee: the field's sideways slope stays below ~0.55, and a
 *   line's x is x0 + field(x0), so x always increases with x0 -> lines keep order.
 * - Around the cursor they bulge outward in a circular lens. The push is a smooth
 *   falloff, (1 - d^2)^2, applied sideways, so lines bend around an invisible
 *   sphere and never cross.
 * - The lens is a strong, slightly tall oval; it eases after the cursor and
 *   relaxes when the cursor leaves the hero. Lines stay white (no colour tint).
 * - A soft purple orb rests behind the headline and follows the cursor on an
 *   underdamped spring, fading while it follows. In the light theme the headline
 *   inverts over it: a masked copy of the kicker + title tracks the orb (--mx/--my/--mr).
 */
(function () {
  "use strict";

  var hero = document.getElementById("top");
  var canvas = document.getElementById("hero-lines");
  var orbEl = document.getElementById("hero-orb");
  var titleEl = document.getElementById("hero-h");
  var wrapEl = document.getElementById("hero-titlewrap");   // holds the inverted headline copy
  var wrapX = 0, wrapY = 0;        // headline box position inside the hero
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  var W = 0, H = 0, spacing = 30, step = 10;
  var lineX = [];                  // resting x of each line
  var lineRGB = "255,255,255", lineAlpha = 0.3;
  var followFade = 0.5;            // orb opacity while following (per theme, from CSS)
  var t = 0, last = 0, running = false, rafId = 0, inView = true;

  var pointer = { x: 0, y: 0, inside: false };
  var lens = { x: 0, y: 0, s: 0 }; // eased position + strength (0..1)
  var orb = { x: 0, y: 0, vx: 0, vy: 0, placed: false,
              fade: 1 };    // opacity: 1 at rest, fainter while following
  var home = { x: 0, y: 0 };       // orb resting spot: centre of the headline

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    lineRGB = cs.getPropertyValue("--line-rgb").trim() || "255,255,255";
    lineAlpha = parseFloat(cs.getPropertyValue("--line-alpha")) || 0.3;
    followFade = parseFloat(cs.getPropertyValue("--orb-follow-fade")) || 0.5;
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Dense like the reference; a little sparser on phones (fewer lines = cheaper).
    spacing = W < 700 ? 18 : 16;
    step = W < 700 ? 12 : 9;
    lineX = [];
    for (var xs = -spacing * 4; xs <= W + spacing * 4; xs += spacing) lineX.push(xs);
    // Rest the orb on the headline's centre (falls back to the hero centre).
    if (titleEl) {
      var tr = titleEl.getBoundingClientRect();
      home.x = tr.left - r.left + tr.width / 2;
      home.y = tr.top - r.top + tr.height / 2;
    } else { home.x = W / 2; home.y = H / 2; }
    if (wrapEl && orbEl) {
      var wr = wrapEl.getBoundingClientRect();
      wrapX = wr.left - r.left; wrapY = wr.top - r.top;
      // The glow is radial-gradient(circle, ...) on a square, so its stops are
      // measured to the corner: half the width times sqrt(2).
      wrapEl.style.setProperty("--mr", (orbEl.offsetWidth * 0.7071).toFixed(1) + "px");
    }
    if (!orb.placed) { orb.x = home.x; orb.y = home.y; orb.placed = true; }
    placeOrb();
  }

  // Sideways offset of the line that rests at x0, at height y and time t.
  // Sum of |amplitude x x-frequency| ~= 0.48 (+ ~0.04 from the envelope) < 1, so lines never cross.
  // Speeds (the t multipliers) are all <= 0.6, slower than the earlier 0.85.
  function field(x0, y) {
    var env = 0.55 + 0.45 * Math.sin(x0 * 0.0023 + y * 0.0017 - t * 0.15 + 0.7); // wavier here, calmer there
    return 14 * Math.sin(x0 * 0.0035 + y * 0.006 + t * 0.22 + 2.3)              // big slow swell
      + env * ( 10  * Math.sin( x0 * 0.011 + y * 0.016 + t * 0.30)
              +  6  * Math.sin(-x0 * 0.019 + y * 0.029 - t * 0.42 + 1.7)
              +  4  * Math.sin( x0 * 0.027 + y * 0.045 + t * 0.55 + 4.1)
              + 2.4 * Math.sin(-x0 * 0.040 + y * 0.068 - t * 0.60 + 0.9));
  }

  function placeOrb() {
    if (!orbEl) return;
    orbEl.style.transform = "translate3d(" + orb.x.toFixed(1) + "px," + orb.y.toFixed(1) + "px,0)";
    orbEl.style.opacity = orb.fade.toFixed(3);
    if (wrapEl) {   // keep the inverted headline's mask on the orb
      wrapEl.style.setProperty("--mx", (orb.x - wrapX).toFixed(1) + "px");
      wrapEl.style.setProperty("--my", (orb.y - wrapY).toFixed(1) + "px");
    }
  }

  // ---------- Input (mouse / pen) ----------
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    var r = hero.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    pointer.inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    if (pointer.inside) {
      if (lens.s < 0.01) { lens.x = x; lens.y = y; } // appear where the cursor enters
      pointer.x = x; pointer.y = y;
    }
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", function () { pointer.inside = false; });
  window.addEventListener("blur", function () { pointer.inside = false; });

  // ---------- Drawing ----------
  function draw() {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);

    var R = Math.min(Math.max(W, H) * 0.2, 320);

    ctx.beginPath();
    for (var li = 0; li < lineX.length; li++) {
      var x0 = lineX[li];
      for (var y = -step; y <= H + step; y += step) {
        // t only advances while animating, so reduced motion gets one still (but wavy) frame.
        var dx = field(x0, y);
        if (lens.s > 0.002) {
          // Strong bulge (as in the earlier version); ey squashed a little -> slightly tall oval.
          // Measured from the waved position, so the bulge keeps line order and they never cross.
          var ex = x0 + dx - lens.x, ey = (y - lens.y) * 0.75;
          var d2 = (ex * ex + ey * ey) / (R * R);
          if (d2 < 1) { var f = 1 - d2; dx += ex * 0.9 * lens.s * f * f; }
        }
        if (y === -step) ctx.moveTo(x0 + dx, y); else ctx.lineTo(x0 + dx, y);
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + lineRGB + "," + lineAlpha + ")";
    ctx.stroke();

  }

  // ---------- Loop ----------
  function frame(now) {
    var dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    t += dt / 1000;
    var k = Math.min(1, dt / 16.7); // frame-rate independent easing
    var tx = pointer.inside ? pointer.x : lens.x, ty = pointer.inside ? pointer.y : lens.y;
    lens.x += (tx - lens.x) * 0.14 * k;
    lens.y += (ty - lens.y) * 0.14 * k;
    lens.s += ((pointer.inside ? 1 : 0) - lens.s) * (pointer.inside ? 0.08 : 0.04) * k;

    // Orb spring, stepped at a fixed 60 Hz so it feels the same on 60/120 Hz screens.
    var ox = pointer.inside ? pointer.x : home.x, oy = pointer.inside ? pointer.y : home.y;
    var n = Math.max(1, Math.min(6, Math.round(dt / 16.7)));
    for (var i = 0; i < n; i++) {
      // stiffness 0.03, damping 0.84: ~14% overshoot, settles in about a second
      orb.vx += (ox - orb.x) * 0.03;  orb.vy += (oy - orb.y) * 0.03;
      orb.vx *= 0.84;                 orb.vy *= 0.84;
      orb.x += orb.vx;                orb.y += orb.vy;
    }
    // Fainter while following (how faint is per theme: --orb-follow-fade); full strength at rest.
    orb.fade += ((pointer.inside ? followFade : 1) - orb.fade) * 0.05 * k;
    placeOrb();
    draw();
    if (running) rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMQ.matches || !inView || document.hidden) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  // Reduced motion (or paused): still frame of straight lines, orb resting on the headline.
  function drawStatic() {
    lens.s = 0; draw();
    orb.x = home.x; orb.y = home.y; orb.vx = orb.vy = 0;
    orb.fade = 1; placeOrb();
  }

  readTheme();
  resize();
  if (reduceMQ.matches) drawStatic(); else start();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); if (!running) drawStatic(); }, 100);
  });
  new MutationObserver(function () { readTheme(); if (!running) drawStatic(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      inView ? start() : stop();
    }).observe(hero);
  }

  // Nav is see-through only at the very top of the page (lines fade under it);
  // as soon as you scroll it turns solid, so the headline never slides behind the links.
  var nav = document.getElementById("nav");
  if (nav) {
    var syncNav = function () { nav.classList.toggle("nav--clear", window.scrollY < 8); };
    window.addEventListener("scroll", syncNav, { passive: true });
    syncNav();
  }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", function () {
    if (reduceMQ.matches) { stop(); drawStatic(); } else start();
  });
})();
