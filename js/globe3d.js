/* The finale globe in Three.js: a dark Earth with warm grey land (outlines from Natural Earth, assets/land.json),
   the Concorde crossing drawn as an orange arc and the slower subsonic crossing as a white one. After the landing
   the camera pulls back and Concorde's other routes draw in gold; the route list turns the globe to each one,
   and the globe can be turned by dragging it.
   Globe axes: +y north; longitude -90 faces +z before any rotation. */
(() => {
  if (!window.THREE) return;
  const canvas = document.getElementById('globe3d'); if (!canvas) return;
  const section = document.getElementById('finale');
  const T = THREE, DEG = Math.PI / 180;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { console.error(e); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 5.2);
  const tilt = new T.Group(), spin = new T.Group(); tilt.add(spin); scene.add(tilt);
  scene.add(new T.AmbientLight(0xffffff, .2));
  const key = new T.DirectionalLight(0xfff1e4, 1.15); key.position.set(-3, 2.6, 4); scene.add(key);

  /* ---------- surface: an equirectangular canvas, repainted once the land outlines arrive ---------- */
  const tc = document.createElement('canvas'); tc.width = 2048; tc.height = 1024;
  const tex = new T.CanvasTexture(tc); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
  function paint(rings) {
    const W = tc.width, H = tc.height, g = tc.getContext('2d');
    g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(246,241,231,.06)'; g.lineWidth = 1.5;
    for (let lon = -180; lon < 180; lon += 15) { const x = (lon + 180) / 360 * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let lat = -75; lat <= 75; lat += 15) { const y = (90 - lat) / 180 * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (rings) {
      g.fillStyle = '#756a63'; g.strokeStyle = '#a3978e'; g.lineWidth = 1.2; g.lineJoin = 'round';
      for (const r of rings) {
        // unwrap rings that cross the antimeridian, then draw them once on each side of the seam
        const xs = [r[0]]; for (let i = 2; i < r.length; i += 2) { let d = r[i] - r[i - 2]; d -= 360 * Math.round(d / 360); xs.push(xs[xs.length - 1] + d); }
        const lo = Math.min(...xs), hi = Math.max(...xs);
        for (const off of (hi > 180 ? [0, -360] : lo < -180 ? [0, 360] : [0])) {
          g.beginPath();
          xs.forEach((lon, k) => { const x = (lon + off + 180) / 360 * W, y = (90 - r[2 * k + 1]) / 180 * H; k ? g.lineTo(x, y) : g.moveTo(x, y); });
          g.closePath(); g.fill(); g.stroke();
        }
      }
    }
    tex.needsUpdate = true;
  }
  paint(null);
  spin.add(new T.Mesh(new T.SphereGeometry(1, 96, 64), new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })));
  fetch('assets/land.json').then(r => r.json()).then(rings => { paint(rings); api.dirty = true; }).catch(e => console.error(e));

  // a thin warm rim of atmosphere, brightest against the limb
  const air = new T.Mesh(new T.SphereGeometry(1.12, 64, 48), new T.ShaderMaterial({
    side: T.BackSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'varying vec3 n; void main(){ float d = smoothstep(0., .45, -n.z); gl_FragColor = vec4(.96, .86, .76, d * d * .3); }'
  }));
  tilt.add(air);

  /* ---------- the two crossings ---------- */
  const ll = (lat, lon, r = 1) => { const ph = (90 - lat) * DEG, th = (lon + 180) * DEG; return new T.Vector3(-r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)); };
  const LHR = ll(51.47, -.45), JFK = ll(40.64, -73.78);
  function arc(a, b, height, radius, material) {              // great circle from a to b, lifted off the surface in the middle
    const w = a.angleTo(b), pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, v = a.clone().multiplyScalar(Math.sin((1 - t) * w)).add(b.clone().multiplyScalar(Math.sin(t * w))).divideScalar(Math.sin(w));
      pts.push(v.multiplyScalar(1.004 + height * Math.sin(Math.PI * t)));
    }
    const curve = new T.CatmullRomCurve3(pts), m = new T.Mesh(new T.TubeGeometry(curve, 200, radius, 8, false), material);
    m.userData = { curve, count: m.geometry.index.count }; spin.add(m); return m;
  }
  const flame = new T.MeshBasicMaterial({ color: 0xff5a1f }), white = new T.MeshBasicMaterial({ color: 0xf6f1e7, transparent: true, opacity: .5 });
  const fast = arc(LHR, JFK, .14, .0046, flame), slow = arc(LHR, JFK, .03, .0028, white);
  const dot = (v, r, m) => { const o = new T.Mesh(new T.SphereGeometry(r, 16, 12), m); o.position.copy(v).multiplyScalar(1.004); spin.add(o); return o; };
  const paper = new T.MeshBasicMaterial({ color: 0xf6f1e7 });
  dot(LHR, .009, paper); const jfkDot = dot(JFK, .009, paper);
  const head = dot(LHR, .011, flame), slowHead = dot(LHR, .007, paper);
  const drawTo = (m, k, tip) => { m.geometry.setDrawRange(0, Math.floor(m.userData.count * k / 48) * 48); tip.position.copy(m.userData.curve.getPoint(clamp(k))); tip.visible = k > .002; };

  /* ---------- Concorde's network: after the landing, the other routes it flew draw themselves in gold ---------- */
  const AP = { LHR: [51.47, -.45, 'London'], JFK: [40.64, -73.78, 'New York'], CDG: [49.01, 2.55, 'Paris'], IAD: [38.95, -77.46, 'Washington'],
    BAH: [26.27, 50.63, 'Bahrain'], SIN: [1.36, 103.99, 'Singapore'], DKR: [14.74, -17.49, 'Dakar'], GIG: [-22.81, -43.25, 'Rio de Janeiro'],
    CCS: [10.6, -66.99, 'Caracas'], BGI: [13.07, -59.49, 'Barbados'], MIA: [25.79, -80.29, 'Miami'], DFW: [32.9, -97.04, 'Dallas/Fort Worth'], MEX: [19.44, -99.07, 'Mexico City'] };
  const ROUTES = window.CONCORDE_ROUTES = [
    { id: 'lhr-jfk', legs: [['LHR', 'JFK']], own: true }, { id: 'cdg-jfk', legs: [['CDG', 'JFK']] },
    { id: 'lhr-iad', legs: [['LHR', 'IAD']] }, { id: 'cdg-iad', legs: [['CDG', 'IAD']] },
    { id: 'lhr-sin', legs: [['LHR', 'BAH'], ['BAH', 'SIN']] }, { id: 'cdg-gig', legs: [['CDG', 'DKR'], ['DKR', 'GIG']] },
    { id: 'cdg-ccs', legs: [['CDG', 'CCS']] }, { id: 'lhr-bgi', legs: [['LHR', 'BGI']] },
    { id: 'iad-mia', legs: [['IAD', 'MIA']] }, { id: 'iad-dfw', legs: [['IAD', 'DFW']] }, { id: 'iad-mex', legs: [['IAD', 'MEX']] }];
  const gold = () => new T.MeshBasicMaterial({ color: 0xd7b46a, transparent: true, opacity: .9 });
  ROUTES.forEach(r => {
    r.mat = r.own ? flame : gold();
    r.arcs = r.own ? [] : r.legs.map(([a, b]) => { const A = ll(AP[a][0], AP[a][1]), B = ll(AP[b][0], AP[b][1]); return arc(A, B, .03 + .05 * A.angleTo(B), .0032, r.mat); });
    r.arcs.forEach(m => m.geometry.setDrawRange(0, 0));
    const ids = [...new Set(r.legs.flat())], mid = ids.reduce((acc, id) => acc.add(ll(AP[id][0], AP[id][1])), new T.Vector3()).normalize();
    r.ids = ids; r.lat = 90 - Math.acos(mid.y) / DEG; r.lon = Math.atan2(mid.z, -mid.x) / DEG - 180;
  });
  const apDots = {};
  Object.keys(AP).forEach(id => { if (id === 'LHR' || id === 'JFK') return; apDots[id] = dot(ll(AP[id][0], AP[id][1]), .007, paper); apDots[id].visible = false; });
  // labels for every airport in the network (LHR and JFK already have theirs)
  const netLabels = Object.keys(AP).filter(id => id !== 'LHR' && id !== 'JFK').map(id => {
    const el = document.createElement('span'); el.className = 'g-label g-net'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = `<b>${id}</b>`;
    canvas.parentNode.appendChild(el); return [el, ll(AP[id][0], AP[id][1]), id];
  });
  let focus = null, fLon = 0, fLat = 0, dragLon = 0, dragLat = 0;
  // drag the globe to turn it
  { let px = null, py = 0;
    canvas.addEventListener('pointerdown', e => { px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add('held'); });
    canvas.addEventListener('pointermove', e => { if (px === null) return; dragLon += (e.clientX - px) * .25; dragLat = clamp(dragLat + (e.clientY - py) * .18, -35, 35); px = e.clientX; py = e.clientY; api.dirty = true; });
    const up = () => { px = null; canvas.classList.remove('held'); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); }

  // HTML labels pinned to the two airports
  const labels = [[document.getElementById('g-lhr'), LHR], [document.getElementById('g-jfk'), JFK]];
  const v = new T.Vector3(), nrm = new T.Vector3();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);
  const visible = () => { const r = section.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

  let endK = 0;
  const api = window.G3D = {
    dirty: false,
    // P.arrival scrubs the approach and the arcs; P.endIn (0..1) is how far the closing section has come in
    update(P, t) {
      if (!visible()) return;
      api.dirty = false;
      const p = P.arrivalA, pn = P.net || 0; endK = P.endIn || 0;
      const enter = ease(seg(p, 0, .35)), e = ease(endK), kN = ease(seg(pn, 0, .3));
      const fit = clamp(cam.aspect / 1.55, .4, 1);              // keep the globe inside a portrait screen
      // the crossing view, then the network view: pulled back over the Atlantic, or turned to the route in focus
      const targetLon = focus ? focus.lon : -32, targetLat = focus ? clamp(focus.lat, -10, 45) : 26;
      const k = RM ? 1 : .08; fLon += (targetLon - fLon) * k; fLat += (targetLat - fLat) * k;
      if (Math.abs(targetLon - fLon) > .05 || Math.abs(targetLat - fLat) > .05) api.dirty = true;
      const lonA = lerp(12, -38, enter) - 12 * ease(seg(p, .35, 1));
      const lon = lerp(lonA, fLon, kN) - 22 * e * (1 - kN) + dragLon - (RM ? 0 : endK * t * .0012);
      const lat = lerp(lerp(26, 42, enter), fLat, kN) - 8 * e * (1 - kN) + dragLat;
      const P0 = ll(0, lon);
      spin.rotation.y = -Math.atan2(P0.x, P0.z);
      tilt.rotation.x = lat * DEG;
      const s = lerp(lerp(lerp(1.05, 1.36, enter), 1.12, e), .92, kN) * fit;
      tilt.scale.setScalar(s);
      tilt.position.set(lerp(lerp(lerp(2.7, 1.0, enter), 0, e) * fit * (fit < 1 ? .2 : 1), fit < 1 ? 0 : .78, kN),   // the network sits right of the route list
         lerp(lerp(lerp(-1.3, -.72, enter), -.28, e), -.12, kN) * (fit < 1 ? .55 : 1), 0);
      const draw = ease(seg(p, .3, .7));
      drawTo(fast, draw, head);
      drawTo(slow, (draw * .5 + .5 * ease(seg(endK, .1, .9))) * (1 - kN), slowHead);     // the subsonic jet bows out when the network comes in
      slow.visible = slowHead.visible = kN < .99;
      jfkDot.scale.setScalar(1 + .5 * seg(draw, .9, 1));
      // the other routes draw one after another; the route in focus is bright, the rest step back
      ROUTES.forEach((r, i) => {
        if (r.own) return;
        const d = ease(seg(pn, .12 + i * .045, .42 + i * .045));
        r.arcs.forEach((m, j) => m.geometry.setDrawRange(0, Math.floor(m.userData.count * clamp(d * r.arcs.length - j) / 48) * 48));
        r.mat.opacity = focus ? (focus === r ? 1 : .18) : .85;
        r.ids.forEach(id => { if (apDots[id]) apDots[id].visible = d > .02; });
      });
      flame.transparent = true; flame.opacity = focus && !focus.own ? .3 : 1;
      canvas.style.opacity = lerp(1, .55, e);
      renderer.render(scene, cam);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const place = (el, at) => {
        v.copy(at).multiplyScalar(1.004); spin.localToWorld(v);
        nrm.copy(v).sub(tilt.position).normalize();
        const facing = nrm.dot(cam.position.clone().sub(v).normalize());
        v.project(cam);
        el.style.transform = `translate(${(v.x + 1) / 2 * W}px, ${(1 - v.y) / 2 * H}px)`;
        return seg(facing, .05, .3);
      };
      labels.forEach(([el, at], i) => {
        if (!el) return;
        const f = place(el, at), base = i ? seg(draw, .9, 1) : seg(p, .2, .32);
        const inFocus = !focus || focus.ids.includes(i ? 'JFK' : 'LHR');
        el.style.opacity = f * lerp(base * (1 - e), inFocus ? 1 : .3, kN);
      });
      netLabels.forEach(([el, at, id]) => {
        if (kN <= 0) { el.style.opacity = 0; return; }
        const r = ROUTES.find(q => q.ids.includes(id) && !q.own), d = seg(pn, .12 + ROUTES.indexOf(r) * .045, .3 + ROUTES.indexOf(r) * .045);
        el.style.opacity = place(el, at) * d * (focus ? (focus.ids.includes(id) ? 1 : .2) : .75);
      });
    },
    focus(id) { focus = ROUTES.find(r => r.id === id) || null; api.dirty = true; },
    animating: () => visible() && ((!RM && endK > 0) || api.dirty),
    resize
  };
})();
