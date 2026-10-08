/* The finale globe in Three.js: a dark Earth with warm grey land (outlines from Natural Earth, assets/land.json),
   the Concorde crossing drawn as an orange arc and the slower subsonic crossing as a white one.
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
      const p = P.arrival; endK = P.endIn || 0;
      const enter = ease(seg(p, 0, .35)), e = ease(endK);
      const fit = clamp(cam.aspect / 1.55, .4, 1);              // keep the globe inside a portrait screen
      const lon = lerp(12, -38, enter) - 12 * ease(seg(p, .35, 1)) - 22 * e - (RM ? 0 : endK * t * .0012);
      const lat = lerp(26, 42, enter) - 8 * e;
      const P0 = ll(0, lon);
      spin.rotation.y = -Math.atan2(P0.x, P0.z);
      tilt.rotation.x = lat * DEG;
      const s = lerp(lerp(1.05, 1.36, enter), 1.12, e) * fit;
      tilt.scale.setScalar(s);
      tilt.position.set(lerp(lerp(2.7, 1.0, enter), 0, e) * fit * (fit < 1 ? .2 : 1), lerp(lerp(-1.3, -.72, enter), -.28, e) * (fit < 1 ? .55 : 1), 0);
      const draw = ease(seg(p, .3, .7));
      drawTo(fast, draw, head);
      drawTo(slow, draw * .5 + .5 * ease(seg(endK, .1, .9)), slowHead);     // by the time Concorde lands, the subsonic jet is half way
      jfkDot.scale.setScalar(1 + .5 * seg(draw, .9, 1));
      canvas.style.opacity = lerp(1, .55, e);
      renderer.render(scene, cam);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      labels.forEach(([el, at], i) => {
        if (!el) return;
        v.copy(at).multiplyScalar(1.004); spin.localToWorld(v);
        nrm.copy(v).sub(tilt.position).normalize();
        const facing = nrm.dot(cam.position.clone().sub(v).normalize());
        v.project(cam);
        el.style.transform = `translate(${(v.x + 1) / 2 * W}px, ${(1 - v.y) / 2 * H}px)`;
        el.style.opacity = seg(facing, .05, .3) * (i ? seg(draw, .9, 1) : seg(p, .2, .32)) * (1 - e);
      });
    },
    animating: () => !RM && endK > 0 && visible(),
    resize
  };
})();
