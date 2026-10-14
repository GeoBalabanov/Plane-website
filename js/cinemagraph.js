/* The supersonic scene: a sea of cloud rendered live as real volumetric cloud, so it stays sharp at any screen size
   and genuinely moves. The camera flies forward above the deck, faster as the Mach number climbs; the cloud layer
   falls away towards the horizon like the curve of the Earth, under the deep blue of high altitude.
   Crossing Mach 1 sends a shock wave through the view and fires "concorde:boom" for the sound.
   (The Earth in the cruise scene is real ISS footage; this file only starts and pauses that video.) */
(() => {
  const T = window.THREE; if (!T) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- a tileable 3D noise volume, two channels, the usual recipe for real-time cloud:
     red = smooth noise carved by billowy cell noise (the big rounded heaps), green = finer billows (wispy edges) ---------- */
  function noiseVolume(N = 64) {
    const rnd = (x, y, z, s) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const value = (x, y, z, P, s) => {                        // smooth value noise with period P
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10), w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
      const r = (a, b, c) => rnd(((xi + a) % P + P) % P, ((yi + b) % P + P) % P, ((zi + c) % P + P) % P, s);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(r(0, 0, 0), r(1, 0, 0), u), l(r(0, 1, 0), r(1, 1, 0), u), v), l(l(r(0, 0, 1), r(1, 0, 1), u), l(r(0, 1, 1), r(1, 1, 1), u), v), w);
    };
    const cellSet = (C, seed) => { const pts = []; for (let i = 0; i < C * C * C; i++) pts.push([rnd(i, 1, 2, seed), rnd(i, 3, 4, seed), rnd(i, 5, 6, seed)]);
      return (x, y, z) => {                                    // distance to the nearest point, wrapped every C cells
        x *= C; y *= C; z *= C; const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z); let d = 9;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const gx = cx + a, gy = cy + b, gz = cz + c, p = pts[((gx % C + C) % C) + ((gy % C + C) % C) * C + ((gz % C + C) % C) * C * C];
          const dx = gx + p[0] - x, dy = gy + p[1] - y, dz = gz + p[2] - z; d = Math.min(d, dx * dx + dy * dy + dz * dz);
        }
        return Math.min(1, Math.sqrt(d));
      }; };
    const c1 = cellSet(4, 9), c2 = cellSet(8, 10), c3 = cellSet(16, 11), c4 = cellSet(32, 12);
    const R = new Float32Array(N * N * N), G = new Float32Array(N * N * N);
    for (let z = 0, i = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
      const fx = x / N, fy = y / N, fz = z / N;
      let f = 0, a = .5, P = 4;
      for (let o = 0; o < 4; o++) { f += a * value(fx * P, fy * P, fz * P, P, o); a *= .5; P *= 2; }
      const wl = 1 - (c1(fx, fy, fz) * .625 + c2(fx, fy, fz) * .25 + c3(fx, fy, fz) * .125);    // low billows
      R[i] = f + (wl - 1) * .45 + wl * .25;                   // smooth noise, pushed into round heaps by the billows
      G[i] = 1 - (c2(fx, fy, fz) * .625 + c3(fx, fy, fz) * .25 + c4(fx, fy, fz) * .125);
    }
    const data = new Uint8Array(N * N * N * 2);
    for (const [ch, A] of [[0, R], [1, G]]) {                 // stretch each channel to the full 0..1 range
      let lo = 1e9, hi = -1e9; for (const v of A) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (let i = 0; i < A.length; i++) data[i * 2 + ch] = Math.round((A[i] - lo) / (hi - lo) * 255);
    }
    const tex = new T.Data3DTexture(data, N, N, N);
    tex.format = T.RGFormat; tex.minFilter = tex.magFilter = T.LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = T.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
    return tex;
  }

  const FRAG = `
    precision highp float; precision highp sampler3D;
    uniform sampler3D vol; uniform vec2 view; uniform float time, travel, lift, shock, shake;
    uniform vec3 sunDir;
    in vec2 vUv; layout(location = 0) out vec4 outColor;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float remap(float v, float a, float b, float c, float d){ return c + (v - a) / (b - a) * (d - c); }
    const float K = .0009;                                     // how fast the deck falls away with distance: the curve of the Earth
    const float H = 1.5;                                       // depth of the cloud layer
    const vec3 SUN = vec3(1., .93, .84);
    vec3 skyCol(vec3 d){
      float y = max(d.y + .03, 0.);
      vec3 c = mix(vec3(.7, .8, .9), vec3(.16, .34, .66), pow(y, .5));        // pale haze at the horizon, deep blue above
      c = mix(c, vec3(.05, .14, .38), smoothstep(.3, 1., y));                  // darker overhead: thin air
      float s = max(dot(d, sunDir), 0.);
      return c + SUN * (pow(s, 12.) * .18 + pow(s, 600.) * 3.);
    }
    float density(vec3 p, vec3 cam, bool fine){
      vec2 dx = p.xz - cam.xz;
      float h = (p.y + K * dot(dx, dx)) / H;                   // height inside the layer, 0 to 1
      if (h < 0. || h > 1.) return 0.;
      vec3 w = p + vec3(time * .02, 0., time * .006);          // a slow wind turns the cloud over
      float cov = texture(vol, vec3(w.xz * .021, .37)).r;      // where the big heaps are: a weather map
      cov = smoothstep(.2, .8, cov);
      float top = mix(.4, 1., cov);                      // taller heaps where there is more cloud
      float hg = smoothstep(0., .07, h) * (1. - smoothstep(top * .45, top, h));   // flat base, rounded tops
      float b = texture(vol, w * vec3(.13, .19, .13)).r;
      float d = clamp(remap(b * hg, .5 - cov * .36, 1., 0., 1.), 0., 1.);
      if (fine && d > 0.) {                                    // wear away the edges into soft wisps
        float e = texture(vol, w * .62 + vec3(0., time * .01, 0.)).g;
        d = clamp(remap(d, (1. - e) * .32 * (1. - h * .4), 1., 0., 1.), 0., 1.);
      }
      return d;
    }
    float hgPhase(float c, float g){ float g2 = g * g; return (1. - g2) / pow(1. + g2 - 2. * g * c, 1.5) * .0796; }
    void main(){
      float va = view.x / view.y;
      vec2 uv = vUv;
      // shock wave: a ring of bent light opening from the centre, and a shake
      vec2 sv = (uv - .5) * vec2(va, 1.); float r = length(sv);
      float R = shock * 1.6, rr = (r - R) * 14., ring = shock > 0. ? exp(-rr * rr) * (1. - shock) : 0.;
      uv += normalize(sv + 1e-5) * ring * .03 / vec2(va, 1.);
      uv += (vec2(hash(vec2(time * 31., 1.)), hash(vec2(2., time * 29.))) - .5) * shake * .01;
      // the camera: just above the tops, looking forward and a little down
      vec3 cam = vec3(0., H + .35 + lift, -travel);
      vec3 fw = normalize(vec3(0., -.17 - lift * .05, -1.)), rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
      vec2 s = (uv * 2. - 1.) * vec2(va, 1.) * .5;
      vec3 d = normalize(fw + rt * s.x + up * s.y);
      vec3 sky = skyCol(d);
      vec3 col = vec3(0.); float tr = 1., tHit = -1., under = 0.;
      if (d.y < -.002) {
        float cosT = dot(d, sunDir), phase = mix(hgPhase(cosT, .55), hgPhase(cosT, -.2), .35) * 3.;
        float t = (cam.y - H) / -d.y;                          // skip the clear air above the layer
        float stp = .05;
        t += stp * hash(gl_FragCoord.xy);                      // a fixed sub-step offset: no banding
        for (int i = 0; i < 100; i++) {
          vec3 p = cam + d * t;
          vec2 dx = p.xz - cam.xz;
          float y = p.y + K * dot(dx, dx);
          if (y < -.05 || t > 160.) break;                      // through the bottom of the layer
          float de = density(p, cam, t < 40.);
          if (de > .003) {
            if (tHit < 0.) tHit = t;
            // light: how much cloud lies between this point and the sun, in four growing steps
            float od = 0., ls = .07;
            for (int j = 0; j < 4; j++) { od += density(p + sunDir * ls, cam, false) * ls; ls *= 2.1; }
            od *= 5.;
            float sun = max(exp(-od), exp(-od * .22) * .45) * (1. - exp(-de * 18.) * .55);   // light through the cloud, with soft edges glowing
            float hh = clamp(y / H, 0., 1.);
            vec3 amb = mix(vec3(.3, .38, .55), vec3(.72, .82, 1.), hh) * .7;
            vec3 c = amb + SUN * 4. * sun * phase;
            float a = 1. - exp(-de * 9. * stp);
            col += tr * a * c; tr *= 1. - a;
            if (tr < .015) break;
          }
          stp = .05 + t * .018; t += stp;
        }
        if (tHit < 0.) tHit = t;
        under = exp(-cam.y / -d.y * .035);                     // how clearly the lower cloud shows through, fading with distance
      }
      // distance melts the cloud into the pale haze of the horizon
      float haze = tHit > 0. ? 1. - exp(-tHit * .028) : 0.;
      col = col + tr * mix(under > 0. ? skyCol(vec3(d.x, 0., d.z)) : sky, vec3(.26, .36, .52), under);          // through a gap: the shadowed lower cloud far below
      col = mix(col, skyCol(vec3(d.x, .0, d.z)) * vec3(.97, .98, 1.), haze * (1. - tr) * .8);   // only the cloud itself; the gaps fade on their own
      col += ring * .3 + shock * (1. - shock) * .2;
      col = 1. - exp(-col * 1.15);                                               // soft filmic curve
      col = pow(col, vec3(.95));
      vec2 q = vUv - .5; col *= 1. - dot(q, q) * .3;                             // a little vignette
      col += (hash(gl_FragCoord.xy + fract(time) * 91.) - .5) / 255.;           // dither: smooth gradients in the sky
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
      shock: { value: 0 }, shake: { value: 0 }, sunDir: { value: new T.Vector3(.72, .3, -.62).normalize() } };
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
      travel += RM ? 0 : dt * (.22 + .5 * p);
      U.travel.value = travel + p * 6; U.lift.value = p * .4;   // and the aircraft climbs away from the deck
      U.time.value = RM ? 0 : ms / 1000;
      clouds.render(ms);
    } else if (boomSec) lastP = progress(boomSec);
  }
  requestAnimationFrame(frame);
})();
