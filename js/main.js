(function () {
  var doc = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var vh = function () { return window.innerHeight || doc.clientHeight; };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var $ = function (id) { return document.getElementById(id); };
  var maxScroll = function () { return Math.max(0, doc.scrollHeight - vh()); };

  var colors = { fg: "#f4f4f2", accent: "#ffc21a" };
  function readColors() {
    try { var cs = getComputedStyle(doc); colors.fg = cs.getPropertyValue("--fg").trim() || colors.fg; colors.accent = cs.getPropertyValue("--accent").trim() || colors.accent; } catch (e) {}
  }
  readColors();

  /* theme */
  var segBtns = Array.prototype.slice.call(document.querySelectorAll(".seg button"));
  function applyTheme(mode) {
    if (mode === "light") doc.setAttribute("data-theme", "light"); else doc.removeAttribute("data-theme");
    segBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-set") === (mode === "light" ? "light" : "dark") ? "true" : "false"); });
    readColors(); drawStatic();
  }
  var savedMode = "dark";
  try { if (localStorage.getItem("jp-theme") === "light") savedMode = "light"; } catch (e) {}
  segBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.getAttribute("data-set");
      try { localStorage.setItem("jp-theme", m); } catch (e) {}
      applyTheme(m); if (window.__sfxChirp) window.__sfxChirp();
    });
  });

  /* reuse certificate images in the wall so each file is embedded once */
  Array.prototype.forEach.call(document.querySelectorAll("img[data-use]"), function (im) {
    var src = $("img-" + im.getAttribute("data-use"));
    if (src) im.src = src.src;
  });

  /* hero headline: words rise */
  var wi = 0;
  Array.prototype.forEach.call(document.querySelectorAll("#headline .ln"), function (ln) {
    var ws = ln.textContent.split(" "); ln.textContent = ""; ln.setAttribute("aria-hidden", "true");
    ws.forEach(function (w, i) {
      var o = document.createElement("span"); o.className = "hw";
      var inn = document.createElement("span"); inn.className = "hwi"; inn.style.setProperty("--i", wi++); inn.textContent = w;
      o.appendChild(inn); ln.appendChild(o);
      if (i < ws.length - 1) ln.appendChild(document.createTextNode(" "));
    });
  });

  /* scrubbed intro words */
  var scrub = $("scrub"), words = [];
  (function () {
    function walk(node, hl) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            var w = document.createElement("span"); w.className = "w" + (hl ? " hl" : ""); w.textContent = p;
            frag.appendChild(w); words.push(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) { walk(n, hl || n.classList.contains("hl")); }
      });
    }
    walk(scrub, false);
  })();

  /* closing words */
  var cta = $("cta");
  (function () {
    var parts = cta.textContent.split(" "); cta.textContent = "";
    parts.forEach(function (p, i) {
      var w = document.createElement("span"); w.className = "w"; w.textContent = p; cta.appendChild(w);
      if (i < parts.length - 1) cta.appendChild(document.createTextNode(" "));
    });
  })();

  /* reveal + counters */
  var reveals = document.querySelectorAll(".reveal, #frame");
  var nums = document.querySelectorAll(".num");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
    Array.prototype.forEach.call(nums, function (n) { n.textContent = "0"; });
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, to = parseInt(el.getAttribute("data-to"), 10), t0 = null;
        cio.unobserve(el);
        (function step(ts) {
          if (t0 === null) t0 = ts;
          var p = clamp((ts - t0) / 1300, 0, 1), e = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(to * e));
          if (p < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(nums, function (n) { cio.observe(n); });
  } else {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  }

  var lastY = window.scrollY, vel = 0;

  /* canvases */
  var cv = [
    { el: $("heroCanvas"), kind: "hero", vis: true, stat: false },
    { el: $("gridCanvas"), kind: "grid", vis:false, sp:14, gx:-1, gy:-1, px:0, py:0, zone:-1, pw:0 },
    { el: $("eyeCanvas"), kind: "eye", vis:false },
    { el: $("mountCanvas"), kind: "mount", vis: false, sp: 9 }
  ];
  var mouse = { x: -9999, y: -9999 };
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  cv.forEach(function (c) { c.ctx = c.el.getContext("2d"); });
  function sizeCanvas(c) {
    var r = c.el.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    c.w = Math.max(1, r.width); c.h = Math.max(1, r.height);
    c.el.width = Math.round(c.w * dpr); c.el.height = Math.round(c.h * dpr);
    c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (c.kind === "hero") c.sp = c.w < 700 ? 9 : 7;
  }

  /* hero: live 4x4 Bayer ordered-dithered pixel blobs & cursor trail */
  var himg = $("heroSharp");
  var bayer4 = [
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
  ];
  var hd = { cell: 5, trail: [], pmx: -999, pmy: -999, lastAdd: 0 };
  function drawHeroPix(c, t) {
    var ctx = c.ctx, w = c.w, h = c.h;
    var light = doc.getAttribute("data-theme") === "light";
    var cell = w < 700 ? 6 : 5;
    var box = cell - 1;
    var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    ctx.clearRect(0, 0, w, h);

    /* record cursor trail points inside hero */
    var rect = c.el.getBoundingClientRect();
    var mx = mouse.x - rect.left, my = mouse.y - rect.top;
    var inHero = fine && !reduced && mx >= 0 && mx <= w && my >= 0 && my <= h;
    if (inHero) {
      var dist = hd.pmx < -500 ? 999 : Math.hypot(mx - hd.pmx, my - hd.pmy);
      if (dist > 14 || t - hd.lastAdd > 0.06) {
        hd.trail.push({ x: mx, y: my, t0: t, r: 105 + Math.min(45, dist * 0.6) });
        if (hd.trail.length > 26) hd.trail.shift();
        hd.pmx = mx; hd.pmy = my; hd.lastAdd = t;
      }
    } else {
      hd.pmx = -999; hd.pmy = -999;
    }

    /* prune expired trail points */
    var trailLife = 1.45;
    while (hd.trail.length && (t - hd.trail[0].t0) > trailLife) hd.trail.shift();

    /* live drifting organic blob centers (normalized coordinates) */
    var tt = reduced ? 2.4 : t;
    var minDim = Math.min(w, h);
    var blobs = [
      { x: w * (0.28 + 0.14 * Math.sin(tt * 0.34 + 0.4)), y: h * (0.34 + 0.15 * Math.cos(tt * 0.27 + 1.1)), rx: minDim * 0.25, ry: minDim * 0.34, ang: 0.35 + Math.sin(tt * 0.2) * 0.25 },
      { x: w * (0.74 + 0.13 * Math.cos(tt * 0.31 + 2.2)), y: h * (0.56 + 0.16 * Math.sin(tt * 0.25 + 0.6)), rx: minDim * 0.21, ry: minDim * 0.30, ang: -0.45 + Math.cos(tt * 0.18) * 0.3 },
      { x: w * (0.48 + 0.18 * Math.sin(tt * 0.22 + 3.7)), y: h * (0.64 + 0.12 * Math.cos(tt * 0.29 + 2.5)), rx: minDim * 0.18, ry: minDim * 0.22, ang: 0.7 + Math.sin(tt * 0.24) * 0.2 },
      { x: w * (0.22 + 0.11 * Math.cos(tt * 0.26 + 4.9)), y: h * (0.58 + 0.13 * Math.sin(tt * 0.33 + 1.8)), rx: minDim * 0.15, ry: minDim * 0.20, ang: -0.25 + Math.sin(tt * 0.19) * 0.3 }
    ];
    for (var b = 0; b < blobs.length; b++) {
      blobs[b].ca = Math.cos(blobs[b].ang);
      blobs[b].sa = Math.sin(blobs[b].ang);
      blobs[b].irx2 = 1 / (blobs[b].rx * blobs[b].rx);
      blobs[b].iry2 = 1 / (blobs[b].ry * blobs[b].ry);
    }

    var trailLen = hd.trail.length;
    var tData = [];
    for (var k = 0; k < trailLen; k++) {
      var tp = hd.trail[k];
      var age = 1 - (t - tp.t0) / trailLife;
      if (age <= 0) continue;
      var tr = tp.r * (0.75 + 0.45 * (1 - age));
      tData.push(tp.x, tp.y, 1 / (tr * tr), age * age);
    }

    var path = new Path2D();
    var accentPath = new Path2D();
    var xmasOn = doc.getAttribute("data-xmas") !== "off";
    var y, x, py, px, by;

    for (y = 0; y < rows; y++) {
      py = y * cell;
      by = (y & 3) << 2;
      for (x = 0; x < cols; x++) {
        px = x * cell;
        var field = 0;

        /* organic drifting blobs */
        for (b = 0; b < blobs.length; b++) {
          var bl = blobs[b];
          var ddx = px - bl.x, ddy = py - bl.y;
          var lx = ddx * bl.ca - ddy * bl.sa;
          var ly = ddx * bl.sa + ddy * bl.ca;
          var d2 = lx * lx * bl.irx2 + ly * ly * bl.iry2;
          if (d2 < 2.2) {
            field += Math.exp(-d2 * 1.45);
          }
        }

        /* organic edge warp so shapes feel fluid & live */
        if (field > 0.08) {
          var warp = Math.sin(px * 0.013 + tt * 0.9) * Math.cos(py * 0.012 - tt * 0.75) * 0.18
                   + Math.sin((px - py) * 0.008 + tt * 0.55) * 0.12;
          field += warp;
        }

        /* interactive cursor fluid trail */
        for (var j = 0; j < tData.length; j += 4) {
          var tdx = px - tData[j], tdy = py - tData[j + 1];
          var td2 = (tdx * tdx + tdy * tdy) * tData[j + 2];
          if (td2 < 1.8) {
            field += Math.exp(-td2 * 1.7) * tData[j + 3] * 1.05;
          }
        }

        if (field <= 0.18) continue;

        /* map field to [0..1] density and threshold against 4x4 Bayer matrix */
        var val = clamp((field - 0.18) / 0.92, 0, 1);
        var thresh = (bayer4[by | (x & 3)] + 0.5) / 16;
        if (val > thresh) {
          /* occasional warm gold sparkle pixel on dense crests in Christmas mode */
          if (xmasOn && val > 0.88 && ((x * 31 + y * 17) & 63) === 0) {
            accentPath.rect(px, py, box, box);
          } else {
            path.rect(px, py, box, box);
          }
        }
      }
    }

    ctx.fillStyle = light ? "rgba(17, 17, 17, 0.34)" : "rgba(218, 226, 232, 0.42)";
    ctx.fill(path);
    if (xmasOn) {
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = light ? 0.55 : 0.7;
      ctx.fill(accentPath);
      ctx.globalAlpha = 1;
    }
  }
  if (himg) { himg.addEventListener("load", function () { drawStatic(); }); }
  function heroReveal() {}

  /* dot grid: swirl ripple + label pill */
  var dgPill = $("dgPill");
  var dgWords = [
    ["web development", "UX design", "documentation", "research"],
    ["student leadership", "event planning", "AWS community", "cybersecurity"],
    ["peace advocacy", "red cross youth", "community projects", "practical tools"]
  ];
  function drawGrid(c, t, mx, my) {
    var ctx = c.ctx, w = c.w, h = c.h, sp = c.sp, x, y, tx, ty;
    if (mx > 0 && mx < w && my > 0 && my < h) { tx = mx; ty = my; } else { tx = w * (0.5 + 0.3 * Math.sin(t * 0.4)); ty = h * (0.5 + 0.24 * Math.sin(t * 0.53 + 1)); }
    if (c.gx < 0) { c.gx = tx; c.gy = ty; c.px = tx; c.py = ty; }
    c.gx += (tx - c.gx) * 0.1; c.gy += (ty - c.gy) * 0.1;
    c.px += (tx - c.px) * 0.22; c.py += (ty - c.py) * 0.22;
    var base = sp * 0.4, R = 210, i0 = Math.floor(clamp(c.gx / w, 0, 0.999) * 4), j0 = Math.floor(clamp(c.gy / h, 0, 0.999) * 3);
    ctx.fillStyle = colors.accent; ctx.beginPath();
    for (y = sp / 2; y < h; y += sp) {
      for (x = sp / 2; x < w; x += sp) {
        var dx = x - c.gx, dy = y - c.gy, dd = Math.sqrt(dx * dx + dy * dy), r = base;
        if (dd < R) {
          var fall = 1 - dd / R; fall = fall * fall * (3 - 2 * fall);
          r = base * (1 + 0.95 * fall * Math.sin(dd * 0.065 - t * 2.2 + Math.atan2(dy, dx) * 2));
          if (r < base * 0.22) r = base * 0.22;
        }
        if (x < sp && y < sp) continue;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832);
      }
    }
    ctx.fill();
    ctx.fillStyle = colors.fg; ctx.beginPath(); ctx.arc(sp / 2, sp / 2, base, 0, 6.2832); ctx.fill();
    if (dgPill) {
      var z = j0 * 4 + i0;
      if (z !== c.zone) {
        c.zone = z; dgPill.textContent = dgWords[j0][i0]; c.pw = dgPill.offsetWidth;
        if (c.zoneSet) sfx.tick(); c.zoneSet = true;
      }
      var px = clamp(c.px + 20, 0, Math.max(0, w - (c.pw || 120))), py = clamp(c.py - 36, 0, h - 26);
      dgPill.style.transform = "translate3d(" + px.toFixed(1) + "px," + py.toFixed(1) + "px,0)";
    }
  }

  /* skills eye */
  var eyeList = $("skillList"), eyeLook = null, eyeG = { x: 0, y: 0 }, eyeSeed = [], eyeU = null, eyeBuf = [];
  (function () { var a = 7919; for (var i = 0; i < 80; i++) { a = (a * 16807) % 2147483647; eyeSeed.push(a / 2147483647); } })();
  function hs(n) { var v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  function glyph(P, F, type, x, y, s) {
    if (type === 0) { P.moveTo(x - s, y); P.lineTo(x + s, y); P.moveTo(x, y - s); P.lineTo(x, y + s); }
    else if (type === 1) { var d = s * 0.78; P.moveTo(x - d, y - d); P.lineTo(x + d, y + d); P.moveTo(x + d, y - d); P.lineTo(x - d, y + d); }
    else if (type === 2) { var e = s * 0.78; P.moveTo(x - s, y); P.lineTo(x + s, y); P.moveTo(x, y - s); P.lineTo(x, y + s); P.moveTo(x - e, y - e); P.lineTo(x + e, y + e); P.moveTo(x + e, y - e); P.lineTo(x - e, y + e); }
    else if (type === 3) { P.moveTo(x + s * 0.8, y); P.arc(x, y, s * 0.8, 0, 6.2832); }
    else { F.moveTo(x + s * 0.42, y); F.arc(x, y, s * 0.42, 0, 6.2832); }
  }
  var gl = { key: "", pts: null, n: 0, ax: 0, ay: 0 };
  function drawEye(c, t) {
    var ctx = c.ctx, w = c.w, h = c.h, small = w < 860, i, j;
    ctx.clearRect(0, 0, w, h);
    var rect = c.el.getBoundingClientRect(), cx = w / 2, cy = h / 2;
    var s = small ? 3.1 : Math.max(3.6, Math.min(5.4, w / 340));
    var R = Math.min(w * (small ? 0.27 : 0.2), h * 0.34);
    var key = Math.round(R) + "|" + s.toFixed(1);
    if (gl.key !== key) {
      var n = Math.min(1500, Math.round(4 * Math.PI * R * R / Math.pow(s * 5.6, 2))), pts = new Float32Array(n * 4), ga = Math.PI * (3 - Math.sqrt(5));
      for (i = 0; i < n; i++) {
        var y0 = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y0 * y0), th = ga * i, x0 = Math.cos(th) * rr, z0 = Math.sin(th) * rr;
        var v = Math.sin(3.2 * x0 + 1.3) + Math.sin(4.1 * y0 - 0.7) + Math.sin(3.6 * z0 + 2.1) + Math.sin(5 * x0 * z0 + 2 * y0);
        pts[i * 4] = x0; pts[i * 4 + 1] = y0; pts[i * 4 + 2] = z0; pts[i * 4 + 3] = v > 0.55 ? 1 : 0;
      }
      gl.pts = pts; gl.n = n; gl.key = key;
    }
    var tx, ty;
    if (eyeLook) { tx = clamp((eyeLook.x - cx) / (w / 2), -1, 1); ty = clamp((eyeLook.y - cy) / (h / 2), -1, 1); }
    else if (mouse.x > -999 && fine) { tx = clamp((mouse.x - rect.left - cx) / (w / 2), -1, 1); ty = clamp((mouse.y - rect.top - cy) / (h / 2), -1, 1); }
    else { tx = Math.sin(t * 0.4) * 0.5; ty = Math.sin(t * 0.55) * 0.4; }
    gl.ax += (tx - gl.ax) * 0.05; gl.ay += (ty - gl.ay) * 0.05;
    var yaw = t * 0.2 + gl.ax * 0.9, pitch = 0.3 + gl.ay * 0.4, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var items = eyeBuf; items.length = 0, pts = gl.pts;
    for (i = 0; i < gl.n; i++) {
      var X = pts[i * 4], Y = pts[i * 4 + 1], Z = pts[i * 4 + 2], land = pts[i * 4 + 3];
      var x1 = X * cyw + Z * syw, z1 = -X * syw + Z * cyw, y2 = Y * cp - z1 * sp, z2 = Y * sp + z1 * cp;
      var hh = hs(i * 1.7 + 3);
      if (z2 > 0) {
        var ty2 = land ? (hh < 0.5 ? 0 : hh < 0.82 ? 1 : 2) : (hh < 0.12 ? 3 : 4);
        items.push(ty2, cx + x1 * R, cy - y2 * R, s * (land ? 0.7 + 0.35 * z2 : 0.5 + 0.35 * z2), z2 > 0.55 ? 0 : 1);
      } else if (i % 2 === 0) items.push(4, cx + x1 * R, cy - y2 * R, s * 0.5, 2);
    }
    /* limb ring */
    var nl = Math.round(R * 6.283 / (s * 6.5));
    for (i = 0; i < nl; i++) { var a = i / nl * 6.2832 + t * 0.05; items.push(i % 3 === 0 ? 0 : 4, cx + Math.cos(a) * R * 1.07, cy + Math.sin(a) * R * 1.07, s * 0.6, 1); }
    /* orbit rings */
    var rings = [[1.6, 0.3, -0.28, 0.1, 6.2], [2.05, 0.22, 0.2, -0.07, 8.5]];
    rings.forEach(function (rg, ri) {
      var rho = rg[0] * (small && ri ? 0.9 : 1), step = s * rg[4], cnt = Math.max(24, Math.round(6.283 * rho * R / step));
      var ct = Math.cos(rg[1] + gl.ay * 0.12), st = Math.sin(rg[1] + gl.ay * 0.12), cr = Math.cos(rg[2]), sr = Math.sin(rg[2]);
      for (j = 0; j < cnt; j++) {
        var th2 = j / cnt * 6.2832 + t * rg[3], px = rho * Math.cos(th2), pz = rho * Math.sin(th2), py = pz * st, dz = pz * ct;
        var qx = px * cr - py * sr, qy = px * sr + py * cr, X2 = cx + qx * R, Y2 = cy + qy * R;
        if (dz < 0 && Math.hypot(X2 - cx, Y2 - cy) < R * 1.02) continue;
        var pt = ri ? (j % 2 ? 4 : 0) : [0, 1, 0, 2][j % 4];
        items.push(pt, X2, Y2, s * (ri ? 0.6 : 0.8) * (0.85 + 0.15 * (dz > 0 ? 1 : 0)), ri ? 2 : (dz > 0 ? 0 : 1));
      }
    });
    /* satellite with a short trail */
    (function () {
      var rho = 1.6, ct = Math.cos(0.3 + gl.ay * 0.12), st = Math.sin(0.3 + gl.ay * 0.12), cr = Math.cos(-0.28), sr = Math.sin(-0.28);
      for (var q = 0; q < 9; q++) {
        var th3 = t * 0.55 - q * 0.075, px = rho * Math.cos(th3), pz = rho * Math.sin(th3), py = pz * st;
        var qx = px * cr - py * sr, qy = px * sr + py * cr, X3 = cx + qx * R, Y3 = cy + qy * R;
        if (pz * ct < 0 && Math.hypot(X3 - cx, Y3 - cy) < R * 1.02) continue;
        items.push(q === 0 ? 2 : 4, X3, Y3, q === 0 ? s * 1.9 : s * (0.9 - q * 0.08), q === 0 ? 0 : (q < 4 ? 1 : 2));
      }
    })();
    /* scattered stars */
    var cnt2 = small ? 24 : 54;
    for (i = 0; i < cnt2; i++) {
      var sx = eyeSeed[(i * 3) % 80] * w, sy = eyeSeed[(i * 3 + 1) % 80] * h, st2 = Math.floor(eyeSeed[(i * 3 + 2) % 80] * 5);
      if (Math.hypot(sx - cx, (sy - cy) * 1.4) < R * 2.1) continue;
      items.push(st2, sx, sy, s * 0.6, 3);
    }
    ctx.strokeStyle = colors.fg; ctx.fillStyle = colors.fg; ctx.lineWidth = small ? 1.1 : 1.35; ctx.lineCap = "round";
    var al = [0.98, 0.7, 0.34, 0.28];
    for (var bk = 0; bk < 4; bk++) {
      var P = new Path2D(), F = new Path2D();
      for (i = 0; i < items.length; i += 5) if (items[i + 4] === bk) glyph(P, F, items[i], items[i + 1], items[i + 2], items[i + 3]);
      var tw = bk === 3 ? 0.55 + 0.45 * Math.sin(t * 1.4 + 1.7) : 1;
      ctx.globalAlpha = al[bk] * tw; ctx.stroke(P); ctx.fill(F);
    }
    if (!small) {
      var sp2 = [[w * 0.8, h * 0.22], [w * 0.07, h * 0.84]];
      ctx.beginPath();
      sp2.forEach(function (q2, n2) {
        var r0 = s * 7.5, stp = s * 1.9, yy, xx;
        for (yy = -r0; yy <= r0; yy += stp) for (xx = -r0; xx <= r0; xx += stp) {
          var dd = Math.sqrt(xx * xx + yy * yy); if (dd > r0) continue;
          var rad = s * 0.62 * (1 - dd / r0 * 0.85) * (0.8 + 0.2 * Math.sin(t * 1.2 + n2));
          ctx.moveTo(q2[0] + xx + rad, q2[1] + yy); ctx.arc(q2[0] + xx, q2[1] + yy, rad, 0, 6.2832);
        }
      });
      ctx.globalAlpha = 0.8; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (eyeList) {
    var eyeCv = $("eyeCanvas");
    function eyeTarget(li) {
      if (!li) { eyeLook = null; Array.prototype.forEach.call(eyeList.children, function (n) { n.classList.remove("look"); }); return; }
      var r = li.getBoundingClientRect(), cr = eyeCv.getBoundingClientRect();
      eyeLook = { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
      li.classList.add("look");
    }
    eyeList.addEventListener("pointerover", function (e) { var li = e.target.closest && e.target.closest("li"); if (li) { Array.prototype.forEach.call(eyeList.children, function (n) { n.classList.remove("look"); }); eyeTarget(li); } });
    eyeList.addEventListener("pointerout", function (e) { var li = e.target.closest && e.target.closest("li"); if (li && !(e.relatedTarget && li.contains(e.relatedTarget))) eyeTarget(null); });
  }

  /* sound effects (synthesised, no files) */
  var sfx = (function () {
    var S = { on: true, ctx: null, master: null, ok: false, lastT: 0, lastEl: null, scrollT: 0, step: 0 };
    try { if (localStorage.getItem("jp-sound") === "off") S.on = false; } catch (e) {}
    var scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
    function ctxGet() {
      if (!S.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try { S.ctx = new AC(); S.master = S.ctx.createGain(); S.master.gain.value = 0.55; S.master.connect(S.ctx.destination); } catch (e) { return null; }
      }
      if (S.ctx.state === "suspended") { try { S.ctx.resume(); } catch (e) {} }
      return S.ctx;
    }
    function tone(f, dur, type, vol, slide, when) {
      if (!S.on || !S.ok) return;
      var a = ctxGet(); if (!a) return;
      var t0 = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(S.master); o.start(t0); o.stop(t0 + dur + 0.03);
    }
    var hint = $("sndHint"), hintT = 0;
    function hideHint() { if (hint) hint.classList.remove("show"); clearInterval(hintT); }
    function unlock() { if (S.ok) return; S.ok = true; ctxGet(); hideHint(); }
    if (hint && fine) {
      hintT = setInterval(function () { if (doc.classList.contains("ready") && S.on && !S.ok) { hint.classList.add("show"); clearInterval(hintT); setTimeout(hideHint, 9000); } }, 400);
    }
    ["pointerdown", "keydown", "touchend"].forEach(function (n) { window.addEventListener(n, unlock, { capture: true, passive: true }); });
    window.addEventListener("scroll", function () { S.scrollT = performance.now(); }, { passive: true });
    var SEL = "a, button, .row, .tl-item, .cert, .skills li, .closing h2 .w, .frame, .tags li, .fcols li, .facts > div, .scrub .hl";
    document.addEventListener("pointerover", function (e) {
      if (!S.on || !S.ok || e.pointerType === "touch") return;
      var el = e.target.closest && e.target.closest(SEL); if (!el || el === S.lastEl) return;
      var now = performance.now(); S.lastEl = el;
      if (now - S.scrollT < 160 || now - S.lastT < 70) return;
      var card = el.classList && el.classList.contains("card");
      if (card && now - S.lastT < 220) return;
      S.lastT = now;
      S.step = (S.step + 1 + Math.floor(Math.random() * 2)) % scale.length;
      var f = scale[S.step];
      if (card) tone(f * 0.5, 0.13, "triangle", 0.05, f * 0.45);
      else if (el.closest(".skills")) { tone(f, 0.16, "sine", 0.07, f * 1.02); tone(f * 2, 0.1, "sine", 0.02, 0, 0.01); }
      else tone(f, 0.09, "sine", 0.06, f * 1.06);
    }, true);
    document.addEventListener("pointerout", function (e) { if (!e.relatedTarget) S.lastEl = null; }, true);
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("a, button, .row, .cert");
      if (!el || el.id === "sndBtn") return;
      tone(260, 0.09, "triangle", 0.09, 150); tone(980, 0.06, "sine", 0.03, 0, 0.005);
    }, true);
    var btn = $("sndBtn");
    function paint() { if (btn) { btn.setAttribute("aria-pressed", S.on ? "true" : "false"); btn.title = S.on ? "Sound on" : "Sound off"; } }
    paint();
    if (btn) btn.addEventListener("click", function () {
      S.on = !S.on; paint();
      try { localStorage.setItem("jp-sound", S.on ? "on" : "off"); } catch (e) {}
      S.ok = true; if (S.on) { tone(660, 0.1, "sine", 0.08); tone(990, 0.14, "sine", 0.08, 0, 0.09); }
    });
    return {
      tick: function () { tone(1250, 0.035, "sine", 0.035); },
      chirp: function () { tone(620, 0.08, "sine", 0.07); tone(930, 0.1, "sine", 0.07, 0, 0.07); }
    };
  })();
  window.__sfxChirp = sfx.chirp;
  function drawCanvas(c, t) {
    var ctx = c.ctx, w = c.w, h = c.h, sp = c.sp, x, y, nx, ny, v, r;
    ctx.clearRect(0, 0, w, h);
    var rect = c.el.getBoundingClientRect(), mx = mouse.x - rect.left, my = mouse.y - rect.top;
    if (c.kind === "hero") {
      drawHeroPix(c, t);
    } else if (c.kind === "grid") {
      drawGrid(c, t, mx, my);
    } else if (c.kind === "eye") {
      drawEye(c, t);
    } else {
      ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.92; ctx.beginPath();
      for (y = sp / 2; y < h; y += sp) {
        ny = y / h;
        for (x = sp / 2; x < w; x += sp) {
          nx = x / w;
          var surf = 0.42 + 0.2 * Math.sin(nx * 4.2 + 0.6) + 0.1 * Math.sin(nx * 9.1 + t * 0.15) + 0.05 * Math.sin(nx * 17 + t * 0.3);
          surf = clamp(surf, 0.1, 0.85);
          r = sp * 0.5 * smooth(0, 0.2, ny - surf);
          if (r > 0.45) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
        }
      }
      ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function drawStatic() { cv.forEach(function (c) { if (c.w) drawCanvas(c, 3); }); }
  function sizeAll() { cv.forEach(sizeCanvas); drawStatic(); }
  sizeAll();
  window.addEventListener("resize", function () { sizeAll(); onScroll(); });
  if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { cv.forEach(function (c) { if (c.el === en.target) c.vis = en.isIntersecting; }); });
    });
    cv.forEach(function (c) { vio.observe(c.el); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeAll);

  /* pixelated portrait */
    var pix = $("pix"), photoEl = $("photo"), pctx = pix.getContext("2d"), off = document.createElement("canvas"), octx = off.getContext("2d");
    var pimg = new Image();
    var pixCur = 14, pixTarget = 14, pixDrawn = -1;
    function drawPix(p) {
      if (!pimg.naturalWidth) return;
      var W = pix.width, H = pix.height, sw = Math.max(4, Math.round(W / p)), sh = Math.max(4, Math.round(H / p));
      off.width = sw; off.height = sh;
      octx.imageSmoothingEnabled = true; try { octx.imageSmoothingQuality = "high"; } catch (e) {}
      octx.drawImage(pimg, 0, 0, sw, sh);
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(off, 0, 0, sw, sh, 0, 0, W, H);
      pixDrawn = p;
    }
    function pixReady() { try { drawPix(pixCur); } catch (e) {} }
    pimg.addEventListener("load", pixReady);
    pimg.src = photoEl.getAttribute("src");
    if (pimg.complete && pimg.naturalWidth) pixReady();
    var frameEl = $("frame");
    frameEl.addEventListener("pointerenter", function () { pixTarget = 7; });
    frameEl.addEventListener("pointerleave", function () { pixTarget = 14; });

  /* gallery wall */
  var wallsec = $("wallsec"), stage = $("stage"), plane = $("plane"), hint = $("hint");
  (function () {
    var base = plane.querySelectorAll(".col");
    function mk(cls, srcCol, order, dur, dir) {
      var col = document.createElement("div"); col.className = "col " + cls; col.style.setProperty("--dur", dur);
      if (dir) col.style.setProperty("--dir", dir);
      order.forEach(function (i) {
        var k = srcCol.children[i].cloneNode(true);
        k.setAttribute("data-clone", "1"); k.setAttribute("aria-hidden", "true"); k.setAttribute("tabindex", "-1");
        Array.prototype.forEach.call(k.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
        col.appendChild(k);
      });
      plane.appendChild(col);
    }
    mk("c4", base[0], [2, 3, 0, 1], "102s", "reverse");
    mk("c5", base[1], [2, 0, 3, 1], "88s", "");
    mk("c6", base[2], [1, 3, 0, 2], "96s", "reverse");
  })();
  Array.prototype.forEach.call(plane.querySelectorAll(".col"), function (col) {
    Array.prototype.slice.call(col.children).forEach(function (k) {
      var cl = k.cloneNode(true); cl.setAttribute("aria-hidden", "true"); cl.setAttribute("tabindex", "-1");
      cl.setAttribute("data-clone", "1");
      Array.prototype.forEach.call(cl.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
      if (cl.id) cl.removeAttribute("id");
      col.appendChild(cl);
    });
  });
  var look = { tx: 0, ty: 0, x: 0, y: 0 };
  stage.addEventListener("pointermove", function (e) {
    var r = stage.getBoundingClientRect();
    if (e.pointerType === "mouse") {
      look.tx = -((e.clientX - r.left) / r.width - 0.5) * 90;
      look.ty = -((e.clientY - r.top) / r.height - 0.5) * 70;
    }
  });
  stage.addEventListener("pointerleave", function () { look.tx = 0; look.ty = 0; });
  var pauseBtn = $("pause");
  if (reduced) { stage.classList.add("paused"); pauseBtn.textContent = "Play motion"; plane.style.setProperty("--f", "0.6"); }
  pauseBtn.addEventListener("click", function () {
    var p = stage.classList.toggle("paused");
    pauseBtn.textContent = p ? "Play motion" : "Pause motion";
  });

  /* lightbox */
  var lb = $("lb"), lbImg = $("lbImg"), lbTitle = $("lbTitle"), lbSub = $("lbSub"), lbLink = $("lbLink"), lbCount = $("lbCount");
  var lbPrev = $("lbPrev"), lbNext = $("lbNext"), lbClose = $("lbClose");
  var set = [], idx = 0, lastFocus = null;
  function setFor(name) {
    var seen = {}, arr = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-lb="' + name + '"]:not([data-clone])'), function (b) {
      var id = b.getAttribute("data-id"); if (seen[id]) return; seen[id] = 1;
      var im = b.querySelector("img"); if (!im) return;
      arr.push({ id: id, i: parseInt(b.getAttribute("data-i"), 10) || 0, src: im.src, alt: im.alt, cap: b.getAttribute("data-cap") || "", sub: b.getAttribute("data-sub") || "", link: b.getAttribute("data-link") || "" });
    });
    arr.sort(function (a, b) { return a.i - b.i; });
    return arr;
  }
  function showLb() {
    var it = set[idx];
    lbImg.src = it.src; lbImg.alt = it.alt;
    lbTitle.textContent = it.cap; lbSub.innerHTML = it.sub;
    if (it.link) { lbLink.href = it.link; lbLink.hidden = false; } else { lbLink.hidden = true; }
    lbCount.textContent = (idx + 1) + " / " + set.length;
    lbPrev.hidden = lbNext.hidden = set.length < 2;
  }
  function openLb(name, id, trigger) {
    set = setFor(name); idx = 0;
    for (var i = 0; i < set.length; i++) if (set[i].id === id) idx = i;
    lastFocus = trigger; showLb(); lb.hidden = false; lbClose.focus();
  }
  function closeLb() { lb.hidden = true; lbImg.removeAttribute("src"); if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} } }
  function step(d) { if (set.length < 2) return; idx = (idx + d + set.length) % set.length; showLb(); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-lb]");
    if (b && !lb.contains(b)) openLb(b.getAttribute("data-lb"), b.getAttribute("data-id"), b);
  });
  lbClose.addEventListener("click", closeLb);
  lbPrev.addEventListener("click", function () { step(-1); });
  lbNext.addEventListener("click", function () { step(1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Tab") {
      var f = [lbClose, lbPrev, lbNext, lbLink].filter(function (n) { return n && !n.hidden; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  var tx0 = null;
  lb.addEventListener("touchstart", function (e) { tx0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (tx0 === null) return;
    var dx = e.changedTouches[0].clientX - tx0; tx0 = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* smooth scrolling (mouse wheel) */
  var sm = { on: false, target: window.scrollY, cur: window.scrollY, moving: false };
  var loaderActive = true;
  function smTick() {
    var diff = sm.target - sm.cur;
    if (Math.abs(diff) < 0.4) { sm.cur = sm.target; window.scrollTo(0, sm.cur); sm.moving = false; return; }
    sm.cur += diff * 0.11;
    window.scrollTo(0, sm.cur);
    requestAnimationFrame(smTick);
  }
  function smGo(y) {
    sm.target = clamp(y, 0, maxScroll());
    if (!sm.moving) { sm.moving = true; sm.cur = window.scrollY; requestAnimationFrame(smTick); }
  }
  if (fine && !reduced) {
    sm.on = true;
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.defaultPrevented || loaderActive || !lb.hidden) return;
      e.preventDefault();
      var d = e.deltaMode === 1 ? e.deltaY * 34 : (e.deltaMode === 2 ? e.deltaY * vh() : e.deltaY);
      if (!sm.moving) sm.target = window.scrollY;
      smGo(sm.target + d);
    }, { passive: false });
    window.addEventListener("scroll", function () { if (!sm.moving) { sm.target = sm.cur = window.scrollY; } }, { passive: true });
  }
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1), el = id ? $(id) : null;
      if (!el && id !== "top") return;
      e.preventDefault();
      var y = id === "top" ? 0 : el.getBoundingClientRect().top + window.scrollY - 24;
      if (id === "gallery") y = wallsec.getBoundingClientRect().top + window.scrollY - 1;
      if (sm.on) smGo(y); else window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    });
  });

  /* scroll-linked */
  var progress = $("progress"), timeline = $("timeline"), tlFill = $("tlFill"), heroIn = $("heroIn"), heroCv = $("heroCanvas");
  var tlItems = Array.prototype.slice.call(document.querySelectorAll(".tl-item"));
  function onScroll() {
    var y = window.scrollY, max = maxScroll();
    progress.style.transform = "scaleX(" + (max > 0 ? clamp(y / max, 0, 1) : 0) + ")";
    if (reduced) return;
    if (y < vh() * 1.3) {
      heroIn.style.transform = "translate3d(0," + (y * 0.12).toFixed(1) + "px,0)";
      heroCv.style.transform = "translate3d(0," + (y * 0.28).toFixed(1) + "px,0)"; if (himg) himg.style.transform = heroCv.style.transform;
    }
    var sr = scrub.getBoundingClientRect();
    var sp = clamp((vh() * 0.85 - sr.top) / (sr.height + vh() * 0.3), 0, 1), lit = Math.round(sp * words.length);
    for (var i = 0; i < words.length; i++) {
      var on = i < lit;
      if (on !== words[i].classList.contains("on")) words[i].classList.toggle("on", on);
    }
    var jr = timeline.getBoundingClientRect(), trig = vh() * 0.62;
    tlFill.style.height = clamp(trig - jr.top, 0, jr.height) + "px";
    tlItems.forEach(function (it) { it.classList.toggle("on", it.getBoundingClientRect().top < trig - 20); });
    var wr = wallsec.getBoundingClientRect(), span = Math.max(1, wr.height - vh());
    var wp = clamp(-wr.top / span, 0, 1), f = 1 - smooth(0.04, 0.72, wp);
    plane.style.setProperty("--f", f.toFixed(3));
    var wantHint = f > 0.12 ? "Scroll to open" : "Select a photo to enlarge";
    if (hint.textContent !== wantHint) hint.textContent = wantHint;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();


  var toTop = $("toTop");
  if (toTop) toTop.addEventListener("click", function () { if (typeof smGo === "function") smGo(0); else window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* main loop */
  var frames = 0, t0 = performance.now();
  function loop(now) {
    frames++;
    var t = (now - t0) / 1000, y = window.scrollY, d = y - lastY; lastY = y;
    vel += (d - vel) * 0.12;
    look.x += (look.tx - look.x) * 0.06; look.y += (look.ty - look.y) * 0.06;
    plane.style.setProperty("--mx", look.x.toFixed(1) + "px"); plane.style.setProperty("--my", look.y.toFixed(1) + "px");
    cv.forEach(function (c) { if (c.vis && c.w && !c.stat && (c.kind === "hero" || frames % 2 === 0)) drawCanvas(c, t); });
    heroReveal();
    if (Math.abs(pixTarget - pixCur) > 0.15) { pixCur += (pixTarget - pixCur) * 0.1; if (Math.abs(pixCur - pixDrawn) > 0.3 && pimg.naturalWidth) { try { drawPix(pixCur); } catch (e) {} } }
    requestAnimationFrame(loop);
  }
  if (!reduced) requestAnimationFrame(loop);

  applyTheme(savedMode);

  /* preloader */
  (function () {
    if (reduced) { loaderActive = false; if (window.__done) window.__done(); return; }
    var lc = $("loadCanvas"), lctx = lc.getContext("2d"), lCount = $("lCount"), lBar = $("lBar"), lNote = $("lNote");
    var cols = 32, rows = 12, W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function sizeL() {
      var r = lc.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
      lc.width = Math.round(W * dpr); lc.height = Math.round(H * dpr); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeL(); window.addEventListener("resize", sizeL);
    var notes = ["Warming up", "Loading organizations", "Loading certificates", "Loading gallery", "Spreading holiday cheer"];
    var begin = performance.now(), minMs = 2300, ready = false, finished = false, shown = 0;
    function mark() { ready = true; }
    var fontsP = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsP, new Promise(function (r) { setTimeout(r, 2600); })]).then(function () {
      if (document.readyState === "complete") mark(); else window.addEventListener("load", mark);
    });
    function drawL(p, t) {
      lctx.clearRect(0, 0, W, H);
      var cw = W / cols, ch = H / rows, base = Math.min(cw, ch) * 0.34, i, j;
      lctx.fillStyle = "#ffc21a"; lctx.beginPath();
      var lit = [], dim = [];
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols; i++) {
          var nx = (i + 0.5) / cols, x = (i + 0.5) * cw, y = (j + 0.5) * ch;
          var edge = nx - p * 1.08 + 0.04;
          var r;
          if (edge < 0) { r = base * (1 + 0.28 * Math.sin(i * 0.7 + j * 0.9 + t * 3)); lit.push(x, y, r); }
          else { r = base * 0.38; dim.push(x, y, r); }
        }
      }
      var k;
      for (k = 0; k < lit.length; k += 3) { lctx.moveTo(lit[k] + lit[k + 2], lit[k + 1]); lctx.arc(lit[k], lit[k + 1], lit[k + 2], 0, 6.2832); }
      lctx.fill();
      lctx.fillStyle = "rgba(255,255,255,0.28)"; lctx.beginPath();
      for (k = 0; k < dim.length; k += 3) { lctx.moveTo(dim[k] + dim[k + 2], dim[k + 1]); lctx.arc(dim[k], dim[k + 1], dim[k + 2], 0, 6.2832); }
      lctx.fill();
    }
    function lstep(now) {
      var el = now - begin, p = ease(clamp(el / minMs, 0, 1));
      if (!ready && p > 0.9) p = 0.9 + (p - 0.9) * 0.1;
      shown = p;
      lCount.textContent = String(Math.round(p * 100));
      lBar.style.transform = "scaleX(" + p.toFixed(3) + ")";
      lNote.textContent = notes[Math.min(notes.length - 1, Math.floor(p * notes.length * 0.999))];
      drawL(p, el / 1000);
      if (p >= 0.999 && !finished) {
        finished = true; lCount.textContent = "100";
        setTimeout(function () { loaderActive = false; if (window.__done) window.__done(); }, 380);
        return;
      }
      if (el > 6000 && !finished) { finished = true; loaderActive = false; if (window.__done) window.__done(); return; }
      requestAnimationFrame(lstep);
    }
    requestAnimationFrame(lstep);
  })();

  /* copy email */
  var btn = $("copy"), mail = $("email");
  function selectMail() { try { var r = document.createRange(); r.selectNodeContents(mail); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  btn.addEventListener("click", function () {
    var done = function (t) { btn.textContent = t; setTimeout(function () { btn.textContent = "Copy email"; }, 1800); };
    try { navigator.clipboard.writeText(mail.textContent.trim()).then(function () { done("Copied"); }, function () { selectMail(); done("Selected"); }); }
    catch (e) { selectMail(); done("Selected"); }
  });

  /* christmas theme: twinkling fairy lights + live pixel snowfall */
  (function () {
    var xBtn = $("xmasBtn"), lightsEl = $("xmasLights"), snowCv = $("snowCanvas");
    var xOn = true;
    try { if (localStorage.getItem("jp-xmas") === "off") xOn = false; } catch (e) {}

    function applyXmas(on) {
      xOn = on;
      if (on) doc.removeAttribute("data-xmas"); else doc.setAttribute("data-xmas", "off");
      if (xBtn) {
        xBtn.setAttribute("aria-pressed", on ? "true" : "false");
        xBtn.title = on ? "Christmas theme on (click to disable)" : "Christmas theme off (click to enable)";
      }
    }
    applyXmas(xOn);
    if (xBtn) {
      xBtn.addEventListener("click", function () {
        applyXmas(!xOn);
        try { localStorage.setItem("jp-xmas", xOn ? "on" : "off"); } catch (e) {}
        if (window.__sfxChirp) window.__sfxChirp();
      });
    }

    /* minimal twinkling fairy lights along top edge */
    if (lightsEl) {
      var palette = ["#ffc21a", "#f4f4f2", "#e63946", "#2a9d8f", "#ffc21a", "#f4f4f2"];
      var count = Math.min(28, Math.max(12, Math.floor(window.innerWidth / 64)));
      var frag = document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        var dot = document.createElement("i");
        dot.style.setProperty("--lc", palette[i % palette.length]);
        dot.style.setProperty("--ld", (2.2 + (i % 5) * 0.45).toFixed(2) + "s");
        dot.style.setProperty("--lt", ((i * 0.37) % 2.5).toFixed(2) + "s");
        frag.appendChild(dot);
      }
      lightsEl.appendChild(frag);
    }

    /* gentle crisp pixel snowfall */
    if (!snowCv || reduced) return;
    var sctx = snowCv.getContext("2d");
    var sw = 0, sh = 0, sdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var flakes = [];
    function sizeSnow() {
      sw = window.innerWidth || doc.clientWidth;
      sh = vh();
      snowCv.width = Math.round(sw * sdpr);
      snowCv.height = Math.round(sh * sdpr);
      sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
      var target = sw < 700 ? 32 : 58;
      while (flakes.length < target) {
        flakes.push({
          x: Math.random() * sw,
          y: Math.random() * sh,
          sz: Math.random() < 0.7 ? 2 : (Math.random() < 0.85 ? 3 : 4),
          vy: 0.35 + Math.random() * 0.75,
          vx: (Math.random() - 0.5) * 0.25,
          ph: Math.random() * 6.283,
          a: 0.18 + Math.random() * 0.42,
          gold: Math.random() < 0.14
        });
      }
    }
    sizeSnow();
    window.addEventListener("resize", sizeSnow);

    var st0 = performance.now();
    function snowTick(now) {
      if (xOn && !document.hidden) {
        var t = (now - st0) / 1000;
        var light = doc.getAttribute("data-theme") === "light";
        var wind = (mouse.x > -900 && sw > 0) ? ((mouse.x / sw) - 0.5) * 0.45 : 0;
        sctx.clearRect(0, 0, sw, sh);
        for (var i = 0; i < flakes.length; i++) {
          var fl = flakes[i];
          fl.y += fl.vy;
          fl.x += fl.vx + wind + Math.sin(t * 0.9 + fl.ph) * 0.25;
          if (fl.y > sh + 6) { fl.y = -6; fl.x = Math.random() * sw; }
          if (fl.x < -6) fl.x = sw + 6;
          if (fl.x > sw + 6) fl.x = -6;
          sctx.fillStyle = fl.gold ? colors.accent : (light ? "#4a5568" : "#f4f4f2");
          sctx.globalAlpha = light ? fl.a * 0.65 : fl.a;
          sctx.fillRect(Math.round(fl.x), Math.round(fl.y), fl.sz, fl.sz);
        }
        sctx.globalAlpha = 1;
      } else if (!xOn) {
        sctx.clearRect(0, 0, sw, sh);
      }
      requestAnimationFrame(snowTick);
    }
    requestAnimationFrame(snowTick);
  })();

  /* background music: Silent Night (kalimba synth) */
  (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    var ctx = null, gain = null, timer = null, idx = 0, unlocked = false;
    var playing = function () {
      return doc.getAttribute("data-xmas") !== "off" &&
             $("sndBtn") && $("sndBtn").getAttribute("aria-pressed") === "true" &&
             !document.hidden;
    };

    var N = {
      C3: 130.81, F3: 174.61, G3: 196.00,
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
      C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46
    };

    /* [melody, eighth-note duration, optional bass/harmony] */
    var song = [
      ["G4", 3, "C3"], ["A4", 1], ["G4", 2], ["E4", 6, "G3"],
      ["G4", 3, "C3"], ["A4", 1], ["G4", 2], ["E4", 6, "G3"],
      ["D5", 4, "G3"], ["D5", 2], ["B4", 6, "G3"],
      ["C5", 4, "C3"], ["C5", 2], ["G4", 6, "E4"],
      ["A4", 4, "F3"], ["A4", 2], ["C5", 3, "F3"], ["B4", 1], ["A4", 2],
      ["G4", 3, "C3"], ["A4", 1], ["G4", 2], ["E4", 6, "G3"],
      ["A4", 4, "F3"], ["A4", 2], ["C5", 3, "F3"], ["B4", 1], ["A4", 2],
      ["G4", 3, "C3"], ["A4", 1], ["G4", 2], ["E4", 6, "G3"],
      ["D5", 4, "G3"], ["D5", 2], ["F5", 3, "G3"], ["D5", 1], ["B4", 2],
      ["C5", 6, "C3"], ["E5", 6, "G3"],
      ["C5", 2, "C3"], ["G4", 2], ["E4", 2], ["G4", 3, "G3"], ["F4", 1], ["D4", 2],
      ["C4", 12, "C3"]
    ];

    function pluck(freq, vol, dur) {
      var t0 = ctx.currentTime;
      /* warm kalimba tine: fundamental + soft metallic overtone */
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = "sine"; o1.frequency.setValueAtTime(freq, t0);
      o2.type = "triangle"; o2.frequency.setValueAtTime(freq * 2.0, t0);
      var g2 = ctx.createGain(); g2.gain.setValueAtTime(0.14, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(gain);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
    }

    function nextNote() {
      if (!playing()) { timer = null; return; }
      var step = song[idx];
      idx = (idx + 1) % song.length;
      if (N[step[0]]) pluck(N[step[0]], 0.16, Math.min(2.6, step[1] * 0.42 + 0.5));
      if (step[2] && N[step[2]]) pluck(N[step[2]], 0.07, 2.2);
      timer = setTimeout(nextNote, step[1] * 390);
    }

    function sync() {
      if (!unlocked) return;
      if (!ctx) { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0.55; gain.connect(ctx.destination); }
      if (playing()) {
        if (ctx.state === "suspended") ctx.resume();
        if (!timer) nextNote();
      } else {
        clearTimeout(timer); timer = null;
      }
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      sync();
    }

    ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    });
    if ($("sndBtn")) $("sndBtn").addEventListener("click", function () { setTimeout(sync, 20); });
    if ($("xmasBtn")) $("xmasBtn").addEventListener("click", function () { setTimeout(sync, 20); });
    document.addEventListener("visibilitychange", sync);
  })();
})();