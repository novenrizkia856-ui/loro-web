/* ============================================================
   LORO — landing page behaviour. No dependencies.
   - Deployment config binding (config/loro.config.js)
   - Header scroll state, mobile sheet
   - Hero entrance + pointer parallax on the product fragments
   - Pill marquee from content.js
   - Sticky word reveal
   ============================================================ */

(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CONTENT = window.LoroContent || {};

  /* ============================================================
     DEPLOYMENT CONFIG
     config/loro.config.js is loaded as a module after this file
     and calls Loro.applyConfig(). Until it does, and whenever a
     value is null or empty, the page keeps its "not deployed"
     state, which is what the markup already renders.
     ============================================================ */
  function truncateAddress(addr) {
    if (addr.length <= 12) return addr;
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // Older browsers, plain http, and embedded views that refuse the
  // async clipboard all fall through to the same legacy path.
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy refused"));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  /* cfg is the resolved network from loadConfig() in
     config/loro.config.js: { name, tokenAddress, docsUrl, deployed,
     explorerUrl, contracts }. The contract address pill belongs to the
     project token, a separate contract from LoroLoan; it stays
     "Coming soon" until set. */
  function applyConfig(cfg) {
    cfg = cfg || {};
    var address = cfg.tokenAddress || "";

    /* ---- Contract address pill ---- */
    var valueEl = $("#addrValue");
    var btn = $("#addrCopy");
    var btnText = $("#addrCopyText");

    if (valueEl && btn) {
      if (address) {
        valueEl.textContent = truncateAddress(address);
        valueEl.setAttribute("title", address);
        btn.disabled = false;
        btn.removeAttribute("title");
        if (!btn._bound) {
          btn._bound = true;
          btn.addEventListener("click", function () {
            copyText(address).then(function () {
              btn.classList.add("is-copied");
              if (btnText) btnText.textContent = "Copied";
              clearTimeout(btn._t);
              btn._t = setTimeout(function () {
                btn.classList.remove("is-copied");
                if (btnText) btnText.textContent = "Copy";
              }, 1800);
            }).catch(function () {
              // Clipboard refused. Show the whole value and select it so
              // it can still be copied by hand.
              valueEl.textContent = address;
              try {
                var range = document.createRange();
                range.selectNodeContents(valueEl);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (e) { /* selection is a nicety, not a requirement */ }
              if (btnText) btnText.textContent = "Select to copy";
              clearTimeout(btn._t);
              btn._t = setTimeout(function () {
                valueEl.textContent = truncateAddress(address);
                if (btnText) btnText.textContent = "Copy";
              }, 8000);
            });
          });
        }
      } else {
        valueEl.textContent = "Coming soon";
        btn.disabled = true;
        btn.setAttribute("title", "Not deployed yet.");
      }
    }

    /* ---- LoroLoan contract, linked to the explorer ---- */
    var loan = cfg.contracts && cfg.contracts.loroLoan;
    $$("[data-contract-addr]").forEach(function (el) {
      el.textContent = loan ? truncateAddress(loan) : "Not deployed";
      if (loan) el.setAttribute("title", loan);
    });
    $$("[data-contract-link]").forEach(function (el) {
      if (loan && cfg.explorerUrl) {
        el.setAttribute("href", cfg.explorerUrl + "/address/" + loan);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
        el.removeAttribute("aria-disabled");
      } else {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
      }
    });

    /* ---- Documentation links ---- */
    $$("[data-docs-link]").forEach(function (el) {
      if (cfg.docsUrl) {
        el.setAttribute("href", cfg.docsUrl);
        el.removeAttribute("aria-disabled");
        el.removeAttribute("title");
        if (/^https?:/i.test(cfg.docsUrl)) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener");
        }
      } else {
        el.setAttribute("href", "#");
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("title", "Docs are not published yet.");
        if (!el._bound) {
          el._bound = true;
          el.addEventListener("click", function (e) {
            if (el.getAttribute("aria-disabled") === "true") e.preventDefault();
          });
        }
      }
    });

    /* ---- Footer facts ---- */
    var deployed = !!cfg.deployed;
    var netEl = $("#footNetwork");
    var statEl = $("#footStatus");
    if (netEl && cfg.name) netEl.textContent = cfg.name;
    if (statEl) statEl.textContent = deployed ? "Live" : "Not deployed";

    var note = $("#statusNote");
    if (note) {
      note.textContent = deployed
        ? "Live on " + (cfg.name || "chain") + "."
        : "Contracts are not deployed yet. Nothing on this page is live.";
    }
  }

  window.Loro = window.Loro || {};
  window.Loro.applyConfig = applyConfig;

  // Render the empty state immediately, so nothing is blank if the
  // config module is slow or missing.
  applyConfig(null);

  /* ============================================================
     HEADER + MOBILE SHEET
     ============================================================ */
  var hdr = $("#hdr");
  function onScroll() {
    if (hdr) hdr.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var burger = $("#burger");
  function setMenu(open) {
    doc.classList.toggle("m-open", open);
    if (burger) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    var sheet = $("#mSheet");
    if (sheet) sheet.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (burger) {
    burger.addEventListener("click", function () { setMenu(!doc.classList.contains("m-open")); });
    $$("#mSheet a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    var scrim = $("#mScrim");
    if (scrim) scrim.addEventListener("click", function () { setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", function () { if (window.innerWidth >= 768) setMenu(false); });
  }

  /* ============================================================
     HERO: entrance + pointer parallax
     ============================================================ */
  var hero = $("#home");
  if (hero) {
    // A plain timeout, not requestAnimationFrame: rAF does not run in a
    // background tab, and the fragments must never stay hidden.
    setTimeout(function () { hero.classList.add("is-ready"); }, reduced ? 0 : 150);

    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var layers = $$(".fc-px", hero);
    if (finePointer && !reduced && layers.length) {
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      var step = function () {
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        layers.forEach(function (el) {
          var depth = parseFloat(el.getAttribute("data-depth") || "1");
          el.style.transform = "translate3d(" + (cx * depth).toFixed(2) + "px," + (cy * depth).toFixed(2) + "px,0)";
        });
        raf = (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) ? requestAnimationFrame(step) : 0;
      };
      window.addEventListener("pointermove", function (e) {
        if (window.scrollY > window.innerHeight) return;
        tx = (e.clientX / window.innerWidth - 0.5) * -16;
        ty = (e.clientY / window.innerHeight - 0.5) * -12;
        if (!raf) raf = requestAnimationFrame(step);
      }, { passive: true });
    }
  }

  /* ============================================================
     PILL MARQUEE (content.js ticker)
     ============================================================ */
  var marq = $("#marq");
  var ticker = (CONTENT.global && CONTENT.global.ticker) || [];
  if (marq && ticker.length) {
    var names = ticker.map(function (t) { return t.name; });
    var rows = [[], [], []];
    names.forEach(function (n, i) { rows[i % 3].push(n); });
    // Each row needs enough pills to overflow before it repeats
    rows = rows.map(function (r, ri) {
      var out = r.slice();
      var k = 0;
      while (out.length < 6) out.push(names[(ri * 3 + k++) % names.length]);
      return out;
    });
    marq.innerHTML = "";
    rows.forEach(function (items) {
      var row = document.createElement("div");
      row.className = "marq-row";
      for (var rep = 0; rep < 2; rep++) {
        var track = document.createElement("div");
        track.className = "marq-track";
        items.forEach(function (name) {
          var pill = document.createElement("span");
          pill.className = "marq-pill";
          pill.textContent = name;
          track.appendChild(pill);
        });
        row.appendChild(track);
      }
      marq.appendChild(row);
    });
  }

  /* ============================================================
     STICKY WORD REVEAL
     ============================================================ */
  var about = $("#about");
  var aboutText = $("#aboutText");
  if (about && aboutText) {
    var frag = document.createDocumentFragment();
    aboutText.textContent.split(/\s+/).forEach(function (word, i) {
      if (!word) return;
      if (i) frag.appendChild(document.createTextNode(" "));
      var s = document.createElement("span");
      s.className = "w";
      s.textContent = word;
      frag.appendChild(s);
    });
    aboutText.textContent = "";
    aboutText.appendChild(frag);

    var words = $$(".w", aboutText);
    var lastLit = -1;
    var paint = function () {
      var rect = about.getBoundingClientRect();
      var span = about.offsetHeight - window.innerHeight;
      var p = span > 0 ? (-rect.top + window.innerHeight * 0.25) / span : 1;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      var lit = Math.round(p * words.length * 1.1);
      if (lit === lastLit) return;
      lastLit = lit;
      words.forEach(function (w, i) { w.classList.toggle("is-lit", i < lit); });
    };

    if (reduced) {
      words.forEach(function (w) { w.classList.add("is-lit"); });
    } else {
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; paint(); });
      }, { passive: true });
      window.addEventListener("resize", paint);
      paint();
    }
  }
})();
