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

/* Gallery viewer: clicking a shot opens it large in the same dialog style as the
 * home page's photo viewer. Arrows (buttons or keys) step through, Esc / x / a
 * click outside closes. Without JS the links still open the image. */
(function () {
  "use strict";
  var links = Array.prototype.slice.call(document.querySelectorAll(".gallery__item a"));
  if (!links.length || typeof HTMLDialogElement === "undefined") return;
  var box = document.createElement("dialog");
  box.className = "lightbox"; box.setAttribute("aria-label", "Screenshot viewer"); box.tabIndex = -1;
  box.innerHTML = '<button class="lightbox__btn lightbox__close" type="button" data-act="close" aria-label="Close">&times;</button>' +
    (links.length > 1 ? '<button class="lightbox__btn lightbox__prev" type="button" data-act="prev" aria-label="Previous">&larr;</button>' +
                        '<button class="lightbox__btn lightbox__next" type="button" data-act="next" aria-label="Next">&rarr;</button>' : "") +
    '<figure class="lightbox__fig"><img class="lightbox__img" alt=""><figcaption class="label lightbox__cap"></figcaption></figure>';
  document.body.appendChild(box);
  var img = box.querySelector("img"), cap = box.querySelector("figcaption"), current = 0;
  // mark very wide screenshots so CSS can show a close-up crop in the card
  links.forEach(function (a) {
    var t = a.querySelector("img"); if (!t) return;
    var mark = function () { if (t.naturalWidth && t.naturalHeight / t.naturalWidth < 0.45) a.parentNode.classList.add("is-strip"); };
    if (t.complete) mark(); else t.addEventListener("load", mark);
  });
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function show(i) {
    current = (i + links.length) % links.length;
    var a = links[current], thumb = a.querySelector("img"), fc = a.parentNode.querySelector("figcaption");
    img.src = a.getAttribute("href"); img.alt = thumb ? thumb.alt : "";
    cap.textContent = pad(current + 1) + " / " + pad(links.length) + (fc ? " · " + fc.textContent : "");
  }
  function close() { box.close(); }
  links.forEach(function (a, i) {
    a.removeAttribute("target");
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let new-tab clicks through
      e.preventDefault(); show(i); box.showModal(); box.focus();
      document.documentElement.classList.add("lightbox-open");
    });
  });
  box.addEventListener("close", function () {
    document.documentElement.classList.remove("lightbox-open");
    links[current].focus({ preventScroll: true });
  });
  box.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (act) { var k = act.dataset.act; if (k === "close") close(); else show(current + (k === "next" ? 1 : -1)); return; }
    if (e.target !== img) close();
  });
  box.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" && links.length > 1) { e.preventDefault(); show(current + 1); }
    else if (e.key === "ArrowLeft" && links.length > 1) { e.preventDefault(); show(current - 1); }
  });
})();
