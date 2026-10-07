/* Concorde in Three.js: a procedural model built from the real proportions
   (length 61.66 m, span 25.6 m), a walk-through cabin, and the scroll hooks
   for three scenes: cabin tour, droop nose, Mach 2 top view.
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

  /* ---------- scene: droop nose on the runway ---------- */
  function droopScene(canvas) {
    const renderer = makeRenderer(canvas), env = studioEnv(renderer);
    const scene = new T.Scene(); scene.environment = env;
    scene.fog = new T.Fog(0xe4ded4, 140, 620);
    const cam = new T.PerspectiveCamera(30, 1, .5, 2000);
    scene.add(new T.HemisphereLight(0xfffaf2, 0x8f8a80, .45));
    const sun = new T.DirectionalLight(0xfff1e0, 2.8); sun.position.set(55, 75, 80); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 300 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
    sun.target.position.set(30, 0, 0); scene.add(sun, sun.target);
    // runway
    const ground = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.MeshStandardMaterial({ color: 0xc9c1b3, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.02; ground.receiveShadow = true; scene.add(ground);
    const rw = new T.Mesh(new T.PlaneGeometry(1400, 45), new T.MeshStandardMaterial({ color: 0x55575b, roughness: .92 }));
    rw.rotation.x = -Math.PI / 2; rw.receiveShadow = true; scene.add(rw);
    const paint = new T.MeshStandardMaterial({ color: 0xf4f2ee, roughness: .8 });
    const dash = new T.InstancedMesh(new T.BoxGeometry(18, .02, .6), paint, 70), mm = new T.Matrix4();
    for (let i = 0; i < 70; i++) { mm.makeTranslation(-600 + i * 30, .01, 0); dash.setMatrixAt(i, mm); } dash.receiveShadow = true; scene.add(dash);
    for (const z of [-21.5, 21.5]) { const e = new T.Mesh(new T.BoxGeometry(1400, .02, .45), paint); e.position.set(0, .01, z); e.receiveShadow = true; scene.add(e); }

    const ac = buildConcorde(env); ac.sight.visible = true;
    const pitch = new T.Group(); pitch.position.set(22.4, 0, 0); scene.add(pitch);  // rotate about the main wheels
    ac.plane.position.set(-22.4, 4.4, 0); pitch.add(ac.plane);

    const target = new T.Vector3();
    function update(p) {
      // nose 0 -> 5 deg, the take-off rotation, then 5 -> 12.5 deg for landing
      const deg = p < .42 ? lerp(0, 5, ease(seg(p, .1, .36))) : lerp(5, 12.5, ease(seg(p, .62, .88)));
      ac.setDroop(deg);
      pitch.rotation.z = 11 * DEG * ease(seg(p, .42, .6));
      ac.sight.material.opacity = .95 * seg(p, .14, .24);
      // camera: wide three-quarter view, then glide in beside the nose
      const c = ease(seg(p, 0, .4));
      const th = lerp(34, 78, c) * DEG, d = lerp(120, 62, c), h = lerp(18, 3.2, c);
      target.set(lerp(31, 40, c), lerp(4.5, 6, c) + 3 * ease(seg(p, .42, .6)), 0);
      cam.position.set(target.x + d * Math.cos(th), target.y + h, d * Math.sin(th));
      cam.lookAt(target);
      return deg;
    }
    return { renderer, scene, cam, update };
  }

  /* ---------- scene: Mach 2 seen from above ---------- */
  function mach2Scene(canvas) {
    const renderer = makeRenderer(canvas), env = studioEnv(renderer);
    const scene = new T.Scene(); scene.environment = env;
    const cam = new T.PerspectiveCamera(22, 1, 1, 2000); cam.up.set(1, 0, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0xd8cfd6, .85));
    const sun = new T.DirectionalLight(0xfff6ee, 1.8); sun.position.set(40, 140, 50); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 20, far: 400 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6;
    sun.target.position.set(30, 0, 0); scene.add(sun, sun.target);
    const floor = new T.Mesh(new T.PlaneGeometry(1200, 1200), new T.ShadowMaterial({ opacity: .16 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -26; floor.receiveShadow = true; scene.add(floor);
    const ac = buildConcorde(env); ac.gear.visible = false; ac.flames.forEach(f => f.visible = true); ac.setDroop(0);
    const holder = new T.Group(); holder.add(ac.plane); scene.add(holder);
    function update(p, t) {
      const rise = ease(seg(p, 0, .45)), grow = ease(seg(p, .5, .95));
      holder.position.x = lerp(-70, 0, rise);
      holder.rotation.x = Math.sin(t * .0007) * .035 + .06 * (1 - rise);     // a gentle bank while it climbs in
      const H = lerp(215, 52, grow), cx = lerp(30.5, 17, grow);
      cam.position.set(cx, H, 0); cam.lookAt(cx, 0, 0);
      ac.flames.forEach((f, i) => { f.scale.set(1, .85 + .15 * Math.sin(t * .02 + i), 1); });
    }
    return { renderer, scene, cam, update, always: true };
  }

  /* ---------- scene: the cabin walk-through ---------- */
  function cabinScene(canvas) {
    const renderer = makeRenderer(canvas, false); renderer.setClearColor(0x0b0a09, 1); renderer.toneMappingExposure = .92;
    const scene = new T.Scene(); scene.fog = new T.Fog(0x1a1511, 7, 34);
    const cam = new T.PerspectiveCamera(56, 1, .05, 120);
    const Rc = 1.35, Yc = .62, X0 = -4.2, X1 = 25.6, Lc = X1 - X0;
    const mat = (c, r = .8, extra = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, extra));
    // shell, floor, aisle runner
    const shell = new T.Mesh(new T.CylinderGeometry(Rc, Rc, Lc, 72, 1, true), mat(0xcfc7b9, .82, { side: T.BackSide }));
    shell.geometry.rotateZ(-Math.PI / 2); shell.position.set((X0 + X1) / 2, Yc, 0); shell.receiveShadow = true; scene.add(shell);
    const floor = new T.Mesh(new T.PlaneGeometry(Lc, 2.6), mat(0x23262e, 1)); floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0, 0); scene.add(floor);
    const runner = new T.Mesh(new T.PlaneGeometry(Lc, .44), mat(0x394259, .95)); runner.rotation.x = -Math.PI / 2; runner.position.set((X0 + X1) / 2, .002, 0); scene.add(runner);
    // rear and front bulkheads
    const bulkMat = mat(0xbfb6a7, .7);
    const back = new T.Mesh(new T.CircleGeometry(Rc, 64), bulkMat); back.rotation.y = Math.PI / 2; back.position.set(X0, Yc, 0); scene.add(back);
    const front = new T.Mesh(new T.CircleGeometry(Rc, 64), bulkMat); front.rotation.y = -Math.PI / 2; front.position.set(X1, Yc, 0); scene.add(front);
    // flight deck door, hinged on its left edge, with warm light behind it
    const doorPivot = new T.Group(); doorPivot.position.set(X1 - .02, 0, -.38); scene.add(doorPivot);
    const door = new T.Mesh(new T.BoxGeometry(.04, 1.86, .76), mat(0xcfc8bb, .55)); door.position.set(0, .93, .38); doorPivot.add(door);
    const handle = new T.Mesh(new T.BoxGeometry(.05, .03, .12), mat(0x8d8a84, .3, { metalness: .9 })); handle.position.set(-.04, .98, .66); doorPivot.add(handle);
    const deckGlow = new T.Mesh(new T.PlaneGeometry(.76, 1.86), new T.MeshBasicMaterial({ color: 0xffb066 })); deckGlow.rotation.y = -Math.PI / 2; deckGlow.position.set(X1 + .01, .93, 0); scene.add(deckGlow);
    const deckLight = new T.PointLight(0xffa860, 0, 9, 2); deckLight.position.set(X1 - .4, 1.2, 0); scene.add(deckLight);
    // the speed display above the door
    const lcd = document.createElement('canvas'); lcd.width = 512; lcd.height = 160;
    const lctx = lcd.getContext('2d'), lcdTex = new T.CanvasTexture(lcd); lcdTex.encoding = T.sRGBEncoding;
    const drawLCD = (mach) => {
      lctx.fillStyle = '#050505'; lctx.fillRect(0, 0, 512, 160);
      lctx.shadowColor = 'rgba(255,120,40,.9)'; lctx.shadowBlur = 14; lctx.fillStyle = '#ff9447'; lctx.textAlign = 'center';
      lctx.font = '600 66px "IBM Plex Mono", monospace'; lctx.fillText('MACH ' + mach.toFixed(2), 256, 84);
      lctx.font = '500 34px "IBM Plex Mono", monospace'; lctx.fillText('ALT 0 FT', 256, 134);
      lcdTex.needsUpdate = true;
    };
    drawLCD(0); if (document.fonts) document.fonts.ready.then(() => drawLCD(0));
    const lcdMesh = new T.Mesh(new T.PlaneGeometry(.92, .29), new T.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
    lcdMesh.rotation.y = -Math.PI / 2; lcdMesh.position.set(X1 - .03, 1.74, 0); scene.add(lcdMesh);
    const lcdFrame = new T.Mesh(new T.BoxGeometry(.04, .35, .98), mat(0x2a2a2c, .4)); lcdFrame.position.set(X1 - .01, 1.74, 0); scene.add(lcdFrame);

    // seats, four across, facing forward
    const pitchX = .96, rows = 24, firstRow = -1.2;
    const leather = mat(0x5f6779, .42, { metalness: .04 }), linen = mat(0xf1ece2, .9), armM = mat(0x2f333d, .5);
    const zs = [-.95, -.47, .47, .95];
    const prof = new T.Shape();               // side profile of one seat, facing +x
    prof.moveTo(.26, .30); prof.lineTo(.27, .46); prof.quadraticCurveTo(.27, .52, .2, .52); prof.lineTo(-.14, .5);
    prof.quadraticCurveTo(-.2, .5, -.22, .56); prof.lineTo(-.33, 1.1); prof.quadraticCurveTo(-.35, 1.2, -.44, 1.19);
    prof.lineTo(-.48, 1.16); prof.quadraticCurveTo(-.5, 1.1, -.47, 1.0); prof.lineTo(-.36, .34); prof.quadraticCurveTo(-.34, .28, -.26, .28); prof.lineTo(.26, .30);
    const seatGeo = new T.ExtrudeGeometry(prof, { depth: .36, bevelEnabled: true, bevelThickness: .045, bevelSize: .035, bevelSegments: 4, curveSegments: 10 });
    seatGeo.translate(0, 0, -.18);
    const headGeo = new T.BoxGeometry(.02, .2, .34); headGeo.translate(0, 0, 0);
    const armGeo = new T.CylinderGeometry(.035, .035, .42, 10); armGeo.rotateZ(Math.PI / 2);
    const seatM = new T.InstancedMesh(seatGeo, leather, rows * 4), headM = new T.InstancedMesh(headGeo, linen, rows * 4), armMesh = new T.InstancedMesh(armGeo, armM, rows * 6);
    const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), S1 = new T.Vector3(1, 1, 1);
    let ci = 0, ai = 0;
    for (let r = 0; r < rows; r++) {
      const x = firstRow + r * pitchX;
      zs.forEach(z => {
        M.compose(V.set(x, 0, z), Q.identity(), S1); seatM.setMatrixAt(ci, M);
        E.set(0, 0, .2); Q.setFromEuler(E);
        M.compose(V.set(x - .315, 1.04, z), Q, S1); headM.setMatrixAt(ci, M);
        ci++;
      });
      for (const z of [-1.21, -.71, -.23, .23, .71, 1.21]) { M.compose(V.set(x, .66, z), Q.identity(), S1); armMesh.setMatrixAt(ai++, M); }
    }
    [seatM, headM, armMesh].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); });

    // overhead bins with warm light strips underneath
    const binM = mat(0xb9b0a1, .7);
    for (const s of [1, -1]) {
      const bin = new T.Mesh(new T.BoxGeometry(X1 - X0 - 3, .3, .34), binM); bin.position.set((X0 + X1) / 2 - 1, 1.76, s * 1.02); bin.rotation.x = s * .55; scene.add(bin);
      const strip = new T.Mesh(new T.BoxGeometry(X1 - X0 - 3, .012, .05), new T.MeshBasicMaterial({ color: 0xd9b88f })); strip.position.set((X0 + X1) / 2 - 1, 1.6, s * .86); scene.add(strip);
      const cove = new T.Mesh(new T.BoxGeometry(X1 - X0 - 3, .01, .06), new T.MeshBasicMaterial({ color: 0xcdb497 })); cove.position.set((X0 + X1) / 2 - 1, 1.93, s * .5); scene.add(cove);
    }
    // the tiny windows, one per row, showing the bright sky outside
    const wShape = new T.Shape(); const ww = .15, wh = .22, wr = .065;
    wShape.moveTo(-ww / 2 + wr, -wh / 2); wShape.lineTo(ww / 2 - wr, -wh / 2); wShape.quadraticCurveTo(ww / 2, -wh / 2, ww / 2, -wh / 2 + wr);
    wShape.lineTo(ww / 2, wh / 2 - wr); wShape.quadraticCurveTo(ww / 2, wh / 2, ww / 2 - wr, wh / 2); wShape.lineTo(-ww / 2 + wr, wh / 2);
    wShape.quadraticCurveTo(-ww / 2, wh / 2, -ww / 2, wh / 2 - wr); wShape.lineTo(-ww / 2, -wh / 2 + wr); wShape.quadraticCurveTo(-ww / 2, -wh / 2, -ww / 2 + wr, -wh / 2);
    const skyM = new T.MeshBasicMaterial({ color: 0xd6ebff, toneMapped: false }), frameM = mat(0x8c8579, .5);
    const haloM = new T.MeshBasicMaterial({ color: 0x9cc8ff, transparent: true, opacity: .12, blending: T.AdditiveBlending, depthWrite: false });
    const wy = 1.17, wz = Math.sqrt(Rc * Rc - (wy - Yc) * (wy - Yc)) - .015;
    for (let r = 0; r < rows; r++) for (const s of [1, -1]) {
      const x = firstRow + r * pitchX + .1;
      const fr = new T.Mesh(new T.ShapeGeometry(wShape), frameM); fr.scale.set(1.42, 1.36, 1); fr.position.set(x, wy, s * (wz + .004)); fr.rotation.y = s > 0 ? Math.PI : 0; scene.add(fr);
      const w = new T.Mesh(new T.ShapeGeometry(wShape), skyM); w.position.set(x, wy, s * wz); w.rotation.y = s > 0 ? Math.PI : 0; w.scale.set(1.25, 1.25, 1); scene.add(w);
      const h = new T.Mesh(new T.CircleGeometry(.22, 24), haloM); h.position.set(x, wy, s * (wz - .03)); h.rotation.y = s > 0 ? Math.PI : 0; scene.add(h);
    }
    // lights
    scene.add(new T.AmbientLight(0xffe9d2, .1));
    scene.add(new T.HemisphereLight(0xffeedd, 0x1c1f26, .32));
    for (let x = X0 + 1.5; x < X1; x += 3.2) { const l = new T.PointLight(0xffd6a8, .55, 5.2, 2); l.position.set(x, 1.88, 0); scene.add(l); }
    for (const s of [1, -1]) { const l = new T.PointLight(0xbcd8ff, .35, 30, 1.6); l.position.set(10, 1.1, s * 1.1); scene.add(l); }

    // tour stops: where the hotspot sits, and what the camera looks at
    const STOPS = [
      { win: [.05, .17], at: new T.Vector3(5.9, 1.05, .71), look: null },
      { win: [.20, .32], at: new T.Vector3(9.8, wy, -wz), look: new T.Vector3(11.5, .95, -1.3) },
      { win: [.35, .47], at: new T.Vector3(14.5, 1.96, 0), look: new T.Vector3(18, 2.4, 0) },
      { win: [.50, .66], at: new T.Vector3(X1, 1.74, 0), look: new T.Vector3(X1, 1.6, 0) },
      { win: [.72, .96], at: new T.Vector3(X1, 1.05, 0), look: new T.Vector3(X1, 1.05, 0) },
    ];
    const w = (p, [a, b]) => seg(p, a - .03, a) * (1 - seg(p, b, b + .03));
    const look = new T.Vector3(), tmp = new T.Vector3();
    function update(p) {
      const walk = ease(seg(p, 0, .86));
      const x = lerp(X0 + 1.1, 20.6, walk);
      cam.position.set(x, 1.56 + Math.sin(x * 2.4) * .012, Math.sin(x * .6) * .03);
      look.set(x + 8, 1.28, 0);
      STOPS.forEach(s => { if (s.look) { const k = w(p, s.win); tmp.copy(s.look).sub(look).multiplyScalar(k); look.add(tmp); } });
      // after the display stop, keep the eyes on the front wall
      const hold = seg(p, .62, .7); tmp.set(X1, 1.3, 0).sub(look).multiplyScalar(hold * (1 - w(p, STOPS[3].win))); look.add(tmp);
      cam.lookAt(look);
      const open = ease(seg(p, .76, .92));
      doorPivot.rotation.y = -open * 1.45;
      deckLight.intensity = open * 2.2;
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
  let cabin, droop, mach;
  try {
    cabin = add('cabin3d', cabinScene, 'cabin');
    droop = add('droop3d', droopScene, 'droop');
    mach = add('mach3d', mach2Scene, 'mach2');
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
      let deg = null;
      if (droop && visible(droop)) { deg = droop.update(P.droop); droop.renderer.render(droop.scene, droop.cam); }
      if (mach && visible(mach)) { mach.update(P.mach2, t); mach.renderer.render(mach.scene, mach.cam); }
      return deg;
    },
    animating: () => mach && visible(mach),
    resize
  };
})();
