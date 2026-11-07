/* Contact footer (home page).
 * - Line field: the hero's contour lines (same flow-field maths, see js/hero.js),
 *   drifting even more slowly, with no cursor lens or orb. Only runs while the
 *   footer is on screen; prefers-reduced-motion gets one still frame.
 * - "Copy email": copies the address and says so for two seconds.
 */
(function () {
  "use strict";

  // ---------- Copy email ----------
  var btn = document.getElementById("copy-email");
  var label = document.getElementById("copy-email-label");
  if (btn && label) {
    var resetT;
    btn.addEventListener("click", function () {
      var email = btn.dataset.email;
      var done = function (ok) {
        label.textContent = ok ? "Copied ✓" : email;
        btn.classList.toggle("is-copied", ok);
        clearTimeout(resetT);
        resetT = setTimeout(function () { label.textContent = "Copy email"; btn.classList.remove("is-copied"); }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }   // no clipboard access: show the address to copy by hand
    });
  }

  // ---------- Line field ----------
  var foot = document.getElementById("contact");
  var canvas = document.getElementById("contact-lines");
  if (!foot || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var W = 0, H = 0, spacing = 16, step = 10, lineX = [];
  var rgb = "255,255,255", alpha = 0.2;
  var t = 40, last = 0, running = false, raf = 0, inView = false;

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    rgb = cs.getPropertyValue("--line-rgb").trim() || "255,255,255";
    alpha = (parseFloat(cs.getPropertyValue("--line-alpha")) || 0.2) * 0.8;
  }
  function resize() {
    var r = foot.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spacing = W < 700 ? 18 : 16; step = W < 700 ? 12 : 10;
    lineX = [];
    for (var x = -spacing * 4; x <= W + spacing * 4; x += spacing) lineX.push(x);
  }
  // Same field as the hero (sideways slope < 1, so lines never cross).
  function field(x0, y) {
    var env = 0.55 + 0.45 * Math.sin(x0 * 0.0023 + y * 0.0017 - t * 0.15 + 0.7);
    return 14 * Math.sin(x0 * 0.0035 + y * 0.006 + t * 0.22 + 2.3)
      + env * (10 * Math.sin(x0 * 0.011 + y * 0.016 + t * 0.30)
             + 6 * Math.sin(-x0 * 0.019 + y * 0.029 - t * 0.42 + 1.7)
             + 4 * Math.sin(x0 * 0.027 + y * 0.045 + t * 0.55 + 4.1)
             + 2.4 * Math.sin(-x0 * 0.040 + y * 0.068 - t * 0.60 + 0.9));
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    for (var i = 0; i < lineX.length; i++) {
      var x0 = lineX[i];
      for (var y = -step; y <= H + step; y += step) {
        var x = x0 + field(x0, y);
        if (y === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + rgb + "," + alpha + ")";
    ctx.stroke();
  }
  function frame(now) {
    var dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    t += dt / 1000 * 0.7;   // a bit slower than the hero
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduce.matches || !inView || document.hidden) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  readTheme(); resize(); draw();
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { resize(); draw(); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { resize(); draw(); });
  new MutationObserver(function () { readTheme(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { inView = en[0].isIntersecting; inView ? start() : stop(); }).observe(foot);
  } else { inView = true; start(); }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
})();
