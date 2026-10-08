/* Living photographs: the sea of cloud in the supersonic scene flows towards the viewer, and the Earth turns slowly
   under its atmosphere in the cruise scene. Each photo gets a WebGL canvas on top of it that draws the same picture
   (same box, same cover crop, same scroll transform) and moves only the part below the horizon, measured from the photo.
   Movement uses two copies of the flow, half a cycle apart, cross-faded, so it loops without a jump.
   Crossing Mach 1 sends a shock wave through the clouds and fires "concorde:boom" for the sound. */
(() => {
  const T = window.THREE; if (!T) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  const FRAG = `
    precision highp float;
    uniform sampler2D tex; uniform vec2 view; uniform float imgAspect, posY, time, mode, speed, shock, shake;
    uniform vec3 horizon;                                     // horizon in the photo: y = c + a (x - .5)^2 + b (x - .5), from the top
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y); }
    float hz(float x){ float d = x - .5; return horizon.x + horizon.y * d * d + horizon.z * d; }
    vec2 flow(vec2 p, float ph, float w){                     // p: photo coordinates, y down
      if (mode < .5) {                                         // clouds: zoom towards the vanishing point, as if flying forwards
        vec2 vp = vec2(.5, hz(.5) - .03);
        return vp + (p - vp) * mix(1., exp(-ph * .16 * speed), w);
      }
      float depth = clamp((p.y - hz(p.x)) * 2.2, 0., 1.);      // earth: the surface slides sideways, faster near the viewer
      return p + vec2(ph * .022 * (.35 + depth), 0.) * w;
    }
    vec3 look(vec2 p){ return texture2D(tex, vec2(p.x, 1. - p.y)).rgb; }
    void main(){
      // the same crop as object-fit: cover
      float va = view.x / view.y; vec2 p = vec2(vUv.x, 1. - vUv.y);
      if (va > imgAspect) p.y = posY * (1. - imgAspect / va) + p.y * imgAspect / va;
      else p.x = .5 * (1. - va / imgAspect) + p.x * va / imgAspect;
      // shock wave: a ring of bent light opening from the centre of the view
      vec2 sv = (vUv - .5) * vec2(va, 1.); float r = length(sv);
      float R = shock * 1.6, ring = shock > 0. ? exp(-pow((r - R) * 14., 2.)) * (1. - shock) : 0.;
      p += normalize(sv + 1e-5) * ring * .035 / vec2(va, 1.);
      p += (vec2(noise(vec2(time * 31., 0.)), noise(vec2(0., time * 29.))) - .5) * shake * .012;
      float w = smoothstep(.012, .08, p.y - hz(p.x));          // 0 in the sky, 1 on the surface
      float t = time / (mode < .5 ? 7. : 10.), p1 = fract(t), p2 = fract(t + .5), f = abs(2. * p1 - 1.);
      vec2 wob = (vec2(noise(p * 7. + time * .06), noise(p * 7. - time * .05)) - .5) * .004 * w * (1. - mode);   // billowing
      vec3 c = mix(look(flow(p, p1, w) + wob), look(flow(p, p2, w) + wob), f);
      if (mode > .5) {                                         // earth: the limb breathes, a few stars in the black
        float limb = exp(-pow((p.y - hz(p.x) + .004) * 90., 2.));
        c += vec3(.15, .35, .9) * limb * (.05 + .04 * sin(time * .7)) ;
        vec2 q = p * vec2(140., 95.), g = floor(q), o = vec2(hash(g + 7.), hash(g + 13.)) * .6 + .2;   // one point of light at a random spot in a few cells
        float s = step(.993, hash(g)) * smoothstep(.09, .0, length((fract(q) - o) * vec2(view.x / view.y, 1.) * 1.2)) * (1. - smoothstep(-.14, -.05, p.y - hz(p.x)));
        c += vec3(.85, .9, 1.) * s * (.3 + .25 * sin(time * (1.2 + hash(g + 3.) * 2.) + hash(g) * 30.));
      }
      c += ring * .35 + shock * (1. - shock) * .25;            // the flash of the wave
      gl_FragColor = vec4(c, 1.);
    }`;

  function living(img, opt) {
    const cv = document.createElement('canvas');
    cv.className = img.className; cv.setAttribute('aria-hidden', 'true');
    cv.style.display = 'block';                               // the photo's own CSS gives the canvas the same box
    img.after(cv);
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: false, alpha: false }); } catch (e) { cv.remove(); return null; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    const tex = new T.TextureLoader().load(img.currentSrc || img.src, () => { ready = true; img.style.visibility = 'hidden'; });
    tex.encoding = T.LinearEncoding; tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
    const U = { tex: { value: tex }, view: { value: new T.Vector2(1, 1) }, imgAspect: { value: img.width / img.height }, posY: { value: opt.posY },
      time: { value: 0 }, mode: { value: opt.mode }, speed: { value: 1 }, shock: { value: 0 }, shake: { value: 0 }, horizon: { value: new T.Vector3(...opt.horizon) } };
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms: U, fragmentShader: FRAG,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.); }' })));
    let ready = false;
    function size() { const w = cv.clientWidth, h = cv.clientHeight; if (w && h) { renderer.setSize(w, h, false); U.view.value.set(w, h); } }
    size(); addEventListener('resize', size);
    return { cv, U, render(ms) { if (!ready) return; U.time.value = RM ? 0 : ms / 1000; cv.style.transform = img.style.transform; renderer.render(scene, cam); }, ready: () => ready };
  }

  const progress = sec => { const r = sec.getBoundingClientRect(), span = sec.offsetHeight - innerHeight; return span > 0 ? clamp(-r.top / span) : 0; };
  const onScreen = sec => { const r = sec.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

  const boomSec = document.getElementById('boom'), cruiseSec = document.getElementById('cruise');
  const clouds = boomSec && living(document.getElementById('boom-photo'), { mode: 0, posY: .5, horizon: [.396, .13, -.028] });
  const earth = cruiseSec && living(document.getElementById('earth'), { mode: 1, posY: .6, horizon: [.373, .32, .012] });

  // Mach 1 sits where the readout in site.js passes 1.00: progress .304 of the supersonic scene
  const MACH1 = .304;
  let lastP = 0, boomAt = -1e9;
  function frame(ms) {
    requestAnimationFrame(frame);
    if (clouds && onScreen(boomSec)) {
      const p = progress(boomSec);
      if (lastP < MACH1 && p >= MACH1 && !RM) { boomAt = ms; dispatchEvent(new CustomEvent('concorde:boom')); }
      lastP = p;
      const k = (ms - boomAt) / 1400;                          // the wave takes 1.4 s to cross the screen
      clouds.U.shock.value = k >= 0 && k < 1 ? k : 0;
      clouds.U.shake.value = k >= 0 && k < 1 ? Math.pow(1 - k, 2) : 0;
      clouds.U.speed.value = .6 + 1.4 * p;                     // faster as the Mach number climbs
      clouds.render(ms);
    } else if (boomSec) lastP = progress(boomSec);
    if (earth && onScreen(cruiseSec)) earth.render(ms);
  }
  requestAnimationFrame(frame);
})();
