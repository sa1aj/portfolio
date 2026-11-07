/* Contact footer (home page): "Copy email" copies the address and says so for
 * two seconds. The footer's glyph sea and floating text live in js/glyph-sea.js. */
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

})();
