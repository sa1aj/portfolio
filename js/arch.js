/* Skills architecture map (home page).
 * - Carousel: one project per slide in a horizontal scroll-snap track. Swipe
 *   (touch or trackpad), click a dot, or use the arrow keys on the focused track.
 *   The dot for the current slide lights up.
 * - Wires: for every hop in a lane (and the CloudTrail -> GuardDuty link, desktop
 *   only), a smooth curve is drawn in the slide's SVG between the two nodes'
 *   facing edges, with its label (HTTPS, OAC, ...) at the curve's midpoint.
 *   Redrawn whenever the slide changes size.
 * - Light-up: when a slide is current and on screen, a line of light draws
 *   along each curve in turn and each node glows as the signal reaches it.
 *   Mouse users can hover a slide to replay it.
 * - prefers-reduced-motion: no animation; everything shows lit.
 */
(function () {
  "use strict";
  var root = document.getElementById("arch");
  var track = document.getElementById("arch-track");
  var dotsEl = document.getElementById("arch-dots");
  if (!root || !track || !dotsEl) return;

  var NS = "http://www.w3.org/2000/svg";
  var slides = Array.prototype.slice.call(track.querySelectorAll(".arch__slide"));
  var dots = Array.prototype.slice.call(dotsEl.querySelectorAll("button"));
  var phone = window.matchMedia("(max-width: 700px)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var HOP_MS = 900;      // time for the light to travel one wire
  var PAUSE_MS = 220;    // beat between hops, while the node lights
  var current = 0, inView = false;

  // ---------- Wires ----------
  function rel(el, base) {
    var r = el.getBoundingClientRect();
    return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top,
             cx: (r.left + r.right) / 2 - base.left, cy: (r.top + r.bottom) / 2 - base.top };
  }
  // A curve from a's facing edge to b's. Mostly-sideways hops leave and enter
  // horizontally; mostly-vertical ones (and the cross-lane link) vertically.
  function curve(a, b, vertical) {
    var dx = b.cx - a.cx, dy = b.cy - a.cy, x1, y1, x2, y2, c1x, c1y, c2x, c2y, k;
    if (!vertical && Math.abs(dx) >= Math.abs(dy)) {
      var dir = dx >= 0 ? 1 : -1;
      x1 = dir > 0 ? a.r : a.l; y1 = a.cy;
      x2 = dir > 0 ? b.l : b.r; y2 = b.cy;
      k = Math.max(28, Math.abs(x2 - x1) * 0.55);
      c1x = x1 + dir * k; c1y = y1; c2x = x2 - dir * k; c2y = y2;
    } else {
      var dv = dy >= 0 ? 1 : -1;
      x1 = a.cx; y1 = dv > 0 ? a.b : a.t;
      x2 = b.cx; y2 = dv > 0 ? b.t : b.b;
      k = Math.max(22, Math.abs(y2 - y1) * 0.55);
      c1x = x1; c1y = y1 + dv * k; c2x = x2; c2y = y2 - dv * k;
    }
    var mx = (x1 + 3 * c1x + 3 * c2x + x2) / 8, my = (y1 + 3 * c1y + 3 * c2y + y2) / 8;   // point at t = 0.5
    return { d: "M" + x1 + " " + y1 + " C" + c1x + " " + c1y + " " + c2x + " " + c2y + " " + x2 + " " + y2,
             mx: mx, my: my, side: !vertical && Math.abs(dx) >= Math.abs(dy) };
  }

  // Each slide: lanes in order; each lane's steps = optional cross-link into its
  // first node, then the hops along the lane.
  function build(slide) {
    var stage = slide.querySelector(".arch__stage");
    var svg = slide.querySelector(".arch__wires");
    var vias = slide.querySelector(".arch__vias");
    var lanes = Array.prototype.slice.call(slide.querySelectorAll(".arch__chain")).map(function (ol) {
      return Array.prototype.slice.call(ol.children);
    });
    var S = { slide: slide, stage: stage, svg: svg, vias: vias, lanes: lanes, edges: [], run: 0, state: "idle" };
    lanes.forEach(function (nodes) {
      var first = nodes[0];
      if (first.dataset.from) {
        var src = slide.querySelector('[data-id="' + first.dataset.from + '"]');
        if (src) S.edges.push({ a: src, b: first, via: first.dataset.fromVia, cross: true });
      }
      for (var i = 1; i < nodes.length; i++) S.edges.push({ a: nodes[i - 1], b: nodes[i], via: nodes[i].dataset.via, cross: false });
    });
    return S;
  }

  function draw(S) {
    var base = S.stage.getBoundingClientRect();
    S.svg.setAttribute("width", base.width); S.svg.setAttribute("height", base.height);
    S.svg.textContent = ""; S.vias.textContent = "";
    S.edges.forEach(function (e) {
      e.hidden = e.cross && phone.matches;     // the cross-lane link only fits the wide layout
      if (e.hidden) { e.base = e.sig = e.label = null; return; }
      var c = curve(rel(e.a, base), rel(e.b, base), e.cross);
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "wire" + (e.cross ? " wire--cross" : ""));
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", c.d); p.setAttribute("class", "wire__base");
      var s = document.createElementNS(NS, "path");
      s.setAttribute("d", c.d); s.setAttribute("class", "wire__sig");
      g.appendChild(p); g.appendChild(s); S.svg.appendChild(g);
      var len = s.getTotalLength();
      s.style.strokeDasharray = len; s.style.strokeDashoffset = e.done ? 0 : len;
      e.base = g; e.sig = s; e.len = len;
      if (e.done) g.classList.add("is-lit");
      if (e.via) {
        var lab = document.createElement("span");
        lab.className = "via" + (c.side ? "" : " via--side") + (e.done ? " is-lit" : "");
        lab.textContent = e.via;
        lab.style.left = c.mx + "px"; lab.style.top = c.my + "px";
        S.vias.appendChild(lab); e.label = lab;
      } else e.label = null;
    });
  }

  // ---------- Light-up ----------
  function nodesOf(S) { return [].concat.apply([], S.lanes); }
  function reset(S) {
    S.run++; S.state = "idle";
    nodesOf(S).forEach(function (n) { n.classList.remove("is-lit"); });
    S.edges.forEach(function (e) {
      e.done = false;
      if (e.sig) e.sig.style.strokeDashoffset = e.len;
      if (e.base) e.base.classList.remove("is-lit");
      if (e.label) e.label.classList.remove("is-lit");
    });
  }
  function litAll(S) {
    S.run++; S.state = "done";
    nodesOf(S).forEach(function (n) { n.classList.add("is-lit"); });
    S.edges.forEach(function (e) {
      e.done = true;
      if (e.sig) e.sig.style.strokeDashoffset = 0;
      if (e.base) e.base.classList.add("is-lit");
      if (e.label) e.label.classList.add("is-lit");
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // Draw the light along one wire, frame by frame (ease-in-out). Resolves when
  // done; stops quietly if a newer run started (alive() turns false).
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function travel(e, alive) {
    return new Promise(function (resolve) {
      if (!e.sig) { resolve(); return; }
      var t0 = null;
      function frame(now) {
        if (!alive()) return;
        if (t0 === null) t0 = now;
        var k = Math.min(1, (now - t0) / HOP_MS);
        e.sig.style.strokeDashoffset = e.len * (1 - ease(k));
        if (k < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function play(S) {
    if (reduce.matches) { litAll(S); return; }
    reset(S);
    var run = S.run; S.state = "playing";
    var alive = function () { return run === S.run; };
    var chain = Promise.resolve();
    S.lanes.forEach(function (nodes) {
      var first = nodes[0];
      var steps = S.edges.filter(function (e) { return e.b === first || nodes.indexOf(e.b) > 0; });
      // a lane with no incoming cross-link starts by lighting its first node
      if (!first.dataset.from || steps[0].hidden) {
        chain = chain.then(function () { if (!alive()) return; first.classList.add("is-lit"); return wait(PAUSE_MS * 2); });
      }
      steps.forEach(function (e) {
        chain = chain.then(function () {
          if (!alive() || e.hidden) return;
          if (e.label) e.label.classList.add("is-lit");
          return travel(e, alive).then(function () {
            if (!alive()) return;
            e.done = true;
            if (e.base) e.base.classList.add("is-lit");
            e.b.classList.add("is-lit");
            return wait(PAUSE_MS);
          });
        });
      });
    });
    chain.then(function () { if (alive()) S.state = "done"; });
  }

  var S = slides.map(build);
  function drawAll() {
    S.forEach(draw);
    var cur = S[current];   // a resize mid-play leaves stale curves animating: start over
    if (cur.state === "playing") play(cur);
  }

  // ---------- Carousel ----------
  function go(i, smooth) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft,
                     behavior: smooth && !reduce.matches ? "smooth" : "auto" });
  }
  function setCurrent(i) {
    if (i === current) return;
    var prev = S[current];
    current = i;
    dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); });
    reset(prev);
    if (inView) play(S[current]);
  }
  var settle;
  track.addEventListener("scroll", function () {
    clearTimeout(settle);
    settle = setTimeout(function () {
      setCurrent(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
    }, 90);
  }, { passive: true });
  dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k, true); }); });
  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(current + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(current - 1, true); }
  });

  // Play when at least ~45% of the map is on screen; reset when it leaves, so
  // it plays again next time. (A plain scroll check, throttled to one per frame.)
  var ticking = false;
  function checkView() {
    ticking = false;
    var r = track.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
    var shown = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    var now = shown >= Math.min(r.height, vh) * 0.45;
    if (now === inView) return;
    inView = now;
    if (inView) play(S[current]); else reset(S[current]);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(checkView); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // Mouse/trackpad: hovering a slide replays it (unless it's mid-play).
  slides.forEach(function (slide, k) {
    slide.addEventListener("mouseenter", function () {
      if (k === current && S[k].state === "done" && !reduce.matches) play(S[k]);
    });
  });

  // Redraw on size changes (and once fonts settle widths).
  var raf;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawAll); }
  if ("ResizeObserver" in window) slides.forEach(function (s) { new ResizeObserver(schedule).observe(s.querySelector(".arch__stage")); });
  window.addEventListener("resize", schedule);
  if (phone.addEventListener) phone.addEventListener("change", function () { reset(S[current]); schedule(); if (inView) setTimeout(function () { play(S[current]); }, 50); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  drawAll();
  if (reduce.matches) S.forEach(litAll);
  checkView();
})();
