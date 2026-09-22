/* ============================================================
   LORO — landing page behaviour
   - Deployment config binding (config/loro.config.js)
   - Header scroll state, mobile sheet
   - Hero: title entrance and the three.js objects
   - Scroll motion: phone, marquee, word reveal, footer word
   - In view reveals and the small live demos in the cards
   The hero 3D objects are in assets/hero3d.js.
   ============================================================ */

(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
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
  function onHeader() {
    if (hdr) hdr.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onHeader, { passive: true });
  onHeader();

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
     WORD SPLITTING (hero title, section titles)
     ============================================================ */
  function splitWords(el, cls) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach(function (word, i) {
      var outer = document.createElement("span");
      var inner = document.createElement("span");
      outer.className = cls;
      inner.textContent = word;
      inner.style.setProperty("--i", i);
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }
  $$("[data-split]").forEach(function (el) { splitWords(el, "sw"); });

  /* ============================================================
     HERO
     ============================================================ */
  var hero = $("#home");
  var heroTitle = $(".hero-title");
  if (heroTitle) splitWords(heroTitle, "hw");
  var readyAt = performance.now() + 150;
  // A plain timeout, not requestAnimationFrame: rAF does not run in a
  // background tab, and the hero copy must never stay hidden.
  if (hero) setTimeout(function () { hero.classList.add("is-ready"); }, reduced ? 0 : 150);

  /* The 3D objects live in assets/hero3d.js. three.js is 600 KB and the
     scene takes work to build, so both load only after the page has
     painted: the header and hero copy never wait on them. */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  function loadHero3d() {
    if (!$("#hero3d")) return;
    loadScript("assets/vendor/three.min.js")
      .then(function () { return loadScript("assets/hero3d.js"); })
      .catch(function () { /* the hero stands on its own without 3D */ });
  }
  // Two frames after DOMContentLoaded the first paint has happened. The
  // timer covers tabs that do not draw frames yet (opened in background).
  var heroQueued = false;
  function queueHero3d() {
    if (heroQueued) return;
    heroQueued = true;
    loadHero3d();
  }
  requestAnimationFrame(function () { requestAnimationFrame(queueHero3d); });
  setTimeout(queueHero3d, 400);

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
  var words = [];
  var lastLit = -1;
  if (about && aboutText) {
    var frag = document.createDocumentFragment();
    aboutText.textContent.trim().split(/\s+/).forEach(function (word, i) {
      if (i) frag.appendChild(document.createTextNode(" "));
      var s = document.createElement("span");
      s.className = "w";
      s.textContent = word;
      frag.appendChild(s);
    });
    aboutText.textContent = "";
    aboutText.appendChild(frag);
    words = $$(".w", aboutText);
    if (reduced) words.forEach(function (w) { w.classList.add("is-lit"); });
  }
  function paintWords() {
    if (!words.length || reduced) return;
    var rect = about.getBoundingClientRect();
    var span = about.offsetHeight - window.innerHeight;
    var q = span > 0 ? (-rect.top + window.innerHeight * 0.25) / span : 1;
    var lit = Math.round(clamp(q, 0, 1) * words.length * 1.1);
    if (lit === lastLit) return;
    lastLit = lit;
    words.forEach(function (w, i) { w.classList.toggle("is-lit", i < lit); });
  }

  /* ============================================================
     SCROLL MOTION: phone, marquee skew, footer word
     ============================================================ */
  var phone = $(".phone");
  var showcase = $(".showcase");
  var foot = $(".foot");
  var footWord = $(".foot-word");
  var lastY = window.scrollY;
  var velocity = 0;
  var scrollRaf = 0;

  function scrollFrame() {
    scrollRaf = 0;
    var vh = window.innerHeight;
    var y = window.scrollY;
    paintWords();
    revealInView(vh);

    if (reduced) return;

    if (phone && showcase) {
      var r = showcase.getBoundingClientRect();
      var q = clamp((vh - r.top) / (vh * 0.9), 0, 1);
      var e = 1 - Math.pow(1 - q, 2);
      phone.style.transform = "translateX(-50%) translateY(" + ((1 - e) * 150).toFixed(1) + "px) perspective(1400px) rotateX(" +
        ((1 - e) * 20).toFixed(2) + "deg) scale(" + (0.9 + 0.1 * e).toFixed(3) + ")";
    }

    if (foot && footWord) {
      var fr = foot.getBoundingClientRect();
      var fq = clamp((vh - fr.top) / fr.height, 0, 1);
      footWord.style.transform = "translateY(" + ((1 - fq) * 40).toFixed(1) + "%)";
    }

    if (marq) {
      velocity += ((y - lastY) - velocity) * 0.25;
      lastY = y;
      marq.style.setProperty("--skew", clamp(velocity * -0.12, -10, 10).toFixed(2) + "deg");
      if (Math.abs(velocity) > 0.05) scrollRaf = requestAnimationFrame(scrollFrame);
    }
  }
  function onScroll() {
    // Reveals run on the event itself, so they never wait on a frame
    revealInView(window.innerHeight);
    if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollFrame);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  scrollFrame();

  /* ============================================================
     IN VIEW REVEALS + CARD DEMOS
     ============================================================ */
  $$("[data-stagger]").forEach(function (group) {
    $$("[data-reveal]", group).forEach(function (el, i) { el.style.setProperty("--i", i); });
  });

  var DEMOS = {
    // Step 1: the selected collateral changes and its amount is typed
    assets: {
      every: 2600,
      setup: function (el) {
        var items = $$(".ui-item", el);
        var typed = $("[data-typed]", el);
        var unit = $("[data-unit-label]", el);
        var i = 0;
        return function () {
          i = (i + 1) % items.length;
          items.forEach(function (it, k) { it.classList.toggle("is-on", k === i); });
          unit.textContent = items[i].getAttribute("data-unit");
          var text = items[i].getAttribute("data-amount");
          var n = 0;
          clearInterval(el._typing);
          typed.textContent = "";
          el._typing = setInterval(function () {
            typed.textContent = text.slice(0, ++n);
            if (n >= text.length) clearInterval(el._typing);
          }, 90);
        };
      }
    },
    // Step 2: the highlighted offer moves down the list
    offers: {
      every: 2200,
      setup: function (el) {
        var rows = $$(".ui-offer", el);
        var order = [1, 2, 0];
        var k = 0;
        return function () {
          k = (k + 1) % order.length;
          rows.forEach(function (row, idx) {
            var on = idx === order[k];
            var b = $(".btn", row);
            row.classList.toggle("is-picked", on);
            b.classList.toggle("btn-accent", on);
            b.classList.toggle("btn-ghost", !on);
            b.textContent = on ? "Accept" : "View";
          });
        };
      }
    },
    // Feature 4: the pointer moves between wallet options
    wallets: {
      every: 1700,
      setup: function (el) {
        var rows = $$(".wallet", el);
        var i = -1;
        return function () {
          i = (i + 1) % rows.length;
          rows.forEach(function (row, k) { row.classList.toggle("is-hot", k === i); });
        };
      }
    }
  };

  // Step 3: the term counts up to today, then the deadline ticks down
  function loanDemo(el) {
    var day = $("[data-day]", el);
    var fill = $("[data-fill]", el);
    var clock = $("[data-clock]", el);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var left = 27 * 86400 + 4 * 3600 + 12 * 60 + 9;
    var t0 = performance.now();
    var count = setInterval(function () {
      var q = clamp((performance.now() - t0) / 1600, 0, 1);
      var e = 1 - Math.pow(1 - q, 3);
      day.textContent = Math.round(62 * e);
      fill.style.width = (69 * e).toFixed(1) + "%";
      if (q >= 1) clearInterval(count);
    }, 30);
    setInterval(function () {
      if (!el.classList.contains("is-visible") || document.hidden) return;
      left -= 1;
      clock.textContent = Math.floor(left / 86400) + "d " + pad(Math.floor((left % 86400) / 3600)) + "h " +
        pad(Math.floor((left % 3600) / 60)) + "m " + pad(left % 60) + "s";
    }, 1000);
  }

  function startDemo(el) {
    var name = el.getAttribute("data-loop");
    if (!name || el._demo || reduced) return;
    el._demo = true;
    if (name === "loan") return loanDemo(el);
    var demo = DEMOS[name];
    if (!demo) return;
    var tick = demo.setup(el);
    setInterval(function () {
      if (el.classList.contains("is-visible") && !document.hidden) tick();
    }, demo.every);
  }

  /* ============================================================
     LIVE DETAILS: phone, about, steps, feature panels
     ============================================================ */
  function fmtMoney(n) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function countTo(el, to, ms) {
    if (!el) return;
    var t0 = performance.now();
    var run = setInterval(function () {
      var q = clamp((performance.now() - t0) / ms, 0, 1);
      el.textContent = fmtMoney(to * (1 - Math.pow(1 - q, 3)));
      if (q >= 1) clearInterval(run);
    }, 30);
  }

  // Phone: the balance counts up and notifications slide in
  DEMOS.phone = {
    every: 4600,
    setup: function (el) {
      var toast = $(".ph-toast", el);
      var title = $("[data-t]", toast);
      var line = $("[data-l]", toast);
      var msgs = [
        ["Offer accepted", "+1,200.00 USDG received"],
        ["Rate locked", "7.50% until 13 Nov 2026"],
        ["Reminder", "Repay 1,222.19 USDG in 27 days"]
      ];
      var i = 0;
      countTo($("[data-count-to]", el), 1200, 1700);
      function tick() {
        var m = msgs[i++ % msgs.length];
        title.textContent = m[0];
        line.textContent = m[1];
        toast.classList.remove("is-on");
        void toast.offsetWidth;
        toast.classList.add("is-on");
      }
      setTimeout(tick, 1200);
      return tick;
    }
  };

  // Steps: the current step walks along the track
  DEMOS.steps = {
    every: 2800,
    setup: function (el) {
      var cards = $$(".step", el);
      var dots = $$(".steps-track b", el);
      var track = $(".steps-track", el);
      var i = -1;
      function tick() {
        i = (i + 1) % cards.length;
        cards.forEach(function (c, k) { c.classList.toggle("is-current", k === i); });
        dots.forEach(function (d, k) { d.classList.toggle("is-on", k <= i); });
        if (track) track.style.setProperty("--p", i / (cards.length - 1));
      }
      setTimeout(tick, 700);
      return tick;
    }
  };

  // Feature 1: a highlight moves down the comparison
  DEMOS.rows = {
    every: 1500,
    setup: function (el) {
      var rows = $$(".cmp tbody tr", el);
      var i = -1;
      return function () {
        i = (i + 1) % rows.length;
        rows.forEach(function (r, k) { r.classList.toggle("is-hot", k === i); });
      };
    }
  };

  // Feature 2: the contract gets scanned and every check pops again
  DEMOS.scan = {
    every: 3800,
    setup: function (el) {
      var panel = $(".panel", el);
      function tick() {
        panel.classList.remove("is-scanning");
        void panel.offsetWidth;
        panel.classList.add("is-scanning");
      }
      setTimeout(tick, 1700);
      return tick;
    }
  };

  // Feature 3: today travels through the term and into the auction window
  DEMOS.timeline = {
    every: 70,
    setup: function (el) {
      var panel = $(".tl", el);
      var mark = $(".tl-mark", el);
      var rows = $$(".tl-rows .fact", el);
      var day = 55 / 100 * 112;
      var startAt = performance.now() + 2200;
      return function () {
        if (performance.now() < startAt) return;
        panel.classList.add("is-live");
        day += 0.35;
        if (day > 112) day = 0;
        var auction = day > 90;
        mark.style.left = (day / 112 * 100).toFixed(2) + "%";
        mark.classList.toggle("is-auction", auction);
        mark.textContent = auction ? "Auction" : "Day " + Math.max(1, Math.round(day));
        if (rows[1]) rows[1].classList.toggle("is-hot", day > 86 && day < 94);
      };
    }
  };

  // Feature 4: a pointer picks a wallet and the panel connects
  DEMOS.connect = {
    every: 4400,
    setup: function (el) {
      var wallets = $$(".wallet", el);
      var cursor = $(".fake-cursor", el);
      var foot = $("[data-connect-foot]", el);
      var idle = foot.textContent;
      var k = 0;
      function place(x, y) { cursor.style.transform = "translate(" + x.toFixed(0) + "px," + y.toFixed(0) + "px)"; }
      function rest() { place(el.clientWidth * 0.8, el.clientHeight * 0.86); }
      rest();
      return function () {
        var w = wallets[k++ % wallets.length];
        var vr = el.getBoundingClientRect();
        var r = w.getBoundingClientRect();
        place(r.right - vr.left - 56, r.top - vr.top + r.height / 2 - 6);
        setTimeout(function () { cursor.classList.add("is-press"); w.classList.add("is-picked"); }, 900);
        setTimeout(function () {
          cursor.classList.remove("is-press");
          foot.classList.add("is-ok");
          foot.textContent = "Connected · 0x3f2…a19c on Robinhood Chain";
        }, 1150);
        setTimeout(function () {
          w.classList.remove("is-picked");
          foot.classList.remove("is-ok");
          foot.textContent = idle;
          rest();
        }, 3400);
      };
    }
  };

  // About: key words get underlined, chips appear, progress fills
  if (words.length) {
    var KEY = /^(collateral,|stablecoin,|rate|term|approves|changes)$/;
    words.forEach(function (w) { if (KEY.test(w.textContent)) w.classList.add("is-key"); });
  }
  var aboutChips = $$(".about-chip");
  var aboutBar = $(".about-progress");
  function paintAbout() {
    if (!about) return;
    var span = about.offsetHeight - window.innerHeight;
    var q = span > 0 ? clamp((-about.getBoundingClientRect().top + window.innerHeight * 0.25) / span, 0, 1) : 1;
    if (aboutBar) aboutBar.style.setProperty("--p", q.toFixed(3));
    aboutChips.forEach(function (c) {
      c.classList.toggle("is-on", reduced || q >= parseFloat(c.getAttribute("data-at")));
    });
  }
  window.addEventListener("scroll", paintAbout, { passive: true });
  window.addEventListener("resize", paintAbout);
  paintAbout();

  // Safety net for the observer: anything already on screen when a scroll
  // frame runs is revealed there and then, so content never waits on a
  // late observer callback.
  var pending = null;
  function revealInView(vh) {
    if (!pending) return;
    pending = pending.filter(function (el) {
      if (el.classList.contains("is-in")) return false;
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.94 && r.bottom > 0) {
        el.classList.add("is-in", "is-visible");
        startDemo(el);
        return false;
      }
      return true;
    });
  }

  var watched = $$("[data-reveal], [data-split], [data-anim], [data-loop]");
  pending = watched.slice();
  revealInView(window.innerHeight);
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          startDemo(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    watched.forEach(function (el) { io.observe(el); });
  } else {
    watched.forEach(function (el) { el.classList.add("is-in", "is-visible"); });
  }
})();
