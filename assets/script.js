/* ============================================================
   LORO — site engine
   - Content binding (content.js) + list renderers
   - Deployment config binding (config/loro.config.js)
   - Nav, mobile menu, reveals
   - Preloader, Three.js particle field, scroll choreography
   ============================================================ */

(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var hasGsap = typeof window.gsap !== "undefined";
  var hasST = hasGsap && typeof window.ScrollTrigger !== "undefined";
  var hasThree = typeof window.THREE !== "undefined";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isHome = !!$("#globe");

  if (hasST) gsap.registerPlugin(ScrollTrigger);

  if (isHome && !location.hash) {
    // The intro assumes the story starts from the top. A deep link
    // to a section is honoured instead of being overridden.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }

  var CONTENT = window.LoroContent || {};

  function get(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, CONTENT);
  }

  /* Bind [data-cms] to textContent, [data-cms-html] to innerHTML,
     [data-cms-href] to href */
  $$("[data-cms]").forEach(function (el) {
    var v = get(el.getAttribute("data-cms"));
    if (v != null) el.textContent = v;
  });
  $$("[data-cms-html]").forEach(function (el) {
    var v = get(el.getAttribute("data-cms-html"));
    if (v != null) el.innerHTML = v;
  });
  $$("[data-cms-href]").forEach(function (el) {
    var v = get(el.getAttribute("data-cms-href"));
    if (v != null) el.setAttribute("href", v);
  });

  /* ============================================================
     LIST RENDERERS
     ============================================================ */
  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  /* Inline icon set. The source template pulled these from an icon
     font; drawing them inline keeps the page to two network fonts
     and lets them inherit the accent colour. */
  var ICONS = {
    lock: '<path d="M5 10.5h14v9.5H5z"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    note: '<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.4l3.4 2"/>',
    person: '<circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
    signal: '<path d="M12 20V9.5"/><path d="M7.5 7a6.4 6.4 0 0 1 9 0"/><path d="M4.5 4a10.6 10.6 0 0 1 15 0"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8"/><path d="M17.5 12v3.4"/>'
  };
  function icon(name) {
    var d = ICONS[name];
    if (!d) return "";
    return '<svg class="block-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + "</svg>";
  }

  // Ticker: [{name, logo?}] — a logo image, or a serif wordmark
  $$("[data-render-partners]").forEach(function (track) {
    var items = get(track.getAttribute("data-render-partners")) || [];
    track.innerHTML = "";
    for (var rep = 0; rep < 4; rep++) {
      items.forEach(function (p) {
        var cell = h("span", "marquee-item");
        if (p.logo) {
          var img = h("img");
          img.src = p.logo;
          img.alt = p.name;
          img.loading = "lazy";
          cell.appendChild(img);
          if (p.wordmark) cell.appendChild(h("span", "marquee-word", p.wordmark));
        } else {
          cell.appendChild(h("span", "marquee-name", p.name));
        }
        track.appendChild(cell);
        track.appendChild(h("span", "marquee-sep", ""));
      });
    }
  });

  // Metric numbers: [{prefix, value, suffix, label}]
  $$("[data-render-metrics]").forEach(function (wrap) {
    var items = get(wrap.getAttribute("data-render-metrics")) || [];
    wrap.innerHTML = "";
    items.forEach(function (m) {
      var item = h("div", "metric");
      item.appendChild(h("div", "rule rule-dark"));
      item.appendChild(h("p", "metric-label", m.label));
      var n = Number(m.value);
      // Only a real figure is worth counting up to
      var body = (isFinite(n) && n > 0)
        ? '<span data-count="' + n + '">0</span>'
        : String(m.value);
      item.appendChild(h("p", "metric-num", (m.prefix || "") + body + (m.suffix || "")));
      wrap.appendChild(item);
    });
  });

  // Card meta chips
  $$("[data-render-meta]").forEach(function (ul) {
    var items = get(ul.getAttribute("data-render-meta")) || [];
    ul.innerHTML = "";
    items.forEach(function (m) { ul.appendChild(h("li", null, m)); });
  });

  // Step / feature grids: [{num?, title, copy, icon?}]
  $$("[data-render-blocks]").forEach(function (wrap) {
    var items = get(wrap.getAttribute("data-render-blocks")) || [];
    wrap.innerHTML = "";
    items.forEach(function (b, i) {
      var item = h("article", "block reveal");
      item.appendChild(h("div", wrap.closest(".on-light") ? "rule rule-dark" : "rule"));
      var num = h("p", "mono block-num", b.num || ("0" + (i + 1)));
      if (b.icon) {
        var head = h("div", "block-head");
        head.innerHTML = icon(b.icon);
        head.appendChild(num);
        item.appendChild(head);
      } else {
        item.appendChild(num);
      }
      item.appendChild(h("h3", "block-title", b.title));
      item.appendChild(h("p", "block-copy", b.copy));
      wrap.appendChild(item);
    });
  });

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
     config/loro.config.js: { name, contracts, stablecoin, docsUrl, deployed } */
  function applyConfig(cfg) {
    cfg = cfg || {};
    var contracts = cfg.contracts || {};
    var stablecoin = cfg.stablecoin || {};
    var address = contracts.loroLoan || "";

    /* ---- Contract address bar ---- */
    var valueEl = $("#addrValue");
    var btn = $("#addrCopy");
    var btnText = $("#addrCopyText");

    if (valueEl && btn) {
      if (address) {
        valueEl.textContent = truncateAddress(address);
        valueEl.setAttribute("title", address);
        btn.disabled = false;
        btn.removeAttribute("title");
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
      } else {
        valueEl.textContent = "Coming soon";
        btn.disabled = true;
        btn.setAttribute("title", "Not deployed yet.");
      }
    }

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
        el.addEventListener("click", function (e) { e.preventDefault(); });
      }
    });

    /* ---- Footer facts ---- */
    var deployed = !!cfg.deployed;
    var netEl = $("#footNetwork");
    var tokEl = $("#footToken");
    var statEl = $("#footStatus");
    if (netEl && cfg.name) netEl.textContent = cfg.name;
    if (tokEl) tokEl.textContent = stablecoin.symbol ? "Borrow " + stablecoin.symbol : "Stablecoin loans";
    if (statEl) statEl.textContent = deployed ? "Live" : "Not deployed";

    var note = $("#statusNote");
    if (note && deployed) {
      note.textContent = "Live on " + (cfg.name || "chain") + ".";
    }
  }

  window.Loro = window.Loro || {};
  window.Loro.applyConfig = applyConfig;

  // Render the empty state immediately, so the bar is never blank
  // if the config module is slow or missing.
  applyConfig(null);

  /* ---------- Count up helper ---------- */
  function countUp(el, target, dur) {
    if (!hasGsap) { el.textContent = target; return; }
    var obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: dur || 1.8,
      ease: "power3.out",
      onUpdate: function () { el.textContent = Math.round(obj.v).toLocaleString("en-US"); }
    });
  }

  /* ---------- Navbar scroll state ---------- */
  var top = $("#top");
  function onScrollNav() {
    if (window.scrollY > 24) top.classList.add("scrolled");
    else top.classList.remove("scrolled");
  }
  if (top) {
    window.addEventListener("scroll", onScrollNav, { passive: true });
    onScrollNav();
  }

  /* ---------- Mobile menu ---------- */
  var burger = $("#burger");
  var mMenu = $("#mMenu");
  if (burger && mMenu) {
    burger.addEventListener("click", function () {
      var open = mMenu.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      mMenu.setAttribute("aria-hidden", open ? "false" : "true");
      document.body.classList.toggle("locked", open);
    });
    $$(".m-links a", mMenu).forEach(function (a) {
      a.addEventListener("click", function () {
        mMenu.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
        mMenu.setAttribute("aria-hidden", "true");
        document.body.classList.remove("locked");
      });
    });
  }

  /* ============================================================
     THREE.JS PARTICLE FIELD
     ============================================================ */
  // progress: 0 = hero rest, 1 = expanded/centered (driven by scroll)
  // heroX: responsive resting x, recomputed from viewport so the field
  //        stays centered in the right region at any width
  var globeState = { progress: 0, heroX: 1.2, opacity: 1 };
  var formation = { p: reduced ? 1 : 0 };
  var globeVisible = true;

  function initGlobe() {
    if (!hasThree) return;
    var canvas = $("#globe");
    if (!canvas) return;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    // Pulled back so the sphere has even breathing room top & bottom (not
    // just left/right); restX() reads this value so horizontal stays balanced.
    camera.position.z = 5.0;

    var group = new THREE.Group();
    scene.add(group);

    // Resting x so the sphere sits centered in the right region of the
    // layout — derived from the camera's visible half-width at the sphere
    // plane, so it scales correctly from laptop to 1920 and beyond.
    function restX() {
      var halfH = Math.tan((38 * Math.PI / 180) / 2) * camera.position.z;
      var halfW = halfH * camera.aspect;
      return halfW * 0.46;
    }
    globeState.heroX = restX();

    var N = window.innerWidth < 900 ? 3800 : 7000;
    var R = 1.12;
    var GOLDEN = Math.PI * (3 - Math.sqrt(5));

    var positions = new Float32Array(N * 3);
    var colors = new Float32Array(N * 3);
    var starts = new Float32Array(N * 3);
    var targets = new Float32Array(N * 3);
    var delays = new Float32Array(N);
    var phases = new Float32Array(N);

    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2;
      var rad = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = GOLDEN * i;
      var jitter = 1 + (Math.random() - 0.5) * 0.02;
      targets[i * 3] = Math.cos(theta) * rad * R * jitter;
      targets[i * 3 + 1] = y * R * jitter;
      targets[i * 3 + 2] = Math.sin(theta) * rad * R * jitter;

      var sx = Math.random() * 2 - 1, sy = Math.random() * 2 - 1, sz = Math.random() * 2 - 1;
      var len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      var dist = 3.2 + Math.random() * 5.5;
      starts[i * 3] = (sx / len) * dist;
      starts[i * 3 + 1] = (sy / len) * dist;
      starts[i * 3 + 2] = (sz / len) * dist;

      positions[i * 3] = starts[i * 3];
      positions[i * 3 + 1] = starts[i * 3 + 1];
      positions[i * 3 + 2] = starts[i * 3 + 2];

      // Palette: a cool field with champagne highlights, matching
      // --accent and --accent-cool in styles.css
      var shade;
      if (Math.random() < 0.15) {
        shade = 0.88 + Math.random() * 0.12;
        colors[i * 3] = 0.79 * shade;
        colors[i * 3 + 1] = 0.66 * shade;
        colors[i * 3 + 2] = 0.49 * shade;
      } else {
        shade = 0.24 + Math.random() * 0.42;
        colors[i * 3] = shade * 0.74;
        colors[i * 3 + 1] = shade * 0.93;
        colors[i * 3 + 2] = shade * 1.0;
      }

      delays[i] = Math.random() * 0.38;
      phases[i] = Math.random() * Math.PI * 2;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.PointsMaterial({
      size: 0.016,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    var points = new THREE.Points(geo, mat);
    group.add(points);
    group.position.x = globeState.heroX;

    var mouse = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (e) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      globeState.heroX = restX();
    });

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    var clock = new THREE.Clock();
    var pos = geo.attributes.position.array;

    function tick() {
      requestAnimationFrame(tick);
      if (!globeVisible || document.hidden) return;

      var t = clock.getElapsedTime();
      var p = formation.p;

      for (var i = 0; i < N; i++) {
        var i3 = i * 3;
        var local = (p - delays[i]) / 0.62;
        local = local < 0 ? 0 : local > 1 ? 1 : local;
        var e = easeOutCubic(local);
        var w = 1 + Math.sin(t * 1.1 + phases[i]) * 0.014 * e;

        pos[i3]     = starts[i3]     + (targets[i3]     * w - starts[i3])     * e;
        pos[i3 + 1] = starts[i3 + 1] + (targets[i3 + 1] * w - starts[i3 + 1]) * e;
        pos[i3 + 2] = starts[i3 + 2] + (targets[i3 + 2] * w - starts[i3 + 2]) * e;
      }
      geo.attributes.position.needsUpdate = true;

      group.rotation.y += 0.0014;
      points.rotation.y += (mouse.x * 0.3 - points.rotation.y) * 0.03;
      points.rotation.x += (mouse.y * 0.18 - points.rotation.x) * 0.03;

      // progress 0 → hero rest (right, scale 1); 1 → centered & expanded
      var gp = globeState.progress;
      group.scale.setScalar(1 + 1.6 * gp);
      group.position.x = globeState.heroX * (1 - gp);
      mat.opacity = 0.95 * (1 - 0.25 * gp);

      renderer.render(scene, camera);
    }
    tick();
  }

  if (isHome) initGlobe();

  /* ============================================================
     PRELOADER + INTRO
     ============================================================ */
  var preloader = $("#preloader");
  var introPlayed = false;

  function playIntro() {
    if (introPlayed) return;
    introPlayed = true;

    if (!hasGsap) {
      if (preloader) preloader.style.display = "none";
      doc.classList.remove("js");
      formation.p = 1;
      return;
    }

    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    var tlTo = function (sel, vars, pos) {
      var els = $$(sel);
      if (els.length) tl.to(els, vars, pos);
    };

    if (preloader) {
      tl.to(preloader, {
        autoAlpha: 0,
        duration: 0.7,
        ease: "power2.inOut",
        onComplete: function () { preloader.style.display = "none"; }
      });
    }

    if (!reduced) tl.to(formation, { p: 1, duration: 3.4, ease: "power3.inOut" }, 0.1);

    tlTo("#top", { opacity: 1, duration: 0.9 }, 0.3);
    tlTo(".rule-hero", { scaleX: 1, duration: 1.3, ease: "power4.inOut", stagger: 0.12 }, 0.45);
    tlTo(".line-inner", { y: 0, duration: 1.25, ease: "power4.out", stagger: 0.14 }, 0.7);
    tlTo(".hero-sub, .hero-ctas", { opacity: 1, duration: 1, stagger: 0.12 }, 1.15);
    tlTo(".scroll-cue", { opacity: 1, duration: 1 }, 1.7);
    setTimeout(function () { if (tl.progress() < 1) tl.progress(1); }, 7000);
  }

  if (isHome) {
    var tickEl = $("#preloaderTick");
    if (hasGsap && tickEl) {
      var tickObj = { v: 0 };
      gsap.to(tickObj, {
        v: 100, duration: 1.4, ease: "power2.inOut",
        onUpdate: function () {
          tickEl.textContent = String(Math.round(tickObj.v)).padStart(2, "0");
        },
        onComplete: playIntro
      });
      setTimeout(playIntro, 2600);
    } else {
      playIntro();
    }
    window.addEventListener("load", function () { setTimeout(playIntro, 1500); });
  }

  /* ============================================================
     SCROLL CHOREOGRAPHY
     ============================================================ */
  if (hasST) {

    if (isHome) {
      gsap.to(".hero-inner", {
        yPercent: -14,
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 35%", scrub: true }
      });
      gsap.to(".scroll-cue", {
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "18% top", scrub: true }
      });

      gsap.timeline({
        scrollTrigger: { trigger: "#problem", start: "top bottom", end: "top top", scrub: true }
      })
        .to(globeState, { progress: 1, ease: "none" }, 0);

      ScrollTrigger.create({
        trigger: "#loan",
        start: "top top",
        end: "max",
        onToggle: function (self) { globeVisible = !self.isActive; }
      });

      // Depth effect: pinned cards recede as the light section slides over
      if (window.matchMedia("(min-width: 1101px)").matches) {
        gsap.to(".products-grid", {
          scale: 0.94,
          opacity: 0.4,
          transformOrigin: "50% 40%",
          ease: "none",
          scrollTrigger: { trigger: "#loan", start: "top bottom", end: "top 25%", scrub: true }
        });
      }

      gsap.from(".products-left > *", {
        y: 42, opacity: 0, duration: 1.1, ease: "power3.out", stagger: 0.1,
        scrollTrigger: { trigger: "#problem", start: "top 62%" }
      });
      gsap.from(".card", {
        y: 72, opacity: 0, duration: 1.2, ease: "power3.out", stagger: 0.16,
        scrollTrigger: { trigger: "#problem", start: "top 55%" }
      });

      var aboutBig = $("#aboutBig");
      if (aboutBig) {
        splitWords(aboutBig);
        gsap.to("#aboutBig .w", {
          opacity: 1,
          ease: "none",
          stagger: 0.6,
          scrollTrigger: { trigger: aboutBig, start: "top 78%", end: "top 30%", scrub: 0.4 }
        });
      }

      $$(".reveal-frame").forEach(function (frame) {
        gsap.fromTo(frame,
          { clipPath: "inset(16% 9% 16% 9%)" },
          { clipPath: "inset(0% 0% 0% 0%)", ease: "none",
            scrollTrigger: { trigger: frame, start: "top 92%", end: "top 38%", scrub: 0.4 } }
        );
        var inner = $(".frame-inner", frame);
        if (inner) {
          gsap.fromTo(inner,
            { scale: 1.1 },
            { scale: 1, ease: "none",
              scrollTrigger: { trigger: frame, start: "top 92%", end: "top 25%", scrub: 0.4 } }
          );
        }
      });
    }

    // Count ups for any real figure placed in a metric
    $$("[data-count]").forEach(function (el) {
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: function () { countUp(el, parseInt(el.getAttribute("data-count"), 10), 1.8); }
      });
    });

    // Generic reveals (dynamic lists)
    $$(".reveal").forEach(function (el) {
      gsap.from(el, {
        y: 44, opacity: 0, duration: 1.1, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%" }
      });
    });

    // Section rules draw in
    $$(".section .rule, .section .rule-dark").forEach(function (el) {
      gsap.from(el, {
        scaleX: 0, duration: 1.2, ease: "power4.inOut",
        scrollTrigger: { trigger: el, start: "top 90%" }
      });
    });

    // Footer
    if ($(".site-footer")) {
      gsap.from(".footer-head > *", {
        y: 26, opacity: 0, duration: 1, ease: "power3.out", stagger: 0.1,
        scrollTrigger: { trigger: ".site-footer", start: "top 88%" }
      });
      gsap.from(".footer-grid > *", {
        y: 18, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08,
        scrollTrigger: { trigger: ".footer-grid", start: "top 94%" }
      });
    }
  } else if (!hasGsap) {
    doc.classList.remove("js");
  }

  /* ---------- Split a paragraph into word spans (keeps <em>) ---------- */
  function splitWords(el) {
    function split(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (piece) {
            if (!piece) return;
            if (/^\s+$/.test(piece)) {
              frag.appendChild(document.createTextNode(" "));
            } else {
              var s = document.createElement("span");
              s.className = "w";
              s.textContent = piece;
              frag.appendChild(s);
            }
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          split(child);
        }
      });
    }
    split(el);
  }

})();
