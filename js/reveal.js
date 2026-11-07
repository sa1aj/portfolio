/* Scroll reveals (home + project pages).
 * - Content blocks (.rv) fade up as they enter the viewport; blocks that enter
 *   together are staggered. Headings stay put (no reveal).
 * - Each element reveals once. Nothing is hidden until this script has set
 *   everything up (html.reveal-ready), so if it fails the page just shows.
 * - prefers-reduced-motion: does nothing; the page shows as-is.
 */
(function () {
  "use strict";
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var BLOCKS = [
    ".work > li", ".about__body > p", ".facts", ".lens__head > p", ".lens__board", ".arch", ".stack",
    ".contact__email", ".contact__copy", ".contact__icons li", ".contact__base",
    ".phero__tags", ".phero__sum", ".phero__ctas",
    ".pblock__body", ".gallery__item", ".pnext .label", ".pfoot"
  ].join(",");

  var targets = [];
  document.querySelectorAll(BLOCKS).forEach(function (b) {
    b.classList.add("rv");
    targets.push(b);
  });
  if (!targets.length) return;

  var io = new IntersectionObserver(function (entries) {
    var i = 0;
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.style.transitionDelay = Math.min(i++, 6) * 90 + "ms";
      el.classList.add("is-in");
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  document.documentElement.classList.add("reveal-ready");
  targets.forEach(function (el) { io.observe(el); });
})();
