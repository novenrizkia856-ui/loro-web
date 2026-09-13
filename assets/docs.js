/* ============================================================
   LORO — documentation page behaviour. No dependencies.
   - Header scroll state and mobile sheet
   - Table of contents: active chapter while reading, mobile menu
   - Deployment values from config/loro.config.js
   ============================================================ */

(function () {
  "use strict";

  var doc = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Header ---------- */
  var hdr = $("#hdr");
  var burger = $("#burger");

  function setMenu(open) {
    doc.classList.toggle("m-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    $("#mSheet").setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (burger) {
    burger.addEventListener("click", function () { setMenu(!doc.classList.contains("m-open")); });
    $$("#mSheet a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    $("#mScrim").addEventListener("click", function () { setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- Table of contents ---------- */
  var toc = $("#toc");
  var tocMobile = $("#tocMobile");
  var tocCurrent = $("#tocCurrent");
  var links = $$("a", toc);
  var chapters = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });

  // On small screens the same list lives inside a collapsible menu
  var mq = window.matchMedia("(min-width: 1000px)");
  function placeToc() {
    if (mq.matches) {
      if (toc.parentNode !== tocMobile.parentNode) tocMobile.parentNode.appendChild(toc);
    } else if (toc.parentNode !== tocMobile) {
      tocMobile.appendChild(toc);
    }
  }
  placeToc();
  if (mq.addEventListener) mq.addEventListener("change", placeToc);
  links.forEach(function (a) { a.addEventListener("click", function () { tocMobile.open = false; }); });

  var active = -1;
  function onScroll() {
    if (hdr) hdr.classList.toggle("is-scrolled", window.scrollY > 24);

    var line = 120;
    var current = 0;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i] && chapters[i].getBoundingClientRect().top <= line) current = i;
    }
    // At the very bottom the last chapter may never reach the line
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = chapters.length - 1;
    if (current === active) return;
    active = current;
    links.forEach(function (a, k) {
      a.classList.toggle("is-active", k === current);
      if (k === current) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
    if (tocCurrent) tocCurrent.textContent = links[current].textContent.replace(/^\d+/, "").trim();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- Deployment values ---------- */
  function applyConfig(cfg) {
    cfg = cfg || {};
    var values = {
      name: cfg.name,
      chainId: cfg.chainId,
      stableSymbol: cfg.stablecoin && cfg.stablecoin.symbol
    };
    var addresses = {
      loroLoan: cfg.contracts && cfg.contracts.loroLoan,
      loroLens: cfg.contracts && cfg.contracts.loroLens,
      stablecoin: cfg.stablecoin && cfg.stablecoin.address
    };

    $$("[data-cfg]").forEach(function (el) {
      var v = values[el.getAttribute("data-cfg")];
      el.textContent = v != null && v !== "" ? v : "Not set";
    });

    $$("[data-cfg-addr]").forEach(function (el) {
      var addr = addresses[el.getAttribute("data-cfg-addr")];
      if (!addr) {
        el.textContent = "Not deployed";
        el.removeAttribute("href");
        return;
      }
      el.textContent = addr;
      if (cfg.explorerUrl) {
        el.setAttribute("href", cfg.explorerUrl + "/address/" + addr);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      }
    });

    $$("[data-cfg-explorer]").forEach(function (el) {
      if (!cfg.explorerUrl) {
        el.hidden = el.closest(".facts-head") !== null;
        el.textContent = "Not set";
        el.removeAttribute("href");
        return;
      }
      el.setAttribute("href", cfg.explorerUrl);
      if (!el.closest(".facts-head")) el.textContent = cfg.explorerUrl.replace(/^https?:\/\//, "");
    });
  }

  window.LoroDocs = { applyConfig: applyConfig };
})();
