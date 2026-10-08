/* Concorde in Three.js: a procedural model built from the real proportions
   (length 61.66 m, span 25.6 m), a walk-through cabin, and the scroll hooks
   for two scenes: cabin tour and Mach 2 top view. (The droop nose scene is in droop3d.js.)
   Units are metres. Aircraft axes: +x forward (tail at x = 0), +y up, +z right. */
(() => {
  if (!window.THREE) return;
  const T = THREE, DEG = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- shared helpers ---------- */
  function makeRenderer(canvas, alpha = true) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    return r;
  }
  // soft studio reflections: a warm gradient dome with three soft boxes
  function studioEnv(renderer) {
    const s = new T.Scene();
    const geo = new T.SphereGeometry(50, 48, 24), pos = geo.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50, c = new T.Color().setHSL(.08, .1, .16 + .3 * Math.max(0, y) + .04 * Math.min(0, y));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    s.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const box = (w, h, x, y, z, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k * .96), side: T.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    };
    box(46, 9, 0, 42, 0, 7); box(22, 16, 34, 12, 24, 3.4); box(22, 16, -34, 10, -26, 2.2); box(70, 3, 0, 3, -45, 1.6); box(70, 3, 0, 3, 45, 1.2);
    const pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(s, .035).texture;
    pm.dispose(); return tex;
  }

  /* ---------- the aircraft ---------- */
  const LEN = 61.66, HINGE = 53.5, NOSE_LEN = LEN - HINGE, R = 1.46;
  const rBody = s => s < 10 ? R * Math.pow(Math.sin(s / 10 * Math.PI / 2), .85)
                    : s < 46 ? R : R - .16 * Math.pow((s - 46) / 7.5, 2);
  const rNose = s => { const u = clamp(s / NOSE_LEN); return 1.30 * Math.pow(1 - u, .72) * (1 - .08 * u); };
  const PIVOT = new T.Vector3(HINGE, -1.25, 0);           // the droop hinge sits low in the fuselage
  const EYE = new T.Vector3(52.2, .95, 0);                 // pilot's eye

  function latheX(fn, s0, s1, n = 72, seg = 72) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n; pts.push(new T.Vector2(Math.max(fn(s), .002), s - s0)); }
    const g = new T.LatheGeometry(pts, seg); g.rotateZ(-Math.PI / 2); return g;
  }
  function buildConcorde(envMap) {
    const white = new T.MeshPhysicalMaterial({ color: 0xedeeee, metalness: .08, roughness: .36, clearcoat: .8, clearcoatRoughness: .18, envMap, envMapIntensity: .9 });
    const glass = new T.MeshPhysicalMaterial({ color: 0x141b25, metalness: .4, roughness: .12, clearcoat: 1, envMap, envMapIntensity: 1.4 });
    const dark = new T.MeshStandardMaterial({ color: 0x15171b, roughness: .6, metalness: .2 });
    const metal = new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: .32, metalness: .92, envMap, envMapIntensity: 1.2 });
    const tyre = new T.MeshStandardMaterial({ color: 0x1b1b1d, roughness: .85 });
    const plane = new T.Group(), mesh = (g, m) => { const o = new T.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };

    // fuselage, then the drooping nose on its own pivot
    plane.add(mesh(latheX(rBody, 0, HINGE), white));
    const nosePivot = new T.Group(); nosePivot.position.copy(PIVOT); plane.add(nosePivot);
    const nose = mesh(latheX(rNose, 0, NOSE_LEN, 60), white); nose.position.set(0, -PIVOT.y, 0); nosePivot.add(nose);
    // cockpit windscreen band and the tiny passenger windows
    for (const side of [1, -1]) for (const [dx, sx] of [[0, 1], [.62, .8]]) {
      const pane = mesh(new T.CircleGeometry(.2, 4), glass); pane.scale.set(sx * 1.25, .55, 1);
      pane.position.set(52.15 + dx, .78, side * Math.sqrt(rBody(52.15 + dx) ** 2 - .78 * .78) * 1.01);
      pane.rotation.set(0, side > 0 ? .25 : Math.PI - .25, 0); plane.add(pane);
    }
    const winGeo = new T.CircleGeometry(.075, 18), wins = new T.InstancedMesh(winGeo, glass, 2 * 62), m4 = new T.Matrix4(), q = new T.Quaternion();
    let k = 0;
    for (let i = 0; i < 62; i++) for (const side of [1, -1]) {
      const x = 15.2 + i * .52, y = .3, z = side * Math.sqrt(R * R - y * y) * 1.003;
      q.setFromEuler(new T.Euler(0, side > 0 ? 0 : Math.PI, 0));
      m4.compose(new T.Vector3(x, y, z), q, new T.Vector3(1, 1.25, 1)); wins.setMatrixAt(k++, m4);
    }
    plane.add(wins);

    // ogival delta wing, with a little anhedral towards the tips
    const wing = side => {
      const sh = new T.Shape(), f = v => v * side;
      sh.moveTo(37, 0);
      sh.splineThru([[33, 1.4], [29, 2.9], [24, 5.0], [19, 7.4], [14.5, 9.7], [11, 11.4], [8.4, 12.45], [7.0, 12.8]].map(([x, y]) => new T.Vector2(x, f(y))));
      sh.lineTo(5.5, f(12.8)); sh.lineTo(4.5, f(7)); sh.lineTo(4.2, f(1.4)); sh.lineTo(4.4, 0); sh.lineTo(37, 0);
      const g = new T.ExtrudeGeometry(sh, { depth: .14, bevelEnabled: true, bevelThickness: .13, bevelSize: .16, bevelSegments: 4, curveSegments: 48 });
      g.rotateX(Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = Math.abs(p.getZ(i)); p.setY(i, p.getY(i) - .85 - .045 * Math.pow(Math.max(0, z - 1.4), 1.18)); }
      g.computeVertexNormals(); return mesh(g, white);
    };
    plane.add(wing(1), wing(-1));

    // fin
    const fs = new T.Shape(); fs.moveTo(.4, 0); fs.lineTo(12.6, 0); fs.lineTo(4.7, 7.6); fs.lineTo(1.9, 7.6); fs.lineTo(.4, 0);
    const fg = new T.ExtrudeGeometry(fs, { depth: .2, bevelEnabled: true, bevelThickness: .09, bevelSize: .09, bevelSegments: 3 });
    fg.translate(0, 0, -.1); const fin = mesh(fg, white); fin.position.y = 1.2; plane.add(fin);

    // two nacelles, each holding two engines, with intakes and nozzles
    const flames = [];
    const flameMat = new T.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false });
    const coreMat = new T.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false });
    for (const side of [1, -1]) {
      const zc = side * 4.45, ns = new T.Shape();
      ns.moveTo(.9, 0); ns.lineTo(15.2, 0); ns.lineTo(13.7, -1.3); ns.lineTo(2.1, -1.3); ns.lineTo(.9, -1.0); ns.lineTo(.9, 0);
      const g = new T.ExtrudeGeometry(ns, { depth: 2.5, bevelEnabled: true, bevelThickness: .07, bevelSize: .07, bevelSegments: 2 });
      g.translate(0, 0, -1.25); const nac = mesh(g, white); nac.position.set(0, -1.3 - .045 * Math.pow(Math.abs(zc) - 1.4, 1.18), zc); plane.add(nac);
      const intake = mesh(new T.BoxGeometry(.18, 1.6, 2.3), dark); intake.position.set(14.42, -.66, 0); intake.rotation.z = -.84; nac.add(intake);
      for (const e of [-.62, .62]) {
        const noz = mesh(new T.CylinderGeometry(.52, .46, 1.3, 32, 1, true), metal); noz.rotation.z = Math.PI / 2; noz.position.set(.3, -.62, e); nac.add(noz);
        const hole = mesh(new T.CircleGeometry(.44, 28), dark); hole.rotation.y = -Math.PI / 2; hole.position.set(-.3, -.62, e); nac.add(hole);
        const fl = new T.Mesh(new T.ConeGeometry(.44, 7, 28, 1, true), flameMat); fl.rotation.z = Math.PI / 2; fl.position.set(-3.9, -.62, e);
        const core = new T.Mesh(new T.ConeGeometry(.24, 3.6, 20, 1, true), coreMat); core.rotation.z = Math.PI / 2; core.position.set(-2.1, -.62, e);
        fl.visible = core.visible = false; nac.add(fl, core); flames.push(fl, core);
      }
    }

    // landing gear (main bogies under the wing, nose gear)
    const gear = new T.Group(); plane.add(gear);
    const leg = (x, z, yTop, yBot, r = .17) => { const c = mesh(new T.CylinderGeometry(r, r, yTop - yBot, 16), metal); c.position.set(x, (yTop + yBot) / 2, z); gear.add(c); };
    const wheel = (x, z, y, r, w) => { const c = mesh(new T.CylinderGeometry(r, r, w, 28), tyre); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); gear.add(c); };
    for (const s of [1, -1]) {
      leg(22.4, s * 3.85, -1.2, -3.8, .2);
      const b = mesh(new T.BoxGeometry(1.9, .16, .2), metal); b.position.set(22.4, -3.82, s * 3.85); gear.add(b);
      for (const dx of [-.68, .68]) for (const dz of [-.3, .3]) wheel(22.4 + dx, s * 3.85 + dz, -3.85, .55, .32);
    }
    leg(46.4, 0, -1.3, -3.95, .15); for (const dz of [-.24, .24]) wheel(46.4, dz, -3.95, .45, .28);

    // pilot's line of sight over the nose
    const sight = new T.Line(new T.BufferGeometry().setFromPoints([EYE, EYE.clone().add(new T.Vector3(1, 0, 0))]),
      new T.LineDashedMaterial({ color: 0xff5a1f, dashSize: .7, gapSize: .45, transparent: true, opacity: .95 }));
    sight.visible = false; plane.add(sight);

    const setDroop = deg => {
      nosePivot.rotation.z = -deg * DEG;
      // lowest view the pilot gets over the nose: the steepest ray from the eye that clears every nose point
      const a = deg * DEG, ca = Math.cos(a), sa = Math.sin(a);
      let ang = Math.atan2(R - EYE.y, HINGE - EYE.x);
      for (let s = 0; s <= NOSE_LEN; s += .25) {
        const rx = s, ry = rNose(s) - PIVOT.y;
        const px = PIVOT.x + rx * ca + ry * sa, py = PIVOT.y - rx * sa + ry * ca;
        ang = Math.max(ang, Math.atan2(py - EYE.y, px - EYE.x));
      }
      const L = 70, end = new T.Vector3(EYE.x + L * Math.cos(ang), EYE.y + L * Math.sin(ang), 0);
      sight.geometry.setFromPoints([EYE, end]); sight.computeLineDistances();
      return ang / DEG;
    };
    return { plane, nosePivot, gear, flames, sight, setDroop };
  }

  /* ---------- canvas textures: seat fabric and instrument panels ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function texFrom(c, rep) { const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
  function stripeFabric() {                     // the brown and tan woven stripes on the seat backs
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'), r = rng(7);
    g.fillStyle = '#4a2f21'; g.fillRect(0, 0, 256, 256);
    const band = ['#6b4a35', '#8a6a50', '#3b2418', '#a3876a', '#5a3b2a', '#2f1d14'];
    for (let y = 0; y < 256; y += 4) { g.fillStyle = band[(y / 4 + (y % 24 === 0 ? 3 : 0)) % band.length]; g.fillRect(0, y, 256, 2 + (y % 12 === 0 ? 1 : 0)); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,235,210' : '20,10,5'},${r() * .08})`; g.fillRect(r() * 256, r() * 256, 2, 1); }
    return texFrom(c, [1, 2]);
  }
  function panelTex(w, h, seed, opt = {}) {      // dense analogue panels: gauges, toggles, red guards, amber lamps
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = opt.bg || '#3c4552'; g.fillRect(0, 0, w, h);
    const cell = opt.cell || 46;
    for (let y = 6; y < h - cell * .6; y += cell) {
      if (r() < .18) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y - 4, w, 2); }
      for (let x = 6; x < w - cell * .6; x += cell) {
        const k = r(), cx = x + cell / 2, cy = y + cell / 2;
        if (k < (opt.gauges ?? .5)) {           // round gauge
          const rad = cell * (.32 + r() * .12);
          g.fillStyle = '#0d0f12'; g.beginPath(); g.arc(cx, cy, rad + 3, 0, 7); g.fill();
          g.strokeStyle = '#9aa3ad'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rad + 2, 0, 7); g.stroke();
          g.strokeStyle = '#e8ecef'; g.lineWidth = 1;
          for (let a = 0; a < 12; a++) { const t = -2.3 + a * 4.6 / 11; g.beginPath(); g.moveTo(cx + Math.cos(t) * rad * .78, cy + Math.sin(t) * rad * .78); g.lineTo(cx + Math.cos(t) * rad * .95, cy + Math.sin(t) * rad * .95); g.stroke(); }
          const t = -2.3 + r() * 4.6; g.strokeStyle = r() < .2 ? '#ffb347' : '#ffffff'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * rad * .8, cy + Math.sin(t) * rad * .8); g.stroke();
        } else if (k < .78) {                     // toggle switches
          for (let i = 0; i < 3; i++) {
            const sx = x + 8 + i * cell * .28, red = r() < (opt.red ?? .12);
            g.fillStyle = '#1a1d22'; g.fillRect(sx - 2, cy - 7, 10, 14);
            g.fillStyle = red ? '#c8322a' : '#e9ecee'; g.fillRect(sx, cy - (r() < .5 ? 10 : 2), 6, 9);
          }
        } else if (k < .9) {                      // annunciator lamps
          g.fillStyle = r() < .4 ? '#ffb347' : r() < .5 ? '#7fd36a' : '#2a2f36'; g.fillRect(x + 6, cy - 7, cell - 14, 14);
        } else { g.fillStyle = '#2b3139'; g.fillRect(x + 4, y + 4, cell - 8, cell - 8); }
      }
    }
    return texFrom(c);
  }

  /* ---------- scene: the cabin walk-through, then the flight deck ---------- */
  function cabinScene(canvas) {
    const renderer = makeRenderer(canvas, false); renderer.setClearColor(0x0b0a09, 1); renderer.toneMappingExposure = .82;
    const scene = new T.Scene(); scene.fog = new T.Fog(0x1e1712, 8, 32);
    const cam = new T.PerspectiveCamera(58, 1, .03, 120);
    const Rc = 1.35, Yc = .62, X0 = -4.2, PART = 10.2, X1 = 25.6, XC = 30, Lc = X1 - X0;
    const mat = (c, r = .8, extra = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, extra));
    const add = (geo, m, x, y, z, ry = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };

    // shell, carpet, ceiling
    const shell = new T.Mesh(new T.CylinderGeometry(Rc, Rc, Lc, 72, 1, true), mat(0xd8cdbb, .85, { side: T.BackSide }));
    shell.geometry.rotateZ(-Math.PI / 2); shell.position.set((X0 + X1) / 2, Yc, 0); scene.add(shell);
    const floor = new T.Mesh(new T.PlaneGeometry(Lc, 2.6), mat(0x1d3431, 1)); floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0, 0); scene.add(floor);
    const aisle = new T.Mesh(new T.PlaneGeometry(Lc, .46), mat(0x15302c, .95)); aisle.rotation.x = -Math.PI / 2; aisle.position.set((X0 + X1) / 2, .002, 0); scene.add(aisle);
    const ceil = new T.Mesh(new T.PlaneGeometry(Lc, 1.12), mat(0xe9e0d0, .8)); ceil.rotation.x = Math.PI / 2; ceil.position.set((X0 + X1) / 2, 1.955, 0); scene.add(ceil);

    // a cross-section wall (cabin outline) with a doorway, for the partition and the front bulkhead
    const a0 = Math.asin(-Yc / Rc);
    function wallWithDoor(x, color, doorW, doorH) {
      const sh = new T.Shape();
      for (let i = 0; i <= 64; i++) { const t = a0 + (Math.PI - 2 * a0) * i / 64; const zz = Rc * Math.cos(t), yy = Yc + Rc * Math.sin(t); i ? sh.lineTo(zz, yy) : sh.moveTo(zz, yy); }
      const hole = new T.Path(); hole.moveTo(-doorW / 2, 0); hole.lineTo(doorW / 2, 0); hole.lineTo(doorW / 2, doorH); hole.lineTo(-doorW / 2, doorH); hole.lineTo(-doorW / 2, 0); sh.holes.push(hole);
      const g = new T.ShapeGeometry(sh, 24); g.rotateY(Math.PI / 2);
      const m = new T.Mesh(g, mat(color, .75, { side: T.DoubleSide })); m.position.x = x; scene.add(m);
      const trim = mat(0xa58e74, .45, { metalness: .3 });   // door frame
      add(new T.BoxGeometry(.06, .05, doorW + .08), trim, x, doorH + .02, 0);
      for (const zz of [-1, 1]) add(new T.BoxGeometry(.06, doorH, .04), trim, x, doorH / 2, zz * (doorW / 2 + .02));
      return m;
    }
    const back = new T.Mesh(new T.CircleGeometry(Rc, 64), mat(0xc49c8e, .75)); back.rotation.y = Math.PI / 2; back.position.set(X0, Yc, 0); scene.add(back);
    wallWithDoor(PART, 0xc49b8d, .66, 1.86);              // dusty pink partition between the two cabins
    wallWithDoor(X1, 0xc49b8d, .7, 1.74);                 // front bulkhead with the flight deck door

    // red EXIT sign over the partition doorway, and a pulled-back curtain
    const sign = document.createElement('canvas'); sign.width = 256; sign.height = 64; const sg = sign.getContext('2d');
    sg.fillStyle = '#1a0806'; sg.fillRect(0, 0, 256, 64); sg.fillStyle = '#ff3b2a'; sg.shadowColor = '#ff2a1a'; sg.shadowBlur = 10;
    sg.font = '700 40px Arial, sans-serif'; sg.textAlign = 'center'; sg.fillText('◀ EXIT ▶', 128, 46);
    add(new T.PlaneGeometry(.5, .125), new T.MeshBasicMaterial({ map: texFrom(sign), toneMapped: false }), PART - .04, 1.92, 0, -Math.PI / 2);
    const curtainM = mat(0xb9a284, .95);
    for (let i = 0; i < 9; i++) add(new T.CylinderGeometry(.03, .03, 1.84, 8), curtainM, PART + .08, .93, -.36 - i * .035);

    // overhead bins: the angular cream bins of the original cabin, in two runs, with warm light under the lip
    const binM = mat(0xdccfb6, .6), seamM = mat(0x9b8f7c, .7), lampM = new T.MeshBasicMaterial({ color: 0xffd9a6 });
    function bins(xa, xb) {
      const L = xb - xa;
      for (const sd of [1, -1]) {
        const sh = new T.Shape(), P = [[1.32, 1.42], [.86, 1.45], [.78, 1.5], [.62, 1.84], [.57, 1.955], [1.08, 2.02], [1.32, 1.62]];
        P.forEach(([z, y], i) => i ? sh.lineTo(-sd * z, y) : sh.moveTo(-sd * z, y));
        const g = new T.ExtrudeGeometry(sh, { depth: L, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 });
        g.rotateY(Math.PI / 2); const m = new T.Mesh(g, binM); m.position.x = xa; scene.add(m);
        const lamp = new T.Mesh(new T.BoxGeometry(L, .012, .04), lampM); lamp.position.set(xa + L / 2, 1.44, sd * .84); scene.add(lamp);
        for (let x = xa + 1.9; x < xb - .2; x += 1.9) {   // door seams and the little triangular pieces at the ceiling
          const seam = new T.Mesh(new T.BoxGeometry(.012, .36, .02), seamM); seam.position.set(x, 1.66, sd * .71); seam.rotation.x = sd * -.42; scene.add(seam);
          const tri = new T.Shape(); tri.moveTo(-.14, 0); tri.lineTo(.14, 0); tri.lineTo(0, -.12); tri.lineTo(-.14, 0);
          const tm = new T.Mesh(new T.ShapeGeometry(tri), binM); tm.position.set(x, 1.95, sd * .58); tm.rotation.set(0, sd > 0 ? Math.PI / 2 : -Math.PI / 2, 0); scene.add(tm);
          const plac = new T.Mesh(new T.PlaneGeometry(.08, .05), mat(0x6f665a, .6)); plac.position.set(x - .6, 1.8, sd * .645); plac.rotation.set(0, sd > 0 ? Math.PI : 0, sd * .42); scene.add(plac);
        }
      }
    }
    bins(X0 + .2, PART - .04); bins(PART + .04, X1 - .9);

    // seats: dark brown leather frame, striped woven fabric on the back, white cloth over the top
    const brown = mat(0x3e271b, .62), fabric = new T.MeshStandardMaterial({ map: stripeFabric(), roughness: .9 }), cloth = mat(0xf3efe6, .95), armM = mat(0x2c1c13, .5);
    const prof = new T.Shape();
    prof.moveTo(.26, .30); prof.lineTo(.27, .46); prof.quadraticCurveTo(.27, .52, .2, .52); prof.lineTo(-.14, .5);
    prof.quadraticCurveTo(-.2, .5, -.22, .56); prof.lineTo(-.33, 1.1); prof.quadraticCurveTo(-.35, 1.22, -.44, 1.21);
    prof.lineTo(-.48, 1.18); prof.quadraticCurveTo(-.5, 1.1, -.47, 1.0); prof.lineTo(-.36, .34); prof.quadraticCurveTo(-.34, .28, -.26, .28); prof.lineTo(.26, .30);
    const seatGeo = new T.ExtrudeGeometry(prof, { depth: .38, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 4, curveSegments: 10 }); seatGeo.translate(0, 0, -.19);
    const backGeo = new T.BoxGeometry(.016, .5, .4), clothGeo = new T.BoxGeometry(.2, .25, .47), armGeo = new T.BoxGeometry(.44, .06, .07);
    const zs = [-.95, -.47, .47, .95], pitchX = .96;
    const rowsX = []; for (let x = -1.5; x < PART - .9; x += pitchX) rowsX.push(x); for (let x = PART + 1.3; x < X1 - 1.6; x += pitchX) rowsX.push(x);
    const n = rowsX.length * 4;
    const I = (g, m, c) => { const o = new T.InstancedMesh(g, m, c); scene.add(o); return o; };
    const seatI = I(seatGeo, brown, n), backI = I(backGeo, fabric, n), clothI = I(clothGeo, cloth, n), armI = I(armGeo, armM, rowsX.length * 6);
    const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), S1 = new T.Vector3(1, 1, 1);
    let ci = 0, ai = 0;
    rowsX.forEach(x => {
      zs.forEach(z => {
        M.compose(V.set(x, 0, z), Q.identity(), S1); seatI.setMatrixAt(ci, M);
        Q.setFromEuler(E.set(0, 0, .165));
        M.compose(V.set(x - .478, .66, z), Q, S1); backI.setMatrixAt(ci, M);
        Q.setFromEuler(E.set(0, 0, .2));
        M.compose(V.set(x - .41, 1.09, z), Q, S1); clothI.setMatrixAt(ci, M);
        ci++;
      });
      for (const z of [-1.2, -.71, -.23, .23, .71, 1.2]) { M.compose(V.set(x - .02, .64, z), Q.identity(), S1); armI.setMatrixAt(ai++, M); }
    });

    // small windows in deep bays, bright sky outside
    const wShape = new T.Shape(); const ww = .16, wh = .23, wr = .07;
    wShape.moveTo(-ww / 2 + wr, -wh / 2); wShape.lineTo(ww / 2 - wr, -wh / 2); wShape.quadraticCurveTo(ww / 2, -wh / 2, ww / 2, -wh / 2 + wr);
    wShape.lineTo(ww / 2, wh / 2 - wr); wShape.quadraticCurveTo(ww / 2, wh / 2, ww / 2 - wr, wh / 2); wShape.lineTo(-ww / 2 + wr, wh / 2);
    wShape.quadraticCurveTo(-ww / 2, wh / 2, -ww / 2, wh / 2 - wr); wShape.lineTo(-ww / 2, -wh / 2 + wr); wShape.quadraticCurveTo(-ww / 2, -wh / 2, -ww / 2 + wr, -wh / 2);
    const skyM = new T.MeshBasicMaterial({ color: 0xe2f0ff, toneMapped: false }), bayM = mat(0xc9bca8, .7);
    const wy = 1.12, wz = Math.sqrt(Rc * Rc - (wy - Yc) ** 2) - .015;
    rowsX.forEach(x => { for (const sd of [1, -1]) {
      const bay = add(new T.ShapeGeometry(wShape), bayM, x + .08, wy, sd * (wz + .004), sd > 0 ? Math.PI : 0); bay.scale.set(1.55, 1.42, 1);
      const w = add(new T.ShapeGeometry(wShape), skyM, x + .08, wy, sd * wz, sd > 0 ? Math.PI : 0); w.scale.set(1.12, 1.12, 1);
    } });

    // the speed display above the flight deck door
    const lcd = document.createElement('canvas'); lcd.width = 512; lcd.height = 128;
    const lctx = lcd.getContext('2d'), lcdTex = texFrom(lcd);
    const drawLCD = () => {
      lctx.fillStyle = '#060404'; lctx.fillRect(0, 0, 512, 128);
      lctx.shadowColor = 'rgba(255,90,40,.9)'; lctx.shadowBlur = 12; lctx.fillStyle = '#ff6a3a'; lctx.textAlign = 'center';
      lctx.font = '600 64px "IBM Plex Mono", monospace'; lctx.fillText('MACH 0.00', 256, 86); lcdTex.needsUpdate = true;
    };
    drawLCD(); if (document.fonts) document.fonts.ready.then(drawLCD);
    add(new T.BoxGeometry(.05, .17, .66), mat(0x2a2422, .5), X1 - .03, 1.84, 0);
    add(new T.PlaneGeometry(.6, .15), new T.MeshBasicMaterial({ map: lcdTex, toneMapped: false }), X1 - .06, 1.84, 0, -Math.PI / 2);

    // flight deck door, hinged on the left
    const doorPivot = new T.Group(); doorPivot.position.set(X1 - .03, 0, -.35); scene.add(doorPivot);
    const door = new T.Mesh(new T.BoxGeometry(.04, 1.74, .7), mat(0xb89a8c, .6)); door.position.set(0, .87, .35); doorPivot.add(door);
    const knob = new T.Mesh(new T.SphereGeometry(.03, 12, 8), mat(0xc9b28a, .25, { metalness: .9 })); knob.position.set(-.04, .95, .62); doorPivot.add(knob);

    /* ----- the flight deck ----- */
    const deckShell = new T.Mesh(new T.CylinderGeometry(1.02, 1.3, XC - X1, 56, 1, true), mat(0x56606b, .8, { side: T.BackSide }));
    deckShell.geometry.rotateZ(-Math.PI / 2); deckShell.position.set((X1 + XC) / 2, Yc, 0); scene.add(deckShell);
    const dFloor = new T.Mesh(new T.PlaneGeometry(XC - X1, 2.2), mat(0x3a3d42, .9)); dFloor.rotation.x = -Math.PI / 2; dFloor.position.set((X1 + XC) / 2, .001, 0); scene.add(dFloor);
    const panelM = (w, h, seed, o) => new T.MeshStandardMaterial({ map: panelTex(w, h, seed, o), roughness: .55, emissive: 0x222222, emissiveIntensity: .25 });
    const main = add(new T.PlaneGeometry(1.7, .62), panelM(1100, 400, 3, { gauges: .62, cell: 48 }), 29.02, 1.12, 0, -Math.PI / 2); main.rotation.z = 0; main.rotation.x = 0; main.rotateX(-.25);
    add(new T.BoxGeometry(.34, .07, 1.8), mat(0x1e2126, .7), 28.9, 1.47, 0);                                   // glare shield
    add(new T.PlaneGeometry(1.4, .14), panelM(900, 90, 11, { gauges: .1, cell: 30 }), 28.74, 1.515, 0, -Math.PI / 2).rotateX(-1.2);
    const glass = new T.MeshBasicMaterial({ color: 0xe8f1f7, toneMapped: false });
    for (const sd of [-1, 1]) {
      const w1 = add(new T.PlaneGeometry(.5, .3), glass, 29.3, 1.72, sd * .3, -Math.PI / 2); w1.rotateX(-.35);
      const w2 = add(new T.PlaneGeometry(.55, .34), glass, 28.6, 1.62, sd * .93, sd > 0 ? Math.PI : 0); w2.rotation.y += sd * .5;
    }
    const overG = new T.Group(); overG.position.set(28.25, 1.9, 0); overG.rotation.z = -.38; scene.add(overG);
    const over = new T.Mesh(new T.PlaneGeometry(.9, 1.1), panelM(700, 860, 21, { gauges: .2, cell: 38, red: .2 })); over.rotation.set(Math.PI / 2, 0, Math.PI / 2); overG.add(over);
    const fe = add(new T.PlaneGeometry(2.2, 1.25), panelM(1400, 800, 5, { gauges: .55, cell: 44, red: .25 }), 27.1, 1.12, 1.0, Math.PI);   // flight engineer's wall
    add(new T.BoxGeometry(1.6, .05, .4), mat(0xcfc9bd, .6), 27.0, .74, .82);                                   // his desk
    const ped = add(new T.BoxGeometry(.7, .55, .32), mat(0x2f343b, .6), 28.45, .42, 0);
    add(new T.PlaneGeometry(.7, .32), panelM(400, 180, 31, { gauges: .2, cell: 30 }), 28.45, .7, 0).rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    for (let i = 0; i < 4; i++) add(new T.BoxGeometry(.04, .16, .03), mat(0xd9d9d9, .35, { metalness: .6 }), 28.3, .8, -.09 + i * .06).rotation.z = .35;
    const pilotM = mat(0x66696c, .55);
    const pilotSeat = (x, z, ry) => { const m = new T.Mesh(seatGeo, pilotM); m.position.set(x, 0, z); m.rotation.y = ry; m.scale.set(1, 1.08, 1); scene.add(m); };
    pilotSeat(28.0, -.48, 0); pilotSeat(28.0, .48, 0); pilotSeat(27.0, .3, -Math.PI / 2);

    // lights: warm cabin, daylight in the flight deck
    scene.add(new T.AmbientLight(0xffe8cf, .16));
    scene.add(new T.HemisphereLight(0xfff0dd, 0x1a2a28, .42));
    for (let x = X0 + 1.4; x < X1; x += 2.8) { const l = new T.PointLight(0xffd3a0, .5, 4.6, 2); l.position.set(x, 1.8, 0); scene.add(l); }
    const day = new T.PointLight(0xeaf3ff, 1.6, 6, 1.6); day.position.set(29.2, 1.7, 0); scene.add(day);
    const fill = new T.PointLight(0xfff1de, .7, 5, 2); fill.position.set(27.2, 1.75, .2); scene.add(fill);

    // tour stops: hotspot anchor and what the camera looks at
    const STOPS = [
      { win: [.04, .16], at: new T.Vector3(1.36, 1.2, .95), look: null },
      { win: [.19, .31], at: new T.Vector3(8.3, wy, -wz), look: new T.Vector3(9.5, 1.05, -1.25) },
      { win: [.34, .46], at: new T.Vector3(19.5, 1.66, .7), look: new T.Vector3(22, 1.75, 0) },
      { win: [.50, .64], at: new T.Vector3(X1, 1.84, 0), look: new T.Vector3(X1, 1.8, 0) },
      { win: [.84, .99], at: new T.Vector3(27.1, 1.3, .98), look: null },
    ];
    const w = (p, [a, b]) => seg(p, a - .03, a) * (1 - seg(p, b, b + .03));
    const look = new T.Vector3(), tmp = new T.Vector3();
    const sine = t => (1 - Math.cos(Math.PI * t)) / 2;
    function update(p) {
      const walk = sine(seg(p, 0, .62)), into = ease(seg(p, .72, .86));
      const x = lerp(lerp(X0 + 1.1, X1 - 3, walk), 26.9, into);
      cam.position.set(x, lerp(1.56, 1.5, into) + Math.sin(x * 2.4) * .01 * (1 - into), Math.sin(x * .6) * .03 * (1 - into));
      look.set(x + 8, 1.28, 0);
      STOPS.forEach(s => { if (s.look) { const k = w(p, s.win); tmp.copy(s.look).sub(look).multiplyScalar(k); look.add(tmp); } });
      const hold = seg(p, .6, .66) * (1 - into); tmp.set(X1, 1.2, 0).sub(look).multiplyScalar(hold * (1 - w(p, STOPS[3].win))); look.add(tmp);
      // in the flight deck: look at the windscreen, then turn a little to the engineer's wall
      const deckLook = new T.Vector3(30, 1.35, 0).lerp(new T.Vector3(27.6, 1.15, 1.6), .55 * ease(seg(p, .88, 1)));
      look.lerp(deckLook, into);
      cam.lookAt(look);
      doorPivot.rotation.y = -ease(seg(p, .64, .74)) * 1.5;
      return STOPS.map(s => w(p, s.win));
    }
    return { renderer, scene, cam, update, STOPS };
  }

  /* ---------- wiring ---------- */
  const list = [];
  function add(id, factory, sectionId) {
    const c = document.getElementById(id); if (!c) return null;
    const s = factory(c); s.canvas = c; s.section = document.getElementById(sectionId); list.push(s); return s;
  }
  let cabin, mach;
  try {
    cabin = add('cabin3d', cabinScene, 'cabin');
  } catch (e) { console.error(e); return; }

  function resize() {
    list.forEach(s => {
      const w = s.canvas.clientWidth, h = s.canvas.clientHeight; if (!w || !h) return;
      s.renderer.setSize(w, h, false); s.cam.aspect = w / h; s.cam.updateProjectionMatrix();
    });
  }
  resize(); addEventListener('resize', resize);
  const visible = s => { const r = s.section.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  const proj = new T.Vector3();

  window.C3D = {
    ok: true,
    update(P, t) {
      if (cabin && visible(cabin)) {
        const ws = cabin.update(P.cabin);
        cabin.renderer.render(cabin.scene, cabin.cam);
        const W = cabin.canvas.clientWidth, H = cabin.canvas.clientHeight;
        cabin.STOPS.forEach((s, i) => {
          const el = document.getElementById('hot' + i); if (!el) return;
          proj.copy(s.at).project(cabin.cam);
          const on = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
          el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
          el.style.opacity = on ? ws[i] : 0;
        });
      }
      if (mach && visible(mach)) { mach.update(P.mach2, t); mach.renderer.render(mach.scene, mach.cam); }
    },
    animating: () => mach && visible(mach),
    resize
  };
})();
