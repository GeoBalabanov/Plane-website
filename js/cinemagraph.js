/* The supersonic scene: a sea of cloud rendered live as real volumetric cloud, so it stays sharp at any screen size
   and genuinely moves. The camera flies forward above the deck, faster as the Mach number climbs; the cloud layer
   falls away towards the horizon like the curve of the Earth, under the deep blue of high altitude.
   Crossing Mach 1 sends a shock wave through the view and fires "concorde:boom" for the sound.
   (The Earth in the cruise scene is real ISS footage; this file only starts and pauses that video.) */
(() => {
  const T = window.THREE; if (!T) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- a tileable 3D noise volume: billowy (inverted cell) noise shaped by smooth noise, the usual cloud recipe ---------- */
  function noiseVolume(N = 64) {
    const data = new Uint8Array(N * N * N);
    const rnd = (x, y, z, s) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const value = (x, y, z, P, s) => {                        // smooth value noise with period P
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
      const r = (a, b, c) => rnd(((xi + a) % P + P) % P, ((yi + b) % P + P) % P, ((zi + c) % P + P) % P, s);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(r(0, 0, 0), r(1, 0, 0), u), l(r(0, 1, 0), r(1, 1, 0), u), v), l(l(r(0, 0, 1), r(1, 0, 1), u), l(r(0, 1, 1), r(1, 1, 1), u), v), w);
    };
    const C = 6, pts = [];                                     // cell noise: one point per cell, wrapped
    for (let i = 0; i < C * C * C; i++) pts.push([rnd(i, 1, 2, 9), rnd(i, 3, 4, 9), rnd(i, 5, 6, 9)]);
    const cell = (x, y, z) => {
      const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z); let d = 9;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const gx = cx + a, gy = cy + b, gz = cz + c, p = pts[((gx % C + C) % C) + ((gy % C + C) % C) * C + ((gz % C + C) % C) * C * C];
        const dx = gx + p[0] - x, dy = gy + p[1] - y, dz = gz + p[2] - z; d = Math.min(d, dx * dx + dy * dy + dz * dz);
      }
      return Math.sqrt(d);
    };
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N, fy = y / N, fz = z / N;
      let f = 0, a = .55, P = 4;
      for (let o = 0; o < 4; o++) { f += a * value(fx * P, fy * P, fz * P, P, o); a *= .5; P *= 2; }
      const w = 1 - Math.min(1, cell(fx * C, fy * C, fz * C) * 1.1) * .5 - Math.min(1, cell(fx * C * 2, fy * C * 2, fz * C * 2) * 1.1) * .25;
      const v = clamp((f - (1 - w)) / Math.max(.05, w) * .9 + .1);   // remap the smooth noise into the billows
      data[x + y * N + z * N * N] = v * 255;
    }
    const tex = new T.Data3DTexture(data, N, N, N);
    tex.format = T.RedFormat; tex.minFilter = tex.magFilter = T.LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = T.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
    return tex;
  }

  const FRAG = `
    precision highp float; precision highp sampler3D;
    uniform sampler3D vol; uniform vec2 view; uniform float time, travel, lift, shock, shake;
    uniform vec3 sunDir;
    in vec2 vUv; layout(location = 0) out vec4 outColor;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    const float K = .0007;                                     // how fast the deck falls away with distance: the curve of the Earth
    vec3 skyCol(vec3 d){
      float y = max(d.y + .02, 0.);
      vec3 c = mix(vec3(.64, .78, .92), vec3(.1, .27, .58), pow(y, .42));      // bright haze at the horizon, deep blue above
      c = mix(c, vec3(.03, .1, .3), smoothstep(.35, 1., y));                   // darker still overhead: thin air
      float s = max(dot(d, sunDir), 0.);
      return c + vec3(1., .9, .75) * (pow(s, 40.) * .35 + pow(s, 800.) * 4.);
    }
    float density(vec3 p, vec3 cam){
      vec2 dx = p.xz - cam.xz;
      float h = (p.y + K * dot(dx, dx)) / 1.1;                  // height inside the deck, 0 to 1
      if (h < 0. || h > 1.) return 0.;
      vec3 q = p * vec3(.3, .5, .3) + vec3(time * .012, 0., time * .004);
      float n = texture(vol, q).r * .66 + texture(vol, q * 2.7 + .37).r * .34;
      float shape = smoothstep(0., .25, h) * (1. - smoothstep(.5, 1., h));     // flat-ish base, rounded tops
      float floorD = (1. - smoothstep(.05, .5, h)) * smoothstep(0., .08, h) * .32;   // a continuous deck under the billows
      return clamp((n * shape + floorD - .27) * 5., 0., 1.);
    }
    void main(){
      float va = view.x / view.y;
      vec2 uv = vUv;
      // shock wave: a ring of bent light opening from the centre, and a shake
      vec2 sv = (uv - .5) * vec2(va, 1.); float r = length(sv);
      float R = shock * 1.6, rr = (r - R) * 14., ring = shock > 0. ? exp(-rr * rr) * (1. - shock) : 0.;
      uv += normalize(sv + 1e-5) * ring * .03 / vec2(va, 1.);
      uv += (vec2(hash(vec2(time * 31., 1.)), hash(vec2(2., time * 29.))) - .5) * shake * .01;
      // the camera: above the deck, looking forward and a little down
      vec3 cam = vec3(0., 2.1 + lift, -travel);
      vec3 fw = normalize(vec3(0., -.2 - lift * .06, -1.)), rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
      vec2 s = (uv * 2. - 1.) * vec2(va, 1.) * .55;
      vec3 d = normalize(fw + rt * s.x + up * s.y);
      vec3 col = vec3(0.); float tr = 1., stp = .035;
      float t = .05 + hash(gl_FragCoord.xy) * .03;                             // a fixed, fine jitter: no banding, no crawling grain
      for (int i = 0; i < 110; i++) {
        vec3 p = cam + d * t;
        float de = density(p, cam);
        if (de > .002) {
          // light: how much cloud lies between this point and the sun
          float l = density(p + sunDir * .12, cam) + density(p + sunDir * .35, cam) * .8;
          float sun = exp(-l * 3.) * (.35 + .65 * (1. - exp(-de * 6.)));         // beer and powder: bright edges, soft cores
          vec3 c = mix(vec3(.3, .38, .54), vec3(1.12, 1.05, .96) * 1.7, sun);
          float a = 1. - exp(-de * 7. * stp);
          col += tr * a * c; tr *= 1. - a;
          if (tr < .02) break;
        }
        vec2 dx = p.xz - cam.xz;
        if (p.y + K * dot(dx, dx) > 1.15 && d.y > 0.) break;  // above the deck and climbing: only sky from here on
        stp = max(.035, t * .03); t += stp;
        if (t > 140.) break;
      }
      vec3 sky = skyCol(d);
      float haze = 1. - exp(-t * .02);
      col = col + tr * sky;
      col = mix(col, skyCol(vec3(d.x, .0, d.z)) * vec3(.96, .98, 1.), haze * (1. - tr) * .85);   // distant cloud melts into the haze
      col += ring * .3 + shock * (1. - shock) * .2;
      col = 1. - exp(-col * 1.25);                                               // soft filmic curve
      col = pow(col, vec3(.92));
      vec2 q = vUv - .5; col *= 1. - dot(q, q) * .35;                            // a little vignette
      outColor = vec4(col, 1.);
    }`;

  function cloudsScene(img) {
    const cv = document.createElement('canvas');
    cv.className = 'clouds3d'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    img.after(cv);
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (e) { cv.remove(); return null; }
    if (!renderer.capabilities.isWebGL2) { renderer.dispose(); cv.remove(); return null; }   // the volume needs WebGL 2: keep the photo
    const U = { vol: { value: noiseVolume() }, view: { value: new T.Vector2(1, 1) }, time: { value: 0 }, travel: { value: 0 }, lift: { value: 0 },
      shock: { value: 0 }, shake: { value: 0 }, sunDir: { value: new T.Vector3(-.55, .42, -.72).normalize() } };
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms: U, fragmentShader: FRAG, glslVersion: T.GLSL3,
      vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.); }' })));
    // the volume is costly per pixel: draw it at a scale that keeps the frame rate, the soft cloud hides the upscale
    let scale = Math.min(devicePixelRatio || 1, 2) * (innerWidth < 720 ? .55 : .62), slow = 0, fast = 0, last = 0;
    function size() { const w = cv.clientWidth, h = cv.clientHeight; if (w && h) { renderer.setPixelRatio(scale); renderer.setSize(w, h, false); U.view.value.set(w, h); } }
    size(); addEventListener('resize', size);
    img.style.visibility = 'hidden';
    return { U, render(ms) {
      const dt = last ? ms - last : 16; last = ms;
      // keep it smooth: drop the resolution a step if frames are slow, raise it again when there is room
      if (dt > 26) { if (++slow > 20 && scale > .35) { scale *= .85; slow = 0; size(); } } else slow = 0;
      if (dt < 15) { if (++fast > 90 && scale < 1.1) { scale *= 1.08; fast = 0; size(); } } else fast = 0;
      renderer.render(scene, cam);
    } };
  }

  const progress = sec => { const r = sec.getBoundingClientRect(), span = sec.offsetHeight - innerHeight; return span > 0 ? clamp(-r.top / span) : 0; };
  const onScreen = sec => { const r = sec.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

  const boomSec = document.getElementById('boom'), cruiseSec = document.getElementById('cruise');
  const clouds = boomSec && cloudsScene(document.getElementById('boom-photo'));
  // the Earth video plays only while its scene is on screen, and stays on its first frame for reduced motion
  const earthVid = document.getElementById('earth');
  if (earthVid && earthVid.tagName === 'VIDEO') {
    if (RM) { earthVid.removeAttribute('autoplay'); earthVid.pause(); }
    else new IntersectionObserver(([e]) => { if (e.isIntersecting) earthVid.play().catch(() => {}); else earthVid.pause(); }).observe(cruiseSec);
  }

  // Mach 1 sits where the readout in site.js passes 1.00: progress .304 of the supersonic scene
  const MACH1 = .304;
  let lastP = 0, boomAt = -1e9, travel = 0, lastMs = 0;
  function frame(ms) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (ms - lastMs) / 1000 || 0); lastMs = ms;
    if (clouds && onScreen(boomSec)) {
      const p = progress(boomSec);
      if (lastP < MACH1 && p >= MACH1 && !RM) { boomAt = ms; dispatchEvent(new CustomEvent('concorde:boom')); }
      lastP = p;
      const k = (ms - boomAt) / 1400;                          // the wave takes 1.4 s to cross the screen
      const U = clouds.U;
      U.shock.value = k >= 0 && k < 1 ? k : 0;
      U.shake.value = k >= 0 && k < 1 ? Math.pow(1 - k, 2) : 0;
      // ground speed grows with the Mach number; scrolling adds a push so the scroll itself feels like flying
      travel += RM ? 0 : dt * (1.2 + 3.4 * p);
      U.travel.value = travel + p * 40; U.lift.value = p * .55;   // and the aircraft climbs away from the deck
      U.time.value = RM ? 0 : ms / 1000;
      clouds.render(ms);
    } else if (boomSec) lastP = progress(boomSec);
  }
  requestAnimationFrame(frame);
})();
