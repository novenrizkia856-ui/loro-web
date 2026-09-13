/* ============================================================
   LORO — cursor
   A dot and a trailing ring in place of the system pointer,
   controls that lean toward the pointer, and cards that tilt
   under it. Mouse and trackpad only; touch keeps native input.
   Shared by index.html and app.html. No dependencies.
   ============================================================ */

(function () {
  "use strict";

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;

  var HOVER = "a, button, label, select, summary, [role='button'], [data-cursor]";
  var TEXT = "input, textarea, [contenteditable='true']";
  var MAGNET = ".btn, .cta-big, .ca-copy, .app-tab, .hdr-nav a, .burger, .brand";
  var TILT = "[data-tilt], .loan-card";

  var dot = document.createElement("div");
  var ring = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  document.body.appendChild(dot);
  document.body.appendChild(ring);
  root.classList.add("has-cursor");

  var x = -100, y = -100, rx = x, ry = y, raf = 0;
  function follow() {
    rx += (x - rx) * 0.22;
    ry += (y - ry) * 0.22;
    dot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
    raf = (Math.abs(x - rx) > 0.2 || Math.abs(y - ry) > 0.2) ? requestAnimationFrame(follow) : 0;
  }

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
    x = e.clientX;
    y = e.clientY;
    root.classList.add("cursor-on");
    if (!raf) raf = requestAnimationFrame(follow);

    var t = e.target instanceof Element ? e.target : null;
    var onText = !!(t && t.closest(TEXT));
    root.classList.toggle("cursor-text", onText);
    root.classList.toggle("cursor-hover", !onText && !!(t && t.closest(HOVER)));

    if (reduced) return;
    magnet(t, e);
    tilt(t, e);
  }, { passive: true });

  document.addEventListener("pointerdown", function () { root.classList.add("cursor-down"); });
  document.addEventListener("pointerup", function () { root.classList.remove("cursor-down"); });
  document.addEventListener("mouseleave", function () {
    root.classList.remove("cursor-on");
    if (magnetEl) { magnetEl.style.transform = ""; magnetEl = null; }
    if (tiltEl) { tiltEl.classList.remove("is-tilting"); tiltEl.style.transform = ""; tiltEl = null; }
  });
})();
