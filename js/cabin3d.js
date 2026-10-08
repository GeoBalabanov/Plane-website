/* Cabin tour: four real photographs of British Airways Concorde G-BOAA, each turned into a 3D surface with a depth
   map (estimated with Depth Anything V2), so the camera can walk into them: down the aisle, a look at the small
   windows and the low ceiling, up to the Machmeter on the front bulkhead, through the door onto the flight deck.
   Photos: BenTanXiaoMing (CC BY-SA 4.0) and Alan Wilson (CC BY-SA 2.0), via Wikimedia Commons.
   The scroll progress of the section drives the camera; the hotspots follow points in the photos. */
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
    dirty = true;
  }
  ['aisle', 'cabin', 'mach', 'deck'].forEach(n => build(n).catch(e => console.error(e)));

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
  function place(photo, p, t) {
    const q = pose(photo, p), sway = RM ? 0 : 1;
    cam.position.set(Math.sin(t * .00031) * .02 * sway, Math.sin(t * .00047) * .012 * sway, -q.z);   // a slow breath, like walking
    cam.rotation.set(q.pitch * DEG, q.yaw * DEG, 0, 'YXZ');
    // the lens never sees past the edges of the photo: on a wide screen the width limits it, on a phone the height
    const P = PHOTOS[photo], pv = 2 * Math.atan(Math.tan(P.hfov * DEG / 2) * .75) / DEG;
    const fov = Math.min(2 * Math.atan(Math.tan(q.fov * DEG / 2) / cam.aspect) / DEG, pv * .9 - Math.abs(q.pitch) * .4);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  const hots = HOTS.map((_, i) => document.getElementById('hot' + i)), proj = new THREE.Vector3();
  let lastP = -1;
  function frame(t) {
    requestAnimationFrame(frame);
    const r = section.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight) return;
    const span = section.offsetHeight - innerHeight, p = span > 0 ? clamp(-r.top / span) : 0;
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
    const W = canvas.clientWidth, H = canvas.clientHeight;
    hots.forEach((el, i) => {
      if (!el) return;
      const [name, u, v] = HOTS[i], ph = photos[name], [a, b] = STOPS[i];
      const w = seg(p, a - .03, a) * (1 - seg(p, b, b + .03));
      if (!ph || w <= 0) { el.style.opacity = 0; return; }
      place(name, p, t); proj.copy(ph.point(u, v)).project(cam);
      const on = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
      el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
      el.style.opacity = on ? w : 0;
    });
  }
  requestAnimationFrame(frame);
}

if (canvas && section) { try { start(); } catch (e) { console.error(e); } }
