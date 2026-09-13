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
     config/loro.config.js: { name, tokenAddress, docsUrl, deployed }.
     The "Contract address" bar belongs to the project token, which is a
     separate contract from LoroLoan; it stays "Coming soon" until set. */
  function applyConfig(cfg) {
    cfg = cfg || {};
    var address = cfg.tokenAddress || "";

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
    var statEl = $("#footStatus");
    if (netEl && cfg.name) netEl.textContent = cfg.name;
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

    // Dot matrix sphere in the manner of an ASCII render: square points on
    // a regular latitude grid, dithered away on the side facing from the
    // light, framed by construction lines (ring, axes, golden spiral).
    var small = window.innerWidth < 900;
    var R = 1.12;
    var ROWS = small ? 52 : 72;
    var INK = [0.043, 0.055, 0.067];   // --ink
    var BRONZE = [0.79, 0.66, 0.49];   // --accent
    var LIGHT = new THREE.Vector3(-0.55, 0.6, 0.58).normalize();

    var tx = [], ty = [], tz = [];
    for (var row = 0; row < ROWS; row++) {
      var lat = -Math.PI / 2 + ((row + 0.5) / ROWS) * Math.PI;
      var ring = Math.cos(lat);
      var perRow = Math.max(6, Math.round(ROWS * 2 * ring));
      var offset = (row % 2) * 0.5;
      for (var k = 0; k < perRow; k++) {
        var lon = ((k + offset) / perRow) * Math.PI * 2;
        tx.push(Math.cos(lon) * ring * R);
        ty.push(Math.sin(lat) * R);
        tz.push(Math.sin(lon) * ring * R);
      }
    }

    var N = tx.length;
    var positions = new Float32Array(N * 3);
    var colors = new Float32Array(N * 3);
    var starts = new Float32Array(N * 3);
    var targets = new Float32Array(N * 3);
    var delays = new Float32Array(N);
    var phases = new Float32Array(N);
    var dither = new Float32Array(N);
    var accent = new Uint8Array(N);

    for (var i = 0; i < N; i++) {
      targets[i * 3] = tx[i];
      targets[i * 3 + 1] = ty[i];
      targets[i * 3 + 2] = tz[i];

      var sx = Math.random() * 2 - 1, sy = Math.random() * 2 - 1, sz = Math.random() * 2 - 1;
      var len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      var dist = 3.2 + Math.random() * 5.5;
      starts[i * 3] = (sx / len) * dist;
      starts[i * 3 + 1] = (sy / len) * dist;
      starts[i * 3 + 2] = (sz / len) * dist;

      positions[i * 3] = starts[i * 3];
      positions[i * 3 + 1] = starts[i * 3 + 1];
      positions[i * 3 + 2] = starts[i * 3 + 2];

      dither[i] = Math.random();
      accent[i] = Math.random() < 0.06 ? 1 : 0;
      delays[i] = Math.random() * 0.38;
      phases[i] = Math.random() * Math.PI * 2;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true
    });

    var points = new THREE.Points(geo, mat);
    group.add(points);
    group.position.x = globeState.heroX;

    // Construction lines. They follow the sphere's position and scale but
    // not its spin, and draw themselves in as the sphere forms.
    var guides = new THREE.Group();
    scene.add(guides);
    var guideMat = new THREE.LineBasicMaterial({ color: 0x0b0e11, transparent: true, opacity: 0, depthWrite: false });
    var guideAccent = new THREE.LineBasicMaterial({ color: 0xc9a97e, transparent: true, opacity: 0, depthWrite: false });
    var guideLines = [];
    function addGuide(pts, m) {
      var g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setDrawRange(0, 0);
      guides.add(new THREE.Line(g, m));
      guideLines.push({ geo: g, count: pts.length });
    }
    function circlePts(cx, cy, r, steps) {
      var out = [];
      for (var s = 0; s <= steps; s++) {
        var a = Math.PI / 2 + (s / steps) * Math.PI * 2;
        out.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
      }
      return out;
    }

    addGuide(circlePts(0, 0, R * 1.08, 160), guideMat);
    addGuide([new THREE.Vector3(-R * 1.45, R * 0.18, 0), new THREE.Vector3(R * 1.6, R * 0.18, 0)], guideMat);
    addGuide([new THREE.Vector3(0, R * 1.24, 0), new THREE.Vector3(0, -R * 1.24, 0)], guideMat);

    var PHI = (1 + Math.sqrt(5)) / 2;
    var growth = Math.log(PHI) / (Math.PI / 2);
    var eyeX = R * 0.45, eyeY = -R * 0.42;
    var spiral = [];
    for (var s = 0; s <= 240; s++) {
      var th = Math.PI * 1.5 - (s / 240) * Math.PI * 4;
      var sr = R * 0.5 * Math.exp(growth * (th - Math.PI * 1.5));
      spiral.push(new THREE.Vector3(eyeX + Math.cos(th) * sr, eyeY + Math.sin(th) * sr, 0));
    }
    addGuide(spiral, guideAccent);
    addGuide(circlePts(eyeX, eyeY, R * 0.1, 64), guideMat);

    // Sparse dust field behind everything
    var FIELD = small ? 260 : 520;
    var fieldPos = new Float32Array(FIELD * 3);
    for (var f = 0; f < FIELD; f++) {
      fieldPos[f * 3] = (Math.random() * 2 - 1) * 7;
      fieldPos[f * 3 + 1] = (Math.random() * 2 - 1) * 4;
      fieldPos[f * 3 + 2] = -1.5 - Math.random() * 2.5;
    }
    var fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(fieldPos, 3));
    var fieldMat = new THREE.PointsMaterial({
      size: 0.02, color: 0x0b0e11, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true
    });
    scene.add(new THREE.Points(fieldGeo, fieldMat));

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
    var normalRot = new THREE.Matrix3();

    function tick() {
      requestAnimationFrame(tick);
      if (!globeVisible || document.hidden) return;

      var t = clock.getElapsedTime();
      var p = formation.p;

      group.rotation.y += 0.0014;
      points.rotation.y += (mouse.x * 0.3 - points.rotation.y) * 0.03;
      points.rotation.x += (mouse.y * 0.18 - points.rotation.x) * 0.03;

      // progress 0 → hero rest (right, scale 1); 1 → centered & expanded
      var gp = globeState.progress;
      group.scale.setScalar(1 + 1.6 * gp);
      group.position.x = globeState.heroX * (1 - gp);
      guides.scale.copy(group.scale);
      guides.position.copy(group.position);
      mat.opacity = 0.95 * (1 - 0.25 * gp);

      // Rotation part of the points' world matrix, to light each dot
      // in view space as the sphere turns
      group.updateMatrixWorld(true);
      normalRot.setFromMatrix4(points.matrixWorld);
      var m = normalRot.elements;

      for (var i = 0; i < N; i++) {
        var i3 = i * 3;
        var local = (p - delays[i]) / 0.62;
        local = local < 0 ? 0 : local > 1 ? 1 : local;
        var e = easeOutCubic(local);
        var w = 1 + Math.sin(t * 1.1 + phases[i]) * 0.014 * e;

        var ox = targets[i3], oy = targets[i3 + 1], oz = targets[i3 + 2];
        var nx = m[0] * ox + m[3] * oy + m[6] * oz;
        var ny = m[1] * ox + m[4] * oy + m[7] * oz;
        var nz = m[2] * ox + m[5] * oy + m[8] * oz;
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;

        var lit = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
        lit = lit < 0 ? 0 : lit;
        // Dither: dots survive in proportion to light. While scattered
        // (e < 1) every dot stays so the formation reads as a swarm.
        if (dither[i] > 0.28 + 0.72 * lit + (1 - e)) {
          pos[i3 + 2] = -1000;   // past the far plane, so it is clipped
          continue;
        }

        pos[i3]     = starts[i3]     + (ox * w - starts[i3])     * e;
        pos[i3 + 1] = starts[i3 + 1] + (oy * w - starts[i3 + 1]) * e;
        pos[i3 + 2] = starts[i3 + 2] + (oz * w - starts[i3 + 2]) * e;

        var tone = (0.4 + 0.6 * lit) * (nz < 0 ? 0.45 : 1);
        var c = accent[i] ? BRONZE : INK;
        colors[i3]     = 1 - (1 - c[0]) * tone;
        colors[i3 + 1] = 1 - (1 - c[1]) * tone;
        colors[i3 + 2] = 1 - (1 - c[2]) * tone;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;

      var draw = p < 0.35 ? 0 : (p - 0.35) / 0.65;
      draw = draw > 1 ? 1 : draw;
      for (var g = 0; g < guideLines.length; g++) {
        guideLines[g].geo.setDrawRange(0, Math.ceil(guideLines[g].count * draw));
      }
      guideMat.opacity = 0.3 * draw * (1 - 0.6 * gp);
      guideAccent.opacity = 0.8 * draw * (1 - 0.6 * gp);
      fieldMat.opacity = 0.35 * p;

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
