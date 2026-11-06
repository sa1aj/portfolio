/* Project pages: scroll progress bar + sticky section list.
 * - The bar at the very top grows from 0 to 100% as you scroll the page.
 * - The section list on the left highlights the section you're currently reading
 *   (the last one whose top has passed ~35% of the way down the screen).
 * - The list links scroll to their section; smooth unless reduced motion is on.
 */
(function () {
  "use strict";

  var bar = document.getElementById("progress");
  var links = Array.prototype.slice.call(document.querySelectorAll(".ptoc a"));
  var sections = links.map(function (a) { return document.getElementById(a.hash.slice(1)); });
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ticking = false, current = -1;

  function update() {
    ticking = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.transform = "scaleX(" + p.toFixed(4) + ")";

    if (!sections.length) return;
    var line = window.innerHeight * 0.35, idx = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i] && sections[i].getBoundingClientRect().top <= line) idx = i;
    }
    if (p > 0.995) idx = sections.length - 1;   // bottom of page: last section
    if (idx !== current) {
      if (current >= 0) { links[current].classList.remove("is-active"); links[current].removeAttribute("aria-current"); }
      links[idx].classList.add("is-active"); links[idx].setAttribute("aria-current", "true");
      current = idx;
    }
  }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("load", update);
  update();

  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) {
      if (!sections[i]) return;
      e.preventDefault();
      sections[i].scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", a.hash);
    });
  });
})();
