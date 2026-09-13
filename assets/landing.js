/* ============================================================
   LORO — landing page behaviour
   - Deployment config binding (config/loro.config.js)
   - Header scroll state, mobile sheet
   - Hero: title entrance and the three.js objects
   - Scroll motion: phone, marquee, word reveal, footer word
   - In view reveals and the small live demos in the cards
   Needs assets/vendor/three.min.js for the hero objects only;
   everything else runs without it.
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

  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", function (e) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  initHeroObjects();

  /* Glossy 3D objects around the hero copy. They rise in when the page
     loads, bob and turn on their own, lean toward the pointer, and
     scatter upward while the hero scrolls away. */
  function initHeroObjects() {
    var canvas = $("#hero3d");
    var THREE = window.THREE;
    if (!canvas || !hero || !THREE) return;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      return; // no WebGL: the hero stands on its own
    }
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    var small = window.innerWidth < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 16);

    /* ---- Environment: a daylight studio baked once for reflections ---- */
    var pmrem = new THREE.PMREMGenerator(renderer);
    var studio = new THREE.Scene();
    var domeGeo = new THREE.SphereGeometry(20, 48, 24);
    var domeCols = [];
    var p = domeGeo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var h = p.getY(i) / 20;
      if (h > 0) domeCols.push(0.5 + 0.5 * (1 - h), 0.66 + 0.34 * (1 - h), 1);
      else domeCols.push(0.78 + 0.22 * (1 + h), 0.72 + 0.28 * (1 + h), 0.66 + 0.34 * (1 + h));
    }
    domeGeo.setAttribute("color", new THREE.Float32BufferAttribute(domeCols, 3));
    studio.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    function softbox(w, hgt, x, y, z, power) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, hgt),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      studio.add(m);
    }
    softbox(16, 6, -8, 13, 6, 5);
    softbox(8, 10, 13, 3, 8, 2.6);
    softbox(24, 3, 0, -11, 9, 1.2);
    scene.environment = pmrem.fromScene(studio, 0.03).texture;
    pmrem.dispose();

    var sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-6, 9, 10);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x9a8a78, 0.5));

    /* ---- Materials ---- */
    var mat = {
      gold: new THREE.MeshPhysicalMaterial({ color: 0xf0bd48, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: 0xe9eef6, metalness: 1, roughness: 0.12 }),
      orange: new THREE.MeshPhysicalMaterial({ color: 0xff7a1f, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
      gem: new THREE.MeshPhysicalMaterial({ color: 0x8a7bff, metalness: 0.2, roughness: 0.05, clearcoat: 1, flatShading: true, iridescence: 0.7, iridescenceIOR: 1.6 }),
      mint: new THREE.MeshPhysicalMaterial({ color: 0x25c795, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
      blue: new THREE.MeshPhysicalMaterial({ color: 0x2f6fe0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
      white: new THREE.MeshPhysicalMaterial({ color: 0xf7f7fa, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 }),
      ink: new THREE.MeshPhysicalMaterial({ color: 0x1b2230, roughness: 0.35, metalness: 0.3, clearcoat: 0.6 })
    };

    /* ---- Geometry helpers ---- */
    function roundedRect(w, hgt, r) {
      var s = new THREE.Shape();
      var x = -w / 2, y = -hgt / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + hgt - r);
      s.quadraticCurveTo(x + w, y + hgt, x + w - r, y + hgt);
      s.lineTo(x + r, y + hgt);
      s.quadraticCurveTo(x, y + hgt, x, y + hgt - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function slab(w, hgt, depth, r, bevel) {
      var g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, hgt - 2 * bevel, Math.max(0.02, r - bevel)), {
        depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 14
      });
      g.center();
      return g;
    }
    function mesh(geo, m, x, y, z) {
      var o = new THREE.Mesh(geo, m);
      o.position.set(x || 0, y || 0, z || 0);
      return o;
    }

    /* ---- Objects ---- */
    function coin() {
      var g = new THREE.Group();
      var body = mesh(new THREE.CylinderGeometry(1, 1, 0.24, 72), mat.gold);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      [0.125, -0.125].forEach(function (z) {
        g.add(mesh(new THREE.TorusGeometry(0.86, 0.045, 12, 72), mat.gold, 0, 0, z));
      });
      // The Loro mark, raised on both faces
      [1, -1].forEach(function (side) {
        g.add(mesh(new THREE.BoxGeometry(0.15, 0.76, 0.07), mat.ink, -0.14 * side, 0.06, 0.14 * side));
        g.add(mesh(new THREE.BoxGeometry(0.5, 0.15, 0.07), mat.orange, 0.04 * side, -0.25, 0.14 * side));
      });
      return g;
    }
    function gem() {
      var o = mesh(new THREE.OctahedronGeometry(1, 0), mat.gem);
      o.scale.set(0.78, 1.28, 0.78);
      var g = new THREE.Group();
      g.add(o);
      return g;
    }
    function lock() {
      var g = new THREE.Group();
      g.add(mesh(slab(1.55, 1.25, 0.64, 0.3, 0.1), mat.orange, 0, -0.24, 0));
      var shackle = mesh(new THREE.TorusGeometry(0.46, 0.12, 24, 64, Math.PI), mat.chrome, 0, 0.42, 0);
      g.add(shackle);
      [-0.46, 0.46].forEach(function (x) {
        g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 24), mat.chrome, x, 0.26, 0));
      });
      var hole = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32), mat.ink, 0, -0.16, 0.32);
      hole.rotation.x = Math.PI / 2;
      g.add(hole);
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), mat.ink, 0, -0.34, 0.32));
      return g;
    }
    function cube() {
      var g = new THREE.Group();
      g.add(mesh(slab(1.25, 1.25, 1.25, 0.24, 0.16), mat.mint));
      [[-0.3, 0.26], [0, 0.46], [0.3, 0.68]].forEach(function (b) {
        g.add(mesh(new THREE.BoxGeometry(0.17, b[1], 0.06), mat.white, b[0], -0.34 + b[1] / 2, 0.64));
      });
      return g;
    }
    function stable() {
      var g = new THREE.Group();
      var body = mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.22, 64), mat.blue);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      var face = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.24, 64), mat.white);
      face.rotation.x = Math.PI / 2;
      g.add(face);
      [0.115, -0.115].forEach(function (z) {
        g.add(mesh(new THREE.TorusGeometry(0.74, 0.03, 10, 64), mat.chrome, 0, 0, z));
      });
      return g;
    }
    function ring() { var g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(0.72, 0.25, 40, 96), mat.white)); return g; }
    function pill() {
      var g = new THREE.Group();
      var a = mesh(new THREE.CapsuleGeometry(0.28, 0.5, 10, 24), mat.orange, 0, 0.26, 0);
      var b = mesh(new THREE.CapsuleGeometry(0.28, 0.5, 10, 24), mat.white, 0, -0.26, 0);
      g.add(a); g.add(b);
      return g;
    }
    function pearl() { var g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(0.42, 48, 32), mat.chrome)); return g; }

    // nx/ny place each object in screen space (-1..1); mx/my on phones.
    var DEFS = [
      // On phones the copy fills the middle, so the objects sit in the
      // strip above the title and the gap between the button and the phone.
      { make: coin,   nx: -0.74, ny:  0.44, mx: -0.7,  my:  0.8,  s: 1.3,  lift: 1.3, spin: [0.2, 0.9, 0.05] },
      { make: gem,    nx:  0.75, ny:  0.5,  mx:  0.72, my:  0.78, s: 1.1,  lift: 1.7, spin: [0.1, 0.8, 0.12] },
      { make: lock,   nx: -0.63, ny: -0.38, mx: -0.62, my: -0.5,  s: 1.2,  lift: 0.9, spin: [0.12, 0.45, 0.04] },
      { make: cube,   nx:  0.64, ny: -0.42, mx:  0.64, my: -0.52, s: 1.05, lift: 1.1, spin: [0.35, 0.5, 0.2] },
      { make: stable, nx: -0.92, ny:  0.02, s: 0.85, lift: 1.9, spin: [0.1, 0.75, 0.25], wide: true },
      { make: ring,   nx:  0.93, ny:  0.06, s: 0.85, lift: 1.4, spin: [0.55, 0.3, 0.1], wide: true },
      { make: pill,   nx:  0.36, ny: -0.86, s: 0.72, lift: 2.2, spin: [0.3, 0.2, 0.7], wide: true },
      { make: pearl,  nx: -0.38, ny: -0.84, s: 0.5,  lift: 2.4, spin: [0, 0, 0], wide: true }
    ];
    var items = [];
    DEFS.forEach(function (d, k) {
      if (small && d.wide) return;
      var group = d.make();
      var holder = new THREE.Group();
      holder.add(group);
      scene.add(holder);
      items.push({
        d: d, holder: holder, obj: group,
        rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
        phase: Math.random() * Math.PI * 2,
        delay: k * 0.09
      });
    });

    var halfH = 1, halfW = 1;
    function resize() {
      var w = hero.clientWidth, hgt = hero.clientHeight;
      renderer.setSize(w, hgt, false);
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      halfW = halfH * camera.aspect;
    }
    resize();
    window.addEventListener("resize", resize);

    function easeOutBack(x) {
      var c1 = 1.4, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    var visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);
    }

    var sizeFactor = clamp(halfW / 7, 0.62, 1.15);
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) return;

      var t = now / 1000;
      var since = (now - readyAt) / 1000;
      var scroll = clamp(window.scrollY / Math.max(1, hero.offsetHeight), 0, 1.4);

      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      sizeFactor = clamp(halfW / 7, 0.62, 1.15);

      items.forEach(function (it) {
        var d = it.d;
        var e = reduced ? 1 : clamp((since - it.delay) / 1.4, 0, 1);
        var enter = e >= 1 ? 1 : easeOutBack(e);
        var nx = small && d.mx != null ? d.mx : d.nx;
        var ny = small && d.my != null ? d.my : d.ny;
        var depth = d.s * 0.35;

        var x = nx * halfW * 0.9 * (1 + scroll * 0.35) + mouse.x * depth;
        var y = ny * halfH * 0.84
          - (1 - enter) * halfH * 1.7
          + scroll * halfH * d.lift
          + (reduced ? 0 : Math.sin(t * 0.9 + it.phase) * 0.14)
          - mouse.y * depth;

        it.holder.position.set(x, y, 0);
        it.holder.scale.setScalar(Math.max(0.001, d.s * sizeFactor * (small ? 0.55 : 1) * (0.3 + 0.7 * enter) * (1 - scroll * 0.25)));

        var spin = reduced ? 0 : t * 0.35;
        it.obj.rotation.set(
          it.rot[0] + spin * d.spin[0] + scroll * 2.4 + mouse.y * 0.35,
          it.rot[1] + spin * d.spin[1] + scroll * 3.2 + mouse.x * 0.45,
          it.rot[2] + spin * d.spin[2]
        );
      });

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
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
      footWord.style.transform = "translateX(-50%) translateY(" + ((1 - fq) * 45).toFixed(1) + "%)";
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
