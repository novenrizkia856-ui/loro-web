/* ============================================================
   LORO — hero 3D objects (three.js r149)
   Realism comes from three things, all generated in code:
   - an HDR daylight environment (sky dome, sun, softboxes) baked
     once into a PMREM map, so every surface reflects a real sky
   - surface detail: normal maps computed from drawn height maps
     (coin relief and lettering, reeded edges), scratch and brushed
     roughness maps, colour variation in recesses
   - physically based materials: metals, clearcoated plastic and
     enamel, faceted crystal with iridescence, pearl sheen
   The objects rise in, bob, lean toward the pointer and scatter
   upward as the hero scrolls away.
   ============================================================ */

(function () {
  "use strict";

  var THREE = window.THREE;
  var hero = document.getElementById("home");
  var canvas = document.getElementById("hero3d");
  if (!THREE || !hero || !canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var small = window.innerWidth < 768;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // no WebGL: the hero stands on its own
  }
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.physicallyCorrectLights = true;
  var maxAniso = renderer.capabilities.getMaxAnisotropy();
  var TEX = small ? 512 : 1024;

  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", function (e) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ============================================================
     ENVIRONMENT
     ============================================================ */
  function buildEnvironment() {
    var env = new THREE.Scene();
    var R = 50;
    var dome = new THREE.SphereGeometry(R, 64, 32);
    var pos = dome.attributes.position;
    // Contrast is what makes metal read as metal: a bright, narrow
    // horizon between a deep sky and a dark ground.
    var zenith = new THREE.Color(0.02, 0.09, 0.38);
    var horizon = new THREE.Color(1.6, 1.62, 1.7);
    var ground = new THREE.Color(0.035, 0.035, 0.04);
    var c = new THREE.Color();
    var cols = [];
    for (var i = 0; i < pos.count; i++) {
      var h = pos.getY(i) / R;
      if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, 0.3));
      else c.copy(horizon).lerp(ground, Math.pow(-h, 0.18));
      cols.push(c.r, c.g, c.b);
    }
    dome.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    function light(geo, r, g, b, x, y, z) {
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    }
    light(new THREE.CircleGeometry(2.6, 48), 60, 55, 46, -20, 32, 22);  // the sun
    light(new THREE.PlaneGeometry(32, 8), 4.5, 4.6, 4.8, 2, 24, 30);    // broad soft key
    light(new THREE.PlaneGeometry(9, 26), 2.6, 2.8, 3.2, 36, 6, 12);    // cool side strip
    light(new THREE.PlaneGeometry(6, 18), 2.2, 2.0, 1.8, -36, -2, 10);  // warm side strip
    light(new THREE.PlaneGeometry(44, 6), 1.3, 1.25, 1.2, 0, -26, 24);  // bounce from below

    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return tex;
  }

  /* ============================================================
     TEXTURE HELPERS
     ============================================================ */
  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function toTexture(c, srgb, repeat) {
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  }
  function gray(v) { v = Math.round(clamp(v, 0, 255)); return "rgb(" + v + "," + v + "," + v + ")"; }

  // Draw, then soften: height maps need gentle slopes, not hard steps
  function softCanvas(w, h, blur, draw) {
    var raw = makeCanvas(w, h);
    draw(raw.getContext("2d"), w, h);
    if (!blur) return raw;
    var out = makeCanvas(w, h);
    var g = out.getContext("2d");
    g.filter = "blur(" + blur + "px)";
    g.drawImage(raw, 0, 0);
    return out;
  }

  function speckle(c, spread) {
    var g = c.getContext("2d");
    var img = g.getImageData(0, 0, c.width, c.height);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * spread;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Tangent space normal map from a height map (red channel)
  function normalFromHeight(src, strength) {
    var w = src.width, h = src.height;
    var s = src.getContext("2d").getImageData(0, 0, w, h).data;
    var out = makeCanvas(w, h);
    var og = out.getContext("2d");
    var img = og.createImageData(w, h);
    var d = img.data;
    for (var y = 0; y < h; y++) {
      var yu = (y - 1 + h) % h, yd = (y + 1) % h;
      for (var x = 0; x < w; x++) {
        var xl = (x - 1 + w) % w, xr = (x + 1) % w;
        var dx = (s[(y * w + xr) * 4] - s[(y * w + xl) * 4]) / 255 * strength;
        var dy = (s[(yd * w + x) * 4] - s[(yu * w + x) * 4]) / 255 * strength;
        var l = Math.sqrt(dx * dx + dy * dy + 1);
        var i = (y * w + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255;
        d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return toTexture(out, false);
  }

  function scratchRoughness(base, count) {
    var c = makeCanvas(512, 512);
    var g = c.getContext("2d");
    g.fillStyle = gray(base);
    g.fillRect(0, 0, 512, 512);
    for (var i = 0; i < count; i++) {
      var v = base + (Math.random() < 0.6 ? 1 : -1) * (25 + Math.random() * 45);
      g.strokeStyle = gray(v);
      g.globalAlpha = 0.12 + Math.random() * 0.35;
      g.lineWidth = 0.4 + Math.random() * 1.1;
      var x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * Math.PI, len = 8 + Math.random() * 90;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (Math.random() - 0.5) * 8, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    g.globalAlpha = 1;
    return toTexture(speckle(c, 22), false, 1);
  }

  function brushedRoughness(base) {
    var c = makeCanvas(512, 512);
    var g = c.getContext("2d");
    g.fillStyle = gray(base);
    g.fillRect(0, 0, 512, 512);
    for (var y = 0; y < 512; y++) {
      g.fillStyle = gray(base + (Math.random() - 0.5) * 60);
      g.globalAlpha = 0.5;
      g.fillRect(0, y, 512, 1);
    }
    g.globalAlpha = 1;
    return toTexture(speckle(c, 12), false, 1.4);
  }

  /* ============================================================
     COIN FACES
     ============================================================ */
  function ringText(g, s, text, radius, size, color) {
    g.fillStyle = color;
    g.font = "700 " + Math.round(s * size) + "px Geist, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    var chars = text.split("");
    var step = (Math.PI * 2) / chars.length;
    chars.forEach(function (ch, i) {
      g.save();
      g.translate(s / 2, s / 2);
      g.rotate(i * step);
      g.fillText(ch, 0, -s * radius);
      g.restore();
    });
  }
  function rimAndRing(g, s, color) {
    var c = s / 2;
    g.fillStyle = color;
    g.beginPath();
    g.arc(c, c, s * 0.5, 0, Math.PI * 2);
    g.arc(c, c, s * 0.445, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = s * 0.009;
    g.beginPath();
    g.arc(c, c, s * 0.305, 0, Math.PI * 2);
    g.stroke();
    // beaded border just inside the rim
    for (var i = 0; i < 90; i++) {
      var a = (i / 90) * Math.PI * 2;
      g.beginPath();
      g.arc(c + Math.cos(a) * s * 0.425, c + Math.sin(a) * s * 0.425, s * 0.0065, 0, Math.PI * 2);
      g.fill();
    }
  }
  // The brand mark (assets/brand/mark.png), filled with one colour so it
  // works as relief in the height map and as raised metal in the colour map
  var MARK = new Image();
  var markReady = new Promise(function (resolve) {
    MARK.onload = resolve;
    MARK.onerror = resolve;
  });
  MARK.src = "assets/brand/mark.png";

  function loroMark(g, s, color) {
    var size = Math.round(s * 0.36);
    if (!MARK.naturalWidth) return;
    var tint = makeCanvas(size, size);
    var t = tint.getContext("2d");
    t.drawImage(MARK, 0, 0, size, size);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = color;
    t.fillRect(0, 0, size, size);
    g.drawImage(tint, (s - size) / 2, (s - size) / 2);
  }

  var GOLD_TEXT = "LORO • FIXED RATE • FIXED TERM • ";

  function goldFaceMaterial() {
    var S = TEX;
    function design(g, s, field, raised) {
      g.fillStyle = field;
      g.fillRect(0, 0, s, s);
      rimAndRing(g, s, raised);
      ringText(g, s, GOLD_TEXT, 0.37, 0.056, raised);
      loroMark(g, s, raised);
    }
    var height = softCanvas(S, S, S / 512 * 1.6, function (g, s) { design(g, s, "#000", "#fff"); });
    var colour = speckle(softCanvas(S, S, S / 512, function (g, s) { design(g, s, "#c98f2f", "#f7cf6c"); }), 10);
    var rough = speckle(softCanvas(S, S, S / 512, function (g, s) {
      design(g, s, gray(128), gray(46));
      // wear: fine swirls on the field
      g.globalAlpha = 0.2;
      for (var i = 0; i < 260; i++) {
        g.strokeStyle = gray(70 + Math.random() * 110);
        g.lineWidth = 0.6 + Math.random();
        g.beginPath();
        g.arc(s / 2, s / 2, s * (0.05 + Math.random() * 0.4), Math.random() * 6, Math.random() * 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    }), 18);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: toTexture(colour, true),
      metalness: 1,
      roughness: 1,
      roughnessMap: toTexture(rough, false),
      normalMap: normalFromHeight(height, 5),
      normalScale: new THREE.Vector2(1, 1),
      envMapIntensity: 1.2
    });
  }

  function usdgFaceMaterial() {
    var S = TEX;
    function design(g, s, field, raised, dollar) {
      g.fillStyle = field;
      g.fillRect(0, 0, s, s);
      rimAndRing(g, s, raised);
      ringText(g, s, "USDG • STABLECOIN • USDG • STABLECOIN • ", 0.37, 0.05, raised);
      g.fillStyle = dollar;
      g.font = "700 " + Math.round(s * 0.42) + "px Geist, Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("$", s / 2, s / 2 + s * 0.02);
    }
    var height = softCanvas(S, S, S / 512 * 1.8, function (g, s) { design(g, s, "#000", "#fff", "#fff"); });
    var colour = softCanvas(S, S, S / 512 * 0.8, function (g, s) {
      var grad = g.createRadialGradient(s * 0.4, s * 0.35, s * 0.05, s / 2, s / 2, s * 0.5);
      grad.addColorStop(0, "#3d86ff");
      grad.addColorStop(1, "#1446b8");
      design(g, s, "#1d5bd8", "#dfe6ee", "#ffffff");
      g.globalCompositeOperation = "multiply";
      g.fillStyle = grad;
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";
      design(g, s, "rgba(0,0,0,0)", "#dfe6ee", "#ffffff");
    });
    var metal = softCanvas(S, S, 0, function (g, s) { design(g, s, "#000", "#fff", "#000"); });
    var rough = speckle(softCanvas(S, S, 0, function (g, s) { design(g, s, gray(55), gray(70), gray(40)); }), 14);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: toTexture(colour, true),
      metalnessMap: toTexture(metal, false),
      metalness: 1,
      roughness: 1,
      roughnessMap: toTexture(rough, false),
      normalMap: normalFromHeight(height, 4),
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.1
    });
  }

  function reededNormal(count) {
    var c = makeCanvas(1024, 16);
    var g = c.getContext("2d");
    for (var x = 0; x < 1024; x++) {
      g.fillStyle = gray(128 + 127 * Math.sin((x / 1024) * count * Math.PI * 2));
      g.fillRect(x, 0, 1, 16);
    }
    return normalFromHeight(c, 3.2);
  }

  /* ============================================================
     GEOMETRY HELPERS
     ============================================================ */
  // Coin body with a rounded edge; axis along z. Faces are separate.
  function coinEdge(R, T, bevel) {
    var pts = [];
    var i, a;
    for (i = 0; i <= 8; i++) {
      a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(R - bevel + Math.cos(a) * bevel, -T / 2 + bevel + Math.sin(a) * bevel));
    }
    for (i = 0; i <= 8; i++) {
      a = (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(R - bevel + Math.cos(a) * bevel, T / 2 - bevel + Math.sin(a) * bevel));
    }
    var g = new THREE.LatheGeometry(pts, 160);
    g.rotateX(Math.PI / 2);
    return g;
  }
  function coin(R, T, faceMat, edgeMat) {
    var group = new THREE.Group();
    group.add(new THREE.Mesh(coinEdge(R, T, 0.045), edgeMat));
    var faceGeo = new THREE.CircleGeometry(R - 0.044, 128);
    var front = new THREE.Mesh(faceGeo, faceMat);
    front.position.z = T / 2;
    var back = new THREE.Mesh(faceGeo, faceMat);
    back.position.z = -T / 2;
    back.rotation.y = Math.PI;
    group.add(front);
    group.add(back);
    return group;
  }
  function roundedRectShape(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function slab(w, h, depth, r, bevel) {
    var g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bevel, h - 2 * bevel, Math.max(0.02, r - bevel)), {
      depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 10, curveSegments: 24
    });
    g.center();
    return g;
  }

  /* ============================================================
     MATERIALS
     ============================================================ */
  var M = {};
  function buildMaterials() {
    var scratches = scratchRoughness(40, 220);
    var brushed = brushedRoughness(92);
    var plasticGrain = scratchRoughness(90, 60);

    M.goldFace = goldFaceMaterial();
    M.goldEdge = new THREE.MeshPhysicalMaterial({
      color: 0xf2c15b, metalness: 1, roughness: 0.6, roughnessMap: scratches,
      normalMap: reededNormal(150), normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.2
    });
    M.usdgFace = usdgFaceMaterial();
    M.silverEdge = new THREE.MeshPhysicalMaterial({
      color: 0xdfe5ec, metalness: 1, roughness: 0.55, roughnessMap: scratches,
      normalMap: reededNormal(120), envMapIntensity: 1.2
    });
    M.chrome = new THREE.MeshPhysicalMaterial({ color: 0xe8ecf1, metalness: 1, roughness: 0.3, roughnessMap: scratches, envMapIntensity: 1.2 });
    M.anodized = new THREE.MeshPhysicalMaterial({
      color: 0xff6a12, metalness: 0.85, roughness: 0.9, roughnessMap: brushed,
      clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.1
    });
    M.keyhole = new THREE.MeshPhysicalMaterial({ color: 0x0c0f14, metalness: 0.3, roughness: 0.55 });
    M.crystal = new THREE.MeshPhysicalMaterial({
      color: 0x5b3cf0, metalness: 0.15, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.01,
      ior: 2.4, specularIntensity: 1, iridescence: 0.55, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 650],
      flatShading: true, envMapIntensity: 1.6
    });
    M.crystalCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.06, 0.75), transparent: true, opacity: 0.35, depthWrite: false });
    M.mint = new THREE.MeshPhysicalMaterial({
      color: 0x19c08c, metalness: 0, roughness: 0.55, roughnessMap: plasticGrain,
      clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: new THREE.Color(0xbfffe8), envMapIntensity: 1
    });
    M.ceramic = new THREE.MeshPhysicalMaterial({ color: 0xfbfbfc, metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 });
    M.orangeGloss = new THREE.MeshPhysicalMaterial({ color: 0xff6d14, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1 });
    M.whiteGloss = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f5, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.95 });
    M.pearl = new THREE.MeshPhysicalMaterial({
      color: 0xf3ede4, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
      sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffd9ea),
      iridescence: 0.9, iridescenceIOR: 1.45, iridescenceThicknessRange: [250, 600], envMapIntensity: 1.1
    });
  }

  /* ============================================================
     OBJECTS
     ============================================================ */
  function makeGoldCoin() { return coin(1, 0.19, M.goldFace, M.goldEdge); }
  function makeUsdgCoin() { return coin(0.9, 0.17, M.usdgFace, M.silverEdge); }

  function makeCrystal() {
    var g = new THREE.Group();
    var profile = [
      new THREE.Vector2(0, -1.1),
      new THREE.Vector2(0.82, 0.02),
      new THREE.Vector2(0.82, 0.12),
      new THREE.Vector2(0.52, 0.72),
      new THREE.Vector2(0, 1.42)
    ];
    var geo = new THREE.LatheGeometry(profile, 8).toNonIndexed();
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.crystal));
    var core = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), M.crystalCore);
    core.scale.setScalar(0.62);
    g.add(core);
    return g;
  }

  function makeLock() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(slab(1.6, 1.3, 0.7, 0.28, 0.12), M.anodized);
    body.position.y = -0.28;
    g.add(body);

    var pts = [];
    var r = 0.47, i;
    for (i = 0; i <= 10; i++) pts.push(new THREE.Vector3(-r, 0.12 + i * 0.03, 0));
    for (i = 1; i <= 40; i++) {
      var a = Math.PI - (i / 40) * Math.PI;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.42 + Math.sin(a) * r, 0));
    }
    for (i = 1; i <= 10; i++) pts.push(new THREE.Vector3(r, 0.42 - i * 0.03, 0));
    var curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.115, 32, false), M.chrome));
    [-r, r].forEach(function (x) {
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), M.chrome);
      cap.position.set(x, 0.12, 0);
      g.add(cap);
    });

    var hole = new THREE.Shape();
    hole.absarc(0, 0.05, 0.11, 0, Math.PI * 2, false);
    var slot = new THREE.Shape();
    slot.moveTo(-0.05, 0.02);
    slot.lineTo(0.05, 0.02);
    slot.lineTo(0.075, -0.24);
    slot.lineTo(-0.075, -0.24);
    slot.closePath();
    [hole, slot].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 32 }), M.keyhole);
      m.position.set(0, -0.3, 0.345);
      g.add(m);
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 16, 64), M.chrome);
    ring.position.set(0, -0.25, 0.35);
    g.add(ring);
    return g;
  }

  function makeStockCard() {
    var g = new THREE.Group();
    g.add(new THREE.Mesh(slab(1.9, 1.3, 0.3, 0.26, 0.09), M.mint));
    var line = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.62, -0.32, 0.16),
      new THREE.Vector3(-0.3, -0.02, 0.16),
      new THREE.Vector3(-0.02, -0.16, 0.16),
      new THREE.Vector3(0.28, 0.12, 0.16),
      new THREE.Vector3(0.6, 0.34, 0.16)
    ], false, "catmullrom", 0.1);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(line, 96, 0.05, 16, false), M.ceramic));
    var dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), M.ceramic);
    dot.position.set(0.6, 0.34, 0.16);
    g.add(dot);
    var chip = new THREE.Mesh(slab(0.34, 0.26, 0.05, 0.05, 0.015), M.goldEdge);
    chip.position.set(-0.55, 0.36, 0.15);
    g.add(chip);
    return g;
  }

  function makeRing() {
    var g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.24, 64, 180), M.chrome));
    return g;
  }

  function makeCapsule() {
    var g = new THREE.Group();
    var r = 0.3, half = 0.3;
    var pts = [];
    for (var i = 0; i <= 16; i++) {
      var a = (i / 16) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, half + Math.sin(a) * r));
    }
    pts.unshift(new THREE.Vector2(r, 0));
    var top = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), M.orangeGloss);
    var bottom = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), M.whiteGloss);
    bottom.rotation.x = Math.PI;
    g.add(top);
    g.add(bottom);
    return g;
  }

  function makePearl() {
    var g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 96, 64), M.pearl));
    return g;
  }

  /* ============================================================
     SCENE
     ============================================================ */
  function start() {
    var scene = new THREE.Scene();
    scene.environment = buildEnvironment();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 17);

    var sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(-6, 9, 8);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xc6dcff, 0.9);
    fill.position.set(8, -3, 6);
    scene.add(fill);

    buildMaterials();

    // nx/ny place each object in screen space (-1..1); mx/my on phones,
    // where the copy fills the middle and objects keep to the edges.
    var DEFS = [
      { make: makeGoldCoin,  nx: -0.74, ny:  0.44, mx: -0.7,  my:  0.8,  s: 1.35, lift: 1.3, spin: [0.15, 0.85, 0.05], tilt: [0.3, 0.6, 0.1], face: true },
      { make: makeCrystal,   nx:  0.75, ny:  0.5,  mx:  0.72, my:  0.78, s: 1.05, lift: 1.7, spin: [0.05, 0.7, 0.04], tilt: [0.25, 0, 0.18] },
      { make: makeLock,      nx: -0.63, ny: -0.38, mx: -0.62, my: -0.5,  s: 1.15, lift: 0.9, spin: [0.08, 0.4, 0.03], tilt: [0.1, 0.5, -0.12] },
      { make: makeStockCard, nx:  0.64, ny: -0.42, mx:  0.64, my: -0.52, s: 1.05, lift: 1.1, spin: [0.12, 0.35, 0.08], tilt: [-0.3, -0.45, 0.18], face: true },
      { make: makeUsdgCoin,  nx: -0.92, ny:  0.02, s: 0.85, lift: 1.9, spin: [0.2, 0.75, 0.1], tilt: [0.4, -0.5, 0.2], wide: true, face: true },
      { make: makeRing,      nx:  0.93, ny:  0.06, s: 0.85, lift: 1.4, spin: [0.45, 0.3, 0.1], tilt: [0.9, 0.3, 0], wide: true },
      { make: makeCapsule,   nx:  0.36, ny: -0.86, s: 0.8,  lift: 2.2, spin: [0.25, 0.15, 0.55], tilt: [0.3, 0, 1.1], wide: true },
      { make: makePearl,     nx: -0.38, ny: -0.84, s: 0.55, lift: 2.4, spin: [0.1, 0.2, 0], tilt: [0, 0, 0], wide: true }
    ];

    var items = [];
    DEFS.forEach(function (d, k) {
      if (small && d.wide) return;
      var obj = d.make();
      var holder = new THREE.Group();
      holder.add(obj);
      scene.add(holder);
      items.push({ d: d, holder: holder, obj: obj, phase: Math.random() * Math.PI * 2, delay: k * 0.09 });
    });

    var halfH = 1, halfW = 1;
    function resize() {
      var w = hero.clientWidth, h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      halfW = halfH * camera.aspect;
    }
    resize();
    window.addEventListener("resize", resize);

    var visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);
    }

    function easeOutBack(x) {
      var c1 = 1.4, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    var readyAt = performance.now() + 150;
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) return;

      var t = now / 1000;
      var since = (now - readyAt) / 1000;
      var scroll = clamp(window.scrollY / Math.max(1, hero.offsetHeight), 0, 1.4);
      var sizeFactor = clamp(halfW / 7.5, 0.62, 1.15);

      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      items.forEach(function (it) {
        var d = it.d;
        var e = reduced ? 1 : clamp((since - it.delay) / 1.5, 0, 1);
        var enter = e >= 1 ? 1 : easeOutBack(e);
        var nx = small && d.mx != null ? d.mx : d.nx;
        var ny = small && d.my != null ? d.my : d.ny;
        var depth = d.s * 0.35;

        var x = nx * halfW * 0.9 * (1 + scroll * 0.35) + mouse.x * depth;
        var y = ny * halfH * 0.84
          - (1 - enter) * halfH * 1.7
          + scroll * halfH * d.lift
          + (reduced ? 0 : Math.sin(t * 0.8 + it.phase) * 0.13)
          - mouse.y * depth;

        it.holder.position.set(x, y, 0);
        it.holder.scale.setScalar(Math.max(0.001, d.s * sizeFactor * (small ? 0.55 : 1) * (0.3 + 0.7 * enter) * (1 - scroll * 0.25)));

        var sp = reduced ? 0 : t * 0.32;
        // Flat objects sway so their faces stay toward the camera;
        // the rest turn all the way round.
        var turn = d.face ? Math.sin(sp * 1.6 + it.phase) * 0.75 : sp * d.spin[1] * 2;
        it.obj.rotation.set(
          d.tilt[0] + Math.sin(sp * 1.3 + it.phase) * d.spin[0] + scroll * 2.2 + mouse.y * 0.35,
          d.tilt[1] + turn + scroll * 3 + mouse.x * 0.5,
          d.tilt[2] + Math.sin(sp + it.phase) * d.spin[2]
        );
      });

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  // Coin lettering uses the page font and the coin face uses the brand mark,
  // so wait briefly for both
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([
    Promise.all([fontsReady, markReady]),
    new Promise(function (r) { setTimeout(r, 1500); })
  ]).then(start);
})();
