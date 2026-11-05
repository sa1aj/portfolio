/* Hero line field.
 * - Thin vertical lines wave gently on their own.
 * - Around the cursor they bulge outward in a circular lens. The push is a smooth
 *   falloff, (1 - d^2)^2, applied sideways, so lines bend around an invisible
 *   sphere and never cross.
 * - An orange-to-teal glow sits under the cursor and tints the nearby lines.
 * - The lens eases after the cursor and relaxes when the cursor leaves the hero.
 */
(function () {
  "use strict";

  var hero = document.getElementById("top");
  var canvas = document.getElementById("hero-lines");
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  var W = 0, H = 0, spacing = 30, step = 10;
  var lineRGB = "255,255,255", lineAlpha = 0.3, glowK = 1;
  var t = 0, last = 0, running = false, rafId = 0, inView = true;

  var pointer = { x: 0, y: 0, inside: false };
  var lens = { x: 0, y: 0, s: 0 }; // eased position + strength (0..1)

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    lineRGB = cs.getPropertyValue("--line-rgb").trim() || "255,255,255";
    lineAlpha = parseFloat(cs.getPropertyValue("--line-alpha")) || 0.3;
    glowK = document.documentElement.dataset.theme === "light" ? 0.6 : 1;
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spacing = W < 700 ? Math.max(24, W / 16) : Math.max(26, W / 60);
    step = W < 700 ? 16 : 10;
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
    var wave = !reduceMQ.matches;

    ctx.beginPath();
    for (var x0 = -spacing; x0 <= W + spacing; x0 += spacing) {
      for (var y = -step; y <= H + step; y += step) {
        var dx = 0;
        if (wave) {
          dx = 5 * Math.sin(y * 0.0058 + t * 0.85 + x0 * 0.0042)
             + 2.4 * Math.sin(y * 0.0131 - t * 0.55 + x0 * 0.0107);
        }
        if (lens.s > 0.002) {
          var ex = x0 - lens.x, ey = y - lens.y;
          var d2 = (ex * ex + ey * ey) / (R * R);
          if (d2 < 1) { var f = 1 - d2; dx += ex * 0.9 * lens.s * f * f; }
        }
        if (y === -step) ctx.moveTo(x0 + dx, y); else ctx.lineTo(x0 + dx, y);
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + lineRGB + "," + lineAlpha + ")";
    ctx.stroke();

    if (lens.s > 0.01) {
      // Re-stroke the same path with an orange -> teal radial gradient, so lines
      // near the cursor light up in colour and fade back to white further out.
      ctx.strokeStyle = gradient(lens.x, lens.y, R * 1.05, [[0, "255,160,50", 0.95 * lens.s], [0.42, "255,150,45", 0.9 * lens.s], [0.78, "45,212,191", 0.8 * lens.s], [1, "45,212,191", 0]]);
      ctx.stroke();
      // Soft glow behind the lines.
      ctx.globalCompositeOperation = "destination-over";
      var r = R * 1.2;
      ctx.fillStyle = gradient(lens.x, lens.y, r, [[0, "255,140,30", 0.38 * lens.s * glowK], [0.55, "30,180,170", 0.15 * lens.s * glowK], [1, "30,180,170", 0]]);
      ctx.fillRect(lens.x - r, lens.y - r, r * 2, r * 2);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function gradient(x, y, r, stops) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], "rgba(" + stops[i][1] + "," + stops[i][2] + ")");
    return g;
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
    draw();
    if (running) rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMQ.matches || !inView || document.hidden) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  // Reduced motion: one still frame of straight lines, redrawn only on resize/theme change.
  function drawStatic() { lens.s = 0; draw(); }

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
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", function () {
    if (reduceMQ.matches) { stop(); drawStatic(); } else start();
  });
})();
