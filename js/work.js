/* Selected work: floating preview card.
 * While the cursor is over a project row, a card with that project's screenshot
 * trails just to the right of the cursor (eased), crossfading when you move to
 * another row and fading out when you leave the list. Mouse/trackpad only;
 * touch devices never see it (CSS hides it too).
 */
(function () {
  "use strict";

  var list = document.querySelector(".work");
  var card = document.getElementById("preview");
  if (!list || !card) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var imgs = card.querySelectorAll("img");
  var GAP = 32;                       // distance between cursor and card edge
  var pos = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  var current = null, on = false, raf = 0;

  function show(key) {
    if (key !== current) {
      for (var i = 0; i < imgs.length; i++) imgs[i].classList.toggle("is-on", imgs[i].dataset.key === key);
      current = key;
    }
    if (!on) { card.classList.add("is-on"); on = true; }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function hide() {
    card.classList.remove("is-on");
    on = false;
  }

  // Card sits to the right of the cursor, vertically centred on it; flips to the
  // left near the right edge and stays inside the viewport.
  function aim(cx, cy) {
    var w = card.offsetWidth, h = card.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = cx + GAP;
    if (x + w > vw - 12) x = cx - GAP - w;
    var y = Math.min(Math.max(cy - h / 2, 12), vh - h - 12);
    target.x = x; target.y = y;
  }

  function place() {
    card.style.transform = "translate3d(" + pos.x.toFixed(1) + "px," + pos.y.toFixed(1) + "px,0)";
  }

  function tick() {
    var k = reduce.matches ? 1 : 0.18;
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    place();
    var moving = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.3;
    raf = (on || moving) ? requestAnimationFrame(tick) : 0;
  }

  list.addEventListener("mousemove", function (e) {
    var row = e.target.closest(".work__row[data-preview]");
    if (!row) return;
    aim(e.clientX, e.clientY);
    if (!on) { pos.x = target.x; pos.y = target.y; place(); } // appear at the cursor, don't fly in
    show(row.dataset.preview);
  });
  list.addEventListener("mouseleave", hide);
  // The list scrolls out from under a still cursor; hide until the mouse moves again.
  window.addEventListener("scroll", function () { if (on) hide(); }, { passive: true });
})();
