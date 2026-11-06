/* "Behind the lens" photo pile (home page).
 * - Mouse/trackpad: grab any photo and drag it around the board; it comes to the
 *   front and straightens while held. A click without dragging enlarges it.
 * - Touch: tap to enlarge (no dragging, so swiping over the photos still scrolls).
 * - Keyboard: each photo is a button (Enter/Space enlarges).
 * - Enlarged view: a <dialog> with a dimmed backdrop; close with x, Esc or a click
 *   outside the photo; arrows (buttons or keys) step through the photos.
 */
(function () {
  "use strict";
  var board = document.getElementById("lens-board");
  var box = document.getElementById("lightbox");
  if (!board || !box) return;

  var cards = Array.prototype.slice.call(board.querySelectorAll(".lens__card"));
  var img = document.getElementById("lightbox-img");
  var cap = document.getElementById("lightbox-cap");
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var top = cards.length, current = -1;

  // ---------- Dragging (mouse/trackpad only) ----------
  var drag = null;      // { card, id, sx, sy, ox, oy, moved }
  cards.forEach(function (card, i) {
    card.dataset.dx = "0"; card.dataset.dy = "0";
    card.style.zIndex = i + 1;

    card.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || !fine.matches || e.button !== 0) return;
      if (window.innerWidth <= 700) return;   // phone layout is a grid: tap only
      e.preventDefault();                      // no text selection / native image drag
      card.setPointerCapture(e.pointerId);
      card.style.zIndex = ++top;
      drag = { card: card, id: e.pointerId, sx: e.clientX, sy: e.clientY,
               ox: +card.dataset.dx, oy: +card.dataset.dy, moved: false };
    });
    card.addEventListener("pointermove", function (e) {
      if (!drag || drag.card !== card || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;   // still a click
      if (!drag.moved) { drag.moved = true; card.classList.add("is-dragging"); }
      var p = clampToBoard(card, drag.ox + dx, drag.oy + dy);
      card.dataset.dx = p.x; card.dataset.dy = p.y;
      card.style.translate = p.x + "px " + p.y + "px";
    });
    function end(e) {
      if (!drag || drag.card !== card || e.pointerId !== drag.id) return;
      var wasDrag = drag.moved;
      drag = null;
      card.classList.remove("is-dragging");
      if (wasDrag) card.dataset.justDragged = "1";   // swallow the click that follows
    }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);

    card.addEventListener("click", function () {
      if (card.dataset.justDragged) { delete card.dataset.justDragged; return; }
      open(i);
    });
  });

  // Keep at least ~40% of a card on the board so it can't be lost off-screen.
  function clampToBoard(card, x, y) {
    var b = board.getBoundingClientRect();
    var left = card.offsetLeft, topPx = card.offsetTop, w = card.offsetWidth, h = card.offsetHeight;
    var minX = -left - w * 0.6, maxX = b.width - left - w * 0.4;
    var minY = -topPx - h * 0.4, maxY = b.height - topPx - h * 0.4;
    return { x: Math.round(Math.max(minX, Math.min(maxX, x))),
             y: Math.round(Math.max(minY, Math.min(maxY, y))) };
  }

  // Phone layout is a plain grid: drop any drag offsets when the screen gets narrow.
  window.addEventListener("resize", function () {
    if (window.innerWidth > 700) return;
    cards.forEach(function (c) { c.dataset.dx = c.dataset.dy = "0"; c.style.translate = ""; });
  });

  // ---------- Enlarged view ----------
  function show(i) {
    current = (i + cards.length) % cards.length;
    var thumb = cards[current].querySelector("img");
    img.src = thumb.src;                         // instant (cached), then swap to full size
    img.alt = thumb.alt;
    var full = new Image();
    full.onload = function () { if (cards[current].dataset.full === full.dataset.src) img.src = full.src; };
    full.dataset.src = cards[current].dataset.full;
    full.src = cards[current].dataset.full;
    cap.textContent = pad(current + 1) + " / " + pad(cards.length) + " · Iowa & the Midwest";
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function open(i) {
    show(i);
    if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", "");
    box.focus();   // focus the viewer, not the x button (no focus ring on a mouse open)
    document.documentElement.classList.add("lightbox-open");
  }
  function close() {
    if (!box.open || box.classList.contains("is-closing")) return;
    var finish = function () {
      box.classList.remove("is-closing");
      if (typeof box.close === "function") box.close(); else box.removeAttribute("open");
    };
    if (reduce.matches) { finish(); return; }
    box.classList.add("is-closing");
    setTimeout(finish, 250);   // matches the .25s close animation
  }
  box.addEventListener("close", function () {
    document.documentElement.classList.remove("lightbox-open");
    if (current >= 0) cards[current].focus({ preventScroll: true });   // back to the photo you opened
  });
  box.addEventListener("cancel", function (e) { e.preventDefault(); close(); });   // Esc: animate out

  box.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (act) {
      var a = act.dataset.act;
      if (a === "close") close(); else show(current + (a === "next" ? 1 : -1));
      return;
    }
    if (e.target !== img) close();   // click anywhere outside the photo
  });
  box.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); show(current + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(current - 1); }
  });
})();
