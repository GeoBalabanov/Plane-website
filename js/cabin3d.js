/* Cabin tour: four real photographs of British Airways Concorde G-BOAA, each turned into a 3D surface with a depth
   map (estimated with Depth Anything V2), so the camera can walk into them: down the aisle, a look at the small
   windows and the low ceiling, up to the Machmeter on the front bulkhead, through the door onto the flight deck.
   Photos: BenTanXiaoMing (CC BY-SA 4.0) and Alan Wilson (CC BY-SA 2.0), via Wikimedia Commons.
   The scroll progress of the section drives the camera; the hotspots follow points in the photos.
   "Walk inside" pauses the page: then you drag to look, step forward and back from spot to spot, and click things. */
import * as THREE from 'three';

const canvas = document.getElementById('cabin3d'), section = document.getElementById('cabin');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

// each photo: its lens (horizontal field of view), how near and far its depth map reaches, in metres
const PHOTOS = {
  aisle: { hfov: 72, near: 1.1, far: 22 },
  cabin: { hfov: 72, near: 1.0, far: 22 },
  mach:  { hfov: 70, near: 1.6, far: 9 },
  deck:  { hfov: 74, near: .9, far: 4.2 },
};
// the walk: which photo is on screen, and the camera inside it (metres forward, turn left, look up, lens), by progress
const WALK = [                                             // fov here is horizontal, in degrees
  { photo: 'aisle', from: .0,  to: .19, a: { z: 0,   yaw: 0,  pitch: -1, fov: 64 }, b: { z: 1.0, yaw: -2, pitch: -3, fov: 56 } },
  { photo: 'cabin', from: .16, to: .31, a: { z: 0,   yaw: 0,  pitch: -1, fov: 64 }, b: { z: .35, yaw: 19, pitch: -4, fov: 50 } },
  { photo: 'cabin', from: .31, to: .48, a: { z: .35, yaw: 19, pitch: -4, fov: 50 }, b: { z: .7,  yaw: 0,  pitch: 16, fov: 60 } },
  { photo: 'mach',  from: .46, to: .64, a: { z: 0,   yaw: 0,  pitch: 0,  fov: 64 }, b: { z: .5,  yaw: 12, pitch: -2, fov: 50 } },
  { photo: 'mach',  from: .64, to: .84, a: { z: .5,  yaw: 12, pitch: -2, fov: 50 }, b: { z: 1.6, yaw: 0,  pitch: 0,  fov: 34 } },
  { photo: 'deck',  from: .80, to: 1,   a: { z: -.15, yaw: 0, pitch: 0,  fov: 66 }, b: { z: .2,  yaw: -4, pitch: -3, fov: 58 } },
];
const FADES = [[.16, .2, 'aisle', 'cabin'], [.46, .5, 'cabin', 'mach'], [.76, .84, 'mach', 'deck']];
// hotspots: [photo, u, v] in the photo, for #hot0 .. #hot4
const HOTS = [['aisle', .66, .62], ['cabin', .196, .55], ['cabin', .5, .17], ['mach', .115, .49], ['deck', .5, .43]];
const STOPS = [[.04, .16], [.19, .31], [.34, .46], [.50, .64], [.84, .99]];

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.autoClear = false; renderer.setClearColor(0x0a0908, 1);
  const cam = new THREE.PerspectiveCamera(56, 1, .05, 100);

  const loader = new THREE.TextureLoader(), photos = {};
  let dirty = true;
  const loadImage = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });

  // a photo as a surface: every vertex is pushed out along its own ray to the depth the map gives it
  async function build(name) {
    const P = PHOTOS[name];
    const [tex, dimg] = await Promise.all([new Promise(r => loader.load(`assets/cabin/${name}.webp`, r)), loadImage(`assets/cabin/${name}-depth.png`)]);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const c = document.createElement('canvas'); c.width = dimg.width; c.height = dimg.height;
    const g = c.getContext('2d'); g.drawImage(dimg, 0, 0); const D = g.getImageData(0, 0, c.width, c.height).data;
    const aspect = tex.image.width / tex.image.height, tx = Math.tan(P.hfov * DEG / 2), ty = tx / aspect;
    const SX = 300, SY = Math.round(SX / aspect), geo = new THREE.PlaneGeometry(1, 1, SX, SY), pos = geo.attributes.position, uv = geo.attributes.uv;
    const depthAt = (u, v) => { const x = Math.min(c.width - 1, Math.round(u * (c.width - 1))), y = Math.min(c.height - 1, Math.round((1 - v) * (c.height - 1)));
      const d = D[(y * c.width + x) * 4] / 255; return 1 / (d * (1 / P.near - 1 / P.far) + 1 / P.far); };   // the map holds disparity: near is bright
    const point = (u, v, out = new THREE.Vector3()) => { const z = depthAt(u, v); return out.set((u * 2 - 1) * tx * z, (v * 2 - 1) * ty * z, -z); };
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { point(uv.getX(i), uv.getY(i), v3); pos.setXYZ(i, v3.x, v3.y, v3.z); }
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: true });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, mat));
    photos[name] = { scene, mat, point: (u, v) => point(u, 1 - v) };
    if (name === 'deck') powerUp(photos.deck, mat);
    dirty = true;
  }
  ['aisle', 'cabin', 'mach', 'deck'].forEach(n => build(n).catch(e => console.error(e)));

  /* ---------- the flight deck, powered up at dusk before departure: the photo was taken in a museum hangar, so the
     cabin is dimmed, evening sky and apron lights fill the windows, the instruments are backlit, warning and status
     lights glow (a few blink), the weather radar sweeps and dust drifts in the light from the windows ---------- */
  const deckU = { time: { value: 0 } };
  function powerUp(ph, mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.time = deckU.time;
      sh.fragmentShader = 'uniform float time;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 texel = texture2D(map, vUv);
        vec3 c = texel.rgb;                                  // linear colour of the photo
        vec2 q = vec2(vUv.x, 1. - vUv.y);                    // image coordinates, 0,0 top left
        float lum = dot(c, vec3(.2126, .7152, .0722));
        // the windows: bright hangar wall and white daylight become an evening sky over the airfield
        float win = max(step(.18, q.x) * step(q.x, .82) * step(.105, q.y) * step(q.y, .31),
                    max(step(q.x, .15) * step(.07, q.y) * step(q.y, .41), step(.8, q.x) * step(q.x, .9) * step(.14, q.y) * step(q.y, .42)));
        win *= smoothstep(.2, .42, lum);
        float hz = smoothstep(.1, .3, q.y);
        vec3 sky = mix(vec3(.012, .02, .07), vec3(.5, .16, .05), pow(hz, 2.2));
        sky = mix(sky, vec3(.85, .38, .12), smoothstep(.26, .3, q.y) * .6);
        vec2 g = floor(vec2(q.x * 260., q.y * 900.));                        // far apron and runway lights near the horizon
        float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
        float lit = step(.965, h) * smoothstep(.255, .27, q.y) * (1. - smoothstep(.29, .305, q.y));
        sky += lit * mix(vec3(1., .55, .2), vec3(.5, .8, 1.), step(.99, h)) * (.6 + .4 * sin(time * (1. + h * 3.) + h * 40.)) * 1.4;
        c = mix(c, sky + c * .05, win);
        // the cabin at dusk: dim, a little cool; the panel lit by floodlights under the glareshield
        vec3 base = c * vec3(.3, .32, .38);
        float panel = step(.25, q.x) * step(q.x, .78) * step(.36, q.y) * step(q.y, .7);
        float flood = panel * (1. - smoothstep(.37, .62, q.y)) * (1. - smoothstep(.2, .3, abs(q.x - .51))) ;
        base += c * vec3(1., .78, .5) * flood * .55;
        // backlit instruments: the white markings and needles on the dials glow warm
        float zone = max(panel, max(step(.33, q.x) * step(q.x, .67) * step(.26, q.y) * step(q.y, .36),
                     max(step(.33, q.x) * step(q.x, .67) * step(q.y, .12), step(.84, q.x) * step(.18, q.y))));
        base += c * vec3(1.15, .92, .66) * smoothstep(.32, .75, lum) * zone * 1.1;
        // coloured faces (the attitude spheres, flags) keep their colour, lit from within
        float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / max(max(c.r, max(c.g, c.b)), .001);
        base += c * smoothstep(.45, .7, sat) * smoothstep(.12, .35, lum) * zone * .9;
        // the digital readouts on the glareshield: amber numbers
        float ro = 0.;
        ro += step(.343, q.x) * step(q.x, .372) * step(.313, q.y) * step(q.y, .331);
        ro += step(.632, q.x) * step(q.x, .662) * step(.313, q.y) * step(q.y, .331);
        ro += step(.452, q.x) * step(q.x, .497) * step(.322, q.y) * step(q.y, .338);
        ro += step(.535, q.x) * step(q.x, .588) * step(.322, q.y) * step(q.y, .338);
        base += vec3(1., .5, .12) * smoothstep(.3, .7, lum) * ro * 2.5;
        // the weather radar: a green sweep with returns
        vec2 rc = (q - vec2(.398, .522)) * vec2(1.5, 1.);
        float inCrt = step(abs(q.x - .398), .014) * step(abs(q.y - .52), .022);
        float ang = atan(rc.y, rc.x), sweep = fract((ang - time * 1.4) / 6.2832);
        float trail = pow(1. - sweep, 6.), rr = length(rc) / .03;
        float ret = step(.62, fract(sin(dot(floor(vec2(ang * 9., rr * 7.)), vec2(7.1, 3.7))) * 9137.)) * step(.35, rr);
        float scope = 1. - smoothstep(.9, 1.05, rr);                         // the round screen inside its square bezel
        vec3 crt = vec3(.004, .018, .008) + vec3(.08, .7, .25) * scope * (trail * (.08 + ret * .9) + exp(-sweep * 160.) * .35 + step(abs(fract(rr * 3.) - .5), .02) * .05);
        base = mix(base, crt, inCrt * smoothstep(.0, .25, 1. - lum * 1.4 + .5));
        c = mix(base, c, win);
        diffuseColor *= vec4(c, texel.a);`);
    };
    // lights: [x, y in the photo, colour, size, blink] - status lights, warnings, the overhead annunciators
    const AMB = [1, .55, .12], GRN = [.3, 1, .45], RED = [1, .15, .1], WHT = [1, .88, .7], BLU = [.35, .6, 1];
    const L = [[.308, .43, AMB, 1, 0], [.685, .43, AMB, 1, 0], [.733, .432, AMB, 1, 0], [.423, .448, AMB, .7, 0], [.423, .463, BLU, .6, 0],
      [.448, .292, GRN, .8, 0], [.473, .292, GRN, .8, 0], [.497, .308, GRN, .9, 0], [.522, .308, WHT, .7, 0], [.548, .292, AMB, .7, 0], [.572, .308, GRN, .8, 0],
      [.598, .49, RED, .7, 0], [.609, .49, AMB, .6, 0], [.62, .49, RED, .7, 1.3],
      [.38, .093, WHT, .6, 0], [.41, .093, AMB, .6, 0], [.45, .093, WHT, .6, 0], [.485, .093, WHT, .6, 0], [.52, .093, AMB, .6, 0], [.555, .093, WHT, .6, 0], [.59, .093, WHT, .6, 0], [.625, .093, AMB, .6, 2.1],
      [.905, .07, GRN, .8, 0], [.95, .35, AMB, .8, .9], [.92, .6, GRN, .8, 0], [.97, .75, AMB, .8, 0], [.88, .45, WHT, .6, 0],
      [.45, .69, GRN, .6, 0], [.57, .69, AMB, .6, 0], [.48, .7, WHT, .5, 0], [.59, .7, WHT, .5, 0]];
    const pos = [], col = [], siz = [], blk = [];
    for (const [x, y, k, sz, b] of L) { const v = ph.point(x, y).multiplyScalar(.985); pos.push(v.x, v.y, v.z); col.push(...k); siz.push(sz); blk.push(b); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lg.setAttribute('size', new THREE.Float32BufferAttribute(siz, 1)); lg.setAttribute('blink', new THREE.Float32BufferAttribute(blk, 1));
    const glow = new THREE.ShaderMaterial({ uniforms: { time: deckU.time, opacity: { value: 1 }, px: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 color; attribute float size, blink; uniform float time, px; varying vec3 vC; varying float vB;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          vC = color; vB = blink > 0. ? step(.5, fract(time / blink)) * .85 + .15 : .92 + .08 * sin(time * 3. + position.x * 40.);
          gl_PointSize = size * px * 9. / -mv.z; }`,
      fragmentShader: `uniform float opacity; varying vec3 vC; varying float vB;
        void main(){ float r = length(gl_PointCoord - .5) * 2.; float core = exp(-r * r * 30.), halo = exp(-r * r * 4.5) * .35;
          gl_FragColor = vec4((vC * (core * 2.2 + halo) + core * .5) * vB * opacity, 1.); }` });
    const lights = new THREE.Points(lg, glow); lights.frustumCulled = false; lights.renderOrder = 2; ph.scene.add(lights);
    // dust in the air of the flight deck, catching the light from the windows
    const DN = 260, dp = new Float32Array(DN * 3), ds = new Float32Array(DN);
    for (let i = 0; i < DN; i++) { dp[i * 3] = (Math.random() - .5) * 2.4; dp[i * 3 + 1] = (Math.random() - .5) * 1.4; dp[i * 3 + 2] = -.35 - Math.random() * 2.2; ds[i] = Math.random(); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('seed', new THREE.BufferAttribute(ds, 1));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: { time: deckU.time, opacity: glow.uniforms.opacity, px: glow.uniforms.px }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float time, px; varying float vA;
        void main(){ vec3 p = position + vec3(sin(time * .13 + seed * 40.) * .06, mod(seed * 1.4 - time * .012, 1.4) - .7 - position.y, cos(time * .11 + seed * 23.) * .05);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          vA = smoothstep(-.2, .5, p.y) * (.4 + .6 * sin(time * .7 + seed * 60.) * .5 + .3);
          gl_PointSize = px * (1.2 + seed * 1.6) * .25 / -mv.z; }`,
      fragmentShader: `uniform float opacity; varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(1., .78, .55) * exp(-r * r * 3.) * vA * .22 * opacity, 1.); }` }));
    dust.frustumCulled = false; dust.renderOrder = 1; ph.scene.add(dust);
    ph.glow = glow;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true;
  }
  resize(); addEventListener('resize', resize);

  // where the camera stands in a photo at progress p
  const pose = (photo, p) => {
    const steps = WALK.filter(s => s.photo === photo);
    let s = steps.find(s => p >= s.from && p <= s.to) || (p < steps[0].from ? steps[0] : steps[steps.length - 1]);
    const t = ease(seg(p, s.from, s.to)), o = {};
    for (const k of ['z', 'yaw', 'pitch', 'fov']) o[k] = lerp(s.a[k], s.b[k], t);
    return o;
  };
  // put the camera in a photo at a pose (metres forward, turn left, look up, horizontal lens)
  function aim(photo, q, t) {
    const sway = RM ? 0 : 1, P = PHOTOS[photo];
    // a walker's head: it bobs once a step, sways from foot to foot and rolls a little; standing still, it barely stirs
    const a = G.amp * sway, gp = G.phase, hold = .35 * sway;
    const nx = Math.sin(t * .0011) * Math.sin(t * .00037 + 1), ny = Math.sin(t * .0013 + 2) * Math.sin(t * .00029);
    cam.position.set(Math.sin(gp) * .035 * a + Math.sin(t * .00031) * .012 * sway, -Math.abs(Math.cos(gp)) * .045 * a + .02 * a + Math.sin(t * .00047) * .008 * sway, -q.z);
    cam.rotation.set((q.pitch + Math.sin(gp * 2) * .55 * a + ny * .25 * hold) * DEG, (q.yaw + Math.sin(gp) * .5 * a + nx * .3 * hold) * DEG, Math.sin(gp) * .9 * a * DEG, 'YXZ');
    // the lens never sees past the edges of the photo, however far you turn: it narrows instead
    const ph = P.hfov / 2 * .96 - Math.abs(q.yaw), pv = Math.atan(Math.tan(P.hfov * DEG / 2) * .75) / DEG * .96 - Math.abs(q.pitch);
    const h = Math.min(q.fov, 2 * ph);
    const fov = Math.max(12, Math.min(2 * Math.atan(Math.tan(h * DEG / 2) / cam.aspect) / DEG, 2 * pv));
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
  const place = (photo, p, t) => aim(photo, pose(photo, p), t);
  // the gait: amp is how hard you are walking (0 to 1), phase runs one stride (two steps) per 2 pi
  const G = { amp: 0, phase: 0, foot: 0 };
  function gait(speed, dt) {
    G.amp += (clamp(speed) - G.amp) * (1 - Math.exp(-dt * (speed > G.amp ? 6 : 3)));
    if (G.amp < .02) return;
    G.phase += dt * Math.PI * 2 * .9 * (.6 + .4 * G.amp);   // a little under two steps a second
    const foot = Math.floor(G.phase / Math.PI);             // a foot lands at the bottom of each bob
    if (foot !== G.foot) { G.foot = foot; dispatchEvent(new CustomEvent('concorde:step', { detail: { strength: G.amp, left: foot % 2 === 0 } })); }
  }

  /* ---------- walk inside: free look, step forward and back, things to click ---------- */
  const SPOTS = [
    { photo: 'aisle', name: 'Aisle', z: [0, 1.1], fov: 62 },
    { photo: 'cabin', name: 'Cabin', z: [0, .7], fov: 62 },
    { photo: 'mach', name: 'Front wall', z: [0, .9], fov: 62 },
    { photo: 'deck', name: 'Flight deck', z: [-.15, .25], fov: 64 },
  ];
  // [spot, u, v, title, text]: u and v are measured in the photo, from its top left
  const THINGS = [
    [0, .26, .62, 'Leather seats', 'Two seats on each side of the aisle, about 100 passengers in all. Every seat is next to a window or the aisle.'],
    [0, .09, .58, 'A small window', 'The windows are tiny because of the pressure difference at about 60,000 ft.'],
    [0, .5, .25, 'Low ceiling', 'The cabin is narrow and the ceiling is low. The whole aircraft is slim so it can fly at Mach 2.'],
    [0, .14, .33, 'Overhead bins', 'Small bins above the seats. In a slim cabin there is little room for bags.'],
    [0, .5, .86, 'One aisle', 'A single narrow aisle runs the length of the cabin, from the back to the front wall.'],
    [1, .5, .53, 'Service trolley', 'Champagne and a full meal were served on board, even on a flight of about 3.5 hours.'],
    [1, .79, .53, 'Look outside', 'From about 60,000 ft you can see the curve of the Earth.'],
    [1, .66, .62, 'Seat covers', 'This Concorde is now in a museum, so the seats wear clear covers to protect the leather.'],
    [2, .105, .53, 'Mach', 'Passengers could read their speed here. Mach 2.00 is twice the speed of sound.'],
    [2, .225, .53, 'Feet', 'Height in feet. Concorde cruised at about 60,000 ft, far above other airliners.'],
    [2, .765, .53, 'Outside air', 'Minus 55°C outside. Even so, at Mach 2 the nose heats up to about 127°C and the plane stretches by some centimetres.'],
    [2, .875, .53, 'Miles per hour', '1,380 mph, about 2,200 km/h. London to New York in about 3.5 hours instead of 7 or more.'],
    [2, .5, .45, 'Flight deck door', 'Through here is the flight deck, where three crew flew the aircraft.'],
    [3, .49, .69, 'Thrust levers', 'Four levers, one for each Olympus engine. Reheat helped Concorde from Mach 0.95 to 1.7.'],
    [3, .49, .52, 'Engine gauges', 'The rows of round dials in the middle show how the four engines are running.'],
    [3, .5, .17, 'Visor and nose', 'For take-off the nose drops 5 degrees and for landing 12.5, so the pilots can see past it.'],
    [3, .25, .6, 'Captain', 'The captain sits on the left, the first officer on the right.'],
    [3, .95, .55, 'Flight engineer', 'The third crew member faces a whole wall of dials on the right: fuel, engines and systems.'],
  ];
  const X = { on: false, spot: 0, z: 0, yaw: 0, pitch: 0, zT: 0, yawT: 0, pitchT: 0, from: -1, k: 1, open: -1 };
  const ui = {
    root: section, btn: document.getElementById('walk-in'), exit: document.getElementById('walk-exit'),
    fwd: document.getElementById('walk-fwd'), back: document.getElementById('walk-back'), spots: [...document.querySelectorAll('#walk-spots button')],
    name: document.getElementById('walk-spot'), info: document.getElementById('walk-info'), hint: document.getElementById('walk-hint'), layer: document.getElementById('walk-things'),
  };
  const thingEls = THINGS.map(([spot, , , title], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'xhot'; b.dataset.i = i;
    b.innerHTML = `<span class="ring" aria-hidden="true"></span><span class="tag">${title}</span>`;
    b.setAttribute('aria-label', `${title}, ${SPOTS[spot].name}`);
    b.addEventListener('click', e => { e.stopPropagation(); openThing(i); });
    ui.layer && ui.layer.appendChild(b); return b;
  });
  const lim = { yaw: 16, up: 14, down: -12 };
  function openThing(i) {
    const [spot, u, v, title, text] = THINGS[i], ph = photos[SPOTS[spot].photo]; if (!ph) return;
    X.open = i;
    // turn your head towards it
    const pt = ph.point(u, v), dx = pt.x, dy = pt.y, dz = pt.z + X.z;
    X.yawT = clamp(Math.atan2(-dx, -dz) / DEG, -lim.yaw, lim.yaw); X.pitchT = clamp(Math.atan2(dy, Math.hypot(dx, dz)) / DEG, lim.down, lim.up);
    ui.info.querySelector('.label span').textContent = SPOTS[spot].name;
    ui.info.querySelector('h3').textContent = title; ui.info.querySelector('p').textContent = text;
    ui.info.hidden = false; requestAnimationFrame(() => ui.info.classList.add('on'));
    thingEls.forEach((b, j) => b.classList.toggle('on', j === i));
    hideHint();
  }
  function closeThing() { X.open = -1; ui.info.classList.remove('on'); thingEls.forEach(b => b.classList.remove('on')); setTimeout(() => { if (X.open < 0) ui.info.hidden = true; }, 400); }
  function go(spot, back) {
    if (spot < 0 || spot >= SPOTS.length || spot === X.spot) return;
    closeThing();
    X.from = X.spot; X.k = RM ? 1 : 0; X.t0 = performance.now(); X.spot = spot;
    const z = back ? SPOTS[spot].z[1] : SPOTS[spot].z[0];
    X.z = X.zT = z; X.yaw = X.yawT = 0; X.pitch = X.pitchT = 0;
    ui.spots.forEach((b, i) => b.setAttribute('aria-current', i === spot ? 'true' : 'false'));
    ui.name.textContent = SPOTS[spot].name;
    const last = spot === SPOTS.length - 1;                  // at the flight deck the forward button carries on with the flight
    ui.fwd.classList.toggle('onward', last); ui.fwd.setAttribute('aria-label', last ? 'On to take-off' : 'Step forward');
  }
  function step(d) {                                         // one step forward (1) or back (-1); past the end of a spot you walk into the next
    const S = SPOTS[X.spot], nz = X.zT + d * .3;
    if (nz > S.z[1] + .05) return X.spot === SPOTS.length - 1 ? onward() : go(X.spot + 1, false);   // past the flight deck: on with the flight
    if (nz < S.z[0] - .05) return X.spot === 0 ? leave() : go(X.spot - 1, true);                     // back past the aisle: back to the story
    X.zT = clamp(nz, S.z[0], S.z[1]); X.yawT *= .35; X.pitchT *= .35; hideHint();   // you look ahead when you walk
  }
  const look = (dy, dp) => { X.yawT = clamp(X.yawT + dy, -lim.yaw, lim.yaw); X.pitchT = clamp(X.pitchT + dp, lim.down, lim.up); };
  let hinted = false; const hideHint = () => { if (!hinted) { hinted = true; ui.hint.classList.add('gone'); } };
  function enter(spot = 0, thing = -1) {
    X.on = true; X.spot = -1; go(spot); X.from = -1; X.k = 1;
    if (thing >= 0) setTimeout(() => X.on && openThing(thing), RM ? 0 : 250);
    dispatchEvent(new CustomEvent('concorde:sound-wish'));   // footsteps want sound: on, unless the visitor turned it off
    document.documentElement.classList.add('walking'); section.classList.add('exploring');
    if (window.lenis) window.lenis.stop();
    ui.exit.focus({ preventScroll: true }); dirty = true;
  }
  // walking on from the flight deck: leave the walk and scroll on to the take-off
  let lockUntil = 0;
  function onward() {
    if (performance.now() < lockUntil) return; lockUntil = performance.now() + 1500;
    leave(false);
    const next = document.getElementById('droop');
    // a frame later, once the page scroll has been handed back
    if (next) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (window.lenis) window.lenis.scrollTo(next, { duration: RM ? 0 : 1.8, force: true }); else next.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
    }));
  }
  function leave(refocus = true) {
    X.on = false; closeThing();
    document.documentElement.classList.remove('walking'); section.classList.remove('exploring');
    if (window.lenis) window.lenis.start();
    if (refocus) ui.btn.focus({ preventScroll: true });
    dirty = true;
  }
  if (ui.btn) {
    ui.btn.addEventListener('click', () => enter(spotAt(lastP))); ui.exit.addEventListener('click', () => leave());
    ui.fwd.addEventListener('click', () => X.spot === SPOTS.length - 1 ? onward() : step(1)); ui.back.addEventListener('click', () => step(-1));
    ui.spots.forEach((b, i) => b.addEventListener('click', () => go(i, i < X.spot)));
    ui.info.querySelector('.x').addEventListener('click', closeThing);
    // drag to look around
    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (!X.on) return; drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      look(dx * .08, dy * .06); if (drag.moved > 6) hideHint(); });
    canvas.addEventListener('pointerup', () => { if (drag && drag.moved < 6) closeThing(); drag = null; });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    // the wheel walks, the keys walk and look
    let wheelAcc = 0;
    section.addEventListener('wheel', e => { if (!X.on) return; e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) > 90) { step(Math.sign(wheelAcc)); wheelAcc = 0; } }, { passive: false });
    addEventListener('keydown', e => {
      if (!X.on) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); X.open >= 0 ? closeThing() : leave(); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); step(1); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); step(-1); }
      else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && !e.target.closest('#walk-spots')) { e.preventDefault(); look(6, 0); }
      else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && !e.target.closest('#walk-spots')) { e.preventDefault(); look(-6, 0); }
      else if (k === ' ' || k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End') e.preventDefault();   // the page stays put while walking
    });
  }
  // from the scroll tour: which spot the story is at, and what each tour ring opens
  const spotAt = p => p < .17 ? 0 : p < .47 ? 1 : p < .8 ? 2 : 3;
  const HOT_THING = [[0, 0], [1, 6], [0, 2], [2, 8], [3, 14]];
  HOTS.forEach((_, i) => {
    const el = document.getElementById('hot' + i); if (!el) return;
    el.setAttribute('role', 'button'); el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-label', el.textContent.trim() + ': walk inside and read more');
    const open = e => { e.stopPropagation(); enter(...HOT_THING[i]); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  });
  canvas.addEventListener('click', () => { if (!X.on) enter(spotAt(lastP)); });
  // the scroll tour fades the button in once the scene has started
  const btnShow = p => { if (ui.btn) ui.btn.classList.toggle('on', !X.on && p > .03 && p < .985); };

  const hots = HOTS.map((_, i) => document.getElementById('hot' + i)), proj = new THREE.Vector3();
  let lastP = -1, lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    deckU.time.value = RM ? 0 : t / 1000;
    if (photos.deck && photos.deck.glow) { photos.deck.glow.uniforms.opacity.value = photos.deck.mat.opacity; photos.deck.glow.uniforms.px.value = renderer.getPixelRatio() * canvas.clientHeight / 900 * 10; }
    const r = section.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight) return;
    const span = section.offsetHeight - innerHeight, p = span > 0 ? clamp(-r.top / span) : 0;
    const dt = Math.min(.05, (t - lastT) / 1000 || .016); lastT = t;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    btnShow(p);
    if (X.on) {
      // ease towards where the visitor is walking and looking
      const e = RM ? 1 : 1 - Math.exp(-dt * 7);
      gait(X.k < 1 ? 1 : Math.abs(X.zT - X.z) * 6, dt);   // walking while the feet still have ground to cover
      X.z += (X.zT - X.z) * e; X.yaw += (X.yawT - X.yaw) * e; X.pitch += (X.pitchT - X.pitch) * e;
      if (X.k < 1) X.k = Math.min(1, (t - X.t0) / 900);   // the walk between spots takes 0.9 s, however fast the screen draws
      const S = SPOTS[X.spot], q = { z: X.z, yaw: X.yaw, pitch: X.pitch - 1, fov: S.fov };
      renderer.clear();
      if (X.from >= 0 && X.k < 1) {                          // the spot you left keeps walking on as it fades out
        const F = SPOTS[X.from], fwd = X.from < X.spot, kk = ease(X.k);
        const fq = { z: fwd ? F.z[1] + .5 * kk : F.z[0] - .4 * kk, yaw: 0, pitch: -1, fov: F.fov };
        const ph = photos[F.photo]; if (ph) { aim(F.photo, fq, t); ph.mat.opacity = 1; renderer.clearDepth(); renderer.render(ph.scene, cam); }
        q.z += (fwd ? -.35 : .35) * (1 - kk);
      }
      const ph = photos[S.photo];
      if (ph) { aim(S.photo, q, t); ph.mat.opacity = X.from >= 0 && X.k < 1 ? ease(X.k) : 1; renderer.clearDepth(); renderer.render(ph.scene, cam); }
      // the things you can click, on this spot only
      thingEls.forEach((b, i) => {
        const [spot, u, v] = THINGS[i];
        if (spot !== X.spot || !ph || X.k < .7) { b.classList.remove('vis'); return; }
        proj.copy(ph.point(u, v)).project(cam);
        const vis = proj.z < 1 && Math.abs(proj.x) < .96 && Math.abs(proj.y) < .9;
        b.classList.toggle('vis', vis);
        if (vis) b.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
      });
      hots.forEach(el => el && (el.style.opacity = 0));
      return;
    }
    gait(lastP < 0 ? 0 : Math.abs(p - lastP) / dt * 9, dt);                  // scrolling down the aisle is walking down it
    if (p === lastP && !dirty && RM) return;
    lastP = p; dirty = false;
    // which photos are on screen: one, or two while one fades into the next
    let layers = [];
    const f = FADES.find(([a, b]) => p >= a && p <= b);
    if (f) { const k = ease(seg(p, f[0], f[1])); layers = [[f[2], 1], [f[3], k]]; }
    else { const s = WALK.find(s => p >= s.from && p <= s.to) || WALK[WALK.length - 1]; layers = [[s.photo, 1]]; }
    renderer.clear();
    for (const [name, op] of layers) {
      const ph = photos[name]; if (!ph || op <= .001) continue;
      place(name, p, t); ph.mat.opacity = op; renderer.clearDepth(); renderer.render(ph.scene, cam);
    }
    // hotspots: project their point with the camera of their own photo
    hots.forEach((el, i) => {
      if (!el) return;
      const [name, u, v] = HOTS[i], ph = photos[name], [a, b] = STOPS[i];
      const w = seg(p, a - .03, a) * (1 - seg(p, b, b + .03));
      if (!ph || w <= 0) { el.style.opacity = 0; return; }
      place(name, p, t); proj.copy(ph.point(u, v)).project(cam);
      const on = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
      el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
      el.style.opacity = on ? w : 0;
      el.classList.toggle('live', on && w > .5); el.tabIndex = on && w > .5 ? 0 : -1;
    });
  }
  requestAnimationFrame(frame);
}

if (canvas && section) { try { start(); } catch (e) { console.error(e); } }
