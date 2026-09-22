/* ============================================================
   LORO — pointer effects
   The system cursor stays as it is. Controls lean slightly toward
   the pointer and cards tilt under it with a soft light. Mouse and
   trackpad only; touch keeps native input. Shared by every page.
   No dependencies.
   ============================================================ */

(function () {
  "use strict";

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var MAGNET = ".btn, .cta-big, .ca-copy, .app-tab, .hdr-nav a, .burger, .brand";
  var TILT = "[data-tilt], .loan-card";

  var magnetEl = null;
  function magnet(target, e) {
    var el = target && target.closest(MAGNET);
    if (magnetEl && magnetEl !== el) magnetEl.style.transform = "";
    magnetEl = el;
    if (!el) return;
    var r = el.getBoundingClientRect();
    var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    el.style.transform = "translate(" + (dx * 10).toFixed(2) + "px," + (dy * 8).toFixed(2) + "px)";
  }

  var tiltEl = null;
  function tilt(target, e) {
    var el = target && target.closest(TILT);
    if (tiltEl && tiltEl !== el) {
      tiltEl.classList.remove("is-tilting");
      tiltEl.style.transform = "";
    }
    tiltEl = el;
    if (!el) return;
    var r = el.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width;
    var py = (e.clientY - r.top) / r.height;
    var max = parseFloat(el.getAttribute("data-tilt")) || 3;
    el.classList.add("spot", "is-tilting");
    el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    el.style.transform = "perspective(1200px) rotateX(" + ((0.5 - py) * max).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * max).toFixed(2) + "deg)";
  }

  document.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    var t = e.target instanceof Element ? e.target : null;
    magnet(t, e);
    tilt(t, e);
  }, { passive: true });

  document.addEventListener("mouseleave", function () {
    if (magnetEl) { magnetEl.style.transform = ""; magnetEl = null; }
    if (tiltEl) { tiltEl.classList.remove("is-tilting"); tiltEl.style.transform = ""; tiltEl = null; }
  });
})();
