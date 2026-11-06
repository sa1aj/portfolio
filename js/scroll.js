/* Smooth in-page scrolling (home page: nav links, hero buttons, logo).
 * The browser's built-in smooth scroll is quick and can't be tuned, so this
 * animates the scroll itself: 0.9-1.6s depending on distance, with a soft start
 * and a long, gentle slowdown into the section (ease-in-out, quartic).
 * - Lands where the browser would: the section top minus scroll-padding-top (the nav).
 * - Any wheel, touch or key input cancels it, so the visitor is never fought.
 * - Updates the URL hash and moves keyboard focus to the section.
 * - prefers-reduced-motion: does nothing; links jump as normal.
 */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var rafId = 0;

  function ease(t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }

  function cancel() { cancelAnimationFrame(rafId); rafId = 0; }
  ["wheel", "touchstart", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, cancel, { passive: true });
  });

  function glide(toY) {
    cancel();
    var fromY = window.scrollY, dist = toY - fromY;
    if (Math.abs(dist) < 2) return;
    var duration = Math.min(1600, Math.max(900, 700 + Math.abs(dist) * 0.25));
    var start = 0;
    function frame(now) {
      if (!start) start = now;
      var t = Math.min(1, (now - start) / duration);
      window.scrollTo({ top: fromY + dist * ease(t), behavior: "instant" });
      rafId = t < 1 ? requestAnimationFrame(frame) : 0;
    }
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener("click", function (e) {
    if (reduce.matches || e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();

    var pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    var y = id === "top" ? 0 : target.getBoundingClientRect().top + window.scrollY - pad;
    glide(Math.max(0, Math.min(maxY, y)));

    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
})();
