/* Mach 2: the real Concorde model seen from straight above on cream paper, as in the Figma frames. It flies along a
   curved path: in from the lower left, up into the gap between "Fly at" and "Mach 2", a moment there, then a sweeping turn
   out past the top right. It points along the curve and banks into the turns. The camera holds still. A soft shadow falls
   on the paper below it. Scroll progress of the section drives everything. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const canvas = document.getElementById('mach3d'), section = document.getElementById('mach2');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // the aircraft reflects the photographed sky of the take-off scene: blue on its upper surfaces, warm at the edges
  new RGBELoader().load('assets/sky.hdr', hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(hdr).texture; pmrem.dispose(); hdr.dispose(); dirty = true;
  });
  // looking straight down, nose towards the top of the page
  const cam = new THREE.PerspectiveCamera(20, 1, 1, 2000); cam.up.set(0, 0, 1);

  const sun = new THREE.DirectionalLight(0xfff1e0, 1.25); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 22; sun.shadow.blurSamples = 25; sun.shadow.bias = -.0004;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xb9cbe4, 0xe9e2d4, .35));
  // the paper: only its shadow shows, the colour is the page behind the canvas
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x2c2418, opacity: .32 }));
  paper.position.y = -9; paper.receiveShadow = true; scene.add(paper);

  const holder = new THREE.Group(); holder.scale.setScalar(.74); scene.add(holder);   // a little smaller than the page, so its path reads
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('assets/models/concorde.glb', gltf => {
    gltf.scene.traverse(o => { if (!o.isMesh) return; o.castShadow = true;
      const m = o.material; if (m.name !== 'Seal') { m.roughness = .14; m.metalness = .62; m.envMapIntensity = 2.1; }   // polished: the sky shows in the paint
      if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
    const box = new THREE.Box3().setFromObject(gltf.scene), c = box.getCenter(new THREE.Vector3());
    gltf.scene.position.set(-c.x, -c.y, -c.z);               // centre the aircraft on its holder
    holder.add(gltf.scene); dirty = true;
  }, undefined, e => console.error(e));

  let dirty = true, lastP = -1, bank = 0;
  // the flight path, as two cubic Bezier curves in page terms (x to the right of the page, z up the page; the camera
  // looks down with the page's right towards -x): in from the lower left to the centre, a hold, then out past the top right
  const bez = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
  const IN = [[-66, -104], [-64, -46], [0, -34], [0, 0]], OUT = [[0, 0], [0, 24], [24, 50], [104, 112]];
  function path(p) {
    let C, u, hold = 0;
    if (p < .42) { C = IN; u = ease(p / .42) * .5 + (p / .42) * .5; }                  // mostly even, a little slower at the end
    else if (p < .6) { C = IN; u = 1; hold = (p - .42) / .18; }
    else { C = OUT; u = Math.pow((p - .6) / .4, 1.35); }
    const sx = bez(C[0][0], C[1][0], C[2][0], C[3][0], u), sz = bez(C[0][1], C[1][1], C[2][1], C[3][1], u) + (C === OUT ? 3 : hold * 3);   // creeping on while it holds
    const v = 1 - u, dsx = 3 * (v * v * (C[1][0] - C[0][0]) + 2 * v * u * (C[2][0] - C[1][0]) + u * u * (C[3][0] - C[2][0]));
    const dsz = 3 * (v * v * (C[1][1] - C[0][1]) + 2 * v * u * (C[2][1] - C[1][1]) + u * u * (C[3][1] - C[2][1])) + (u === 1 ? 1 : 0);
    return { x: -sx, z: sz, dx: -dsx, dz: dsz };
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true;
  }
  resize(); addEventListener('resize', resize);

  function frame(ms) {
    requestAnimationFrame(frame);
    const r = section.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight) return;
    const span = section.offsetHeight - innerHeight, p = span > 0 ? clamp(-r.top / span) : 0;
    if (p === lastP && !dirty && RM) return;
    lastP = p; dirty = false;
    const t = RM ? 0 : ms / 1000;
    // where the aircraft is along its path, then which way it points and how far it banks
    const P = path(p), A = path(Math.max(0, p - .004)), B = path(Math.min(1, p + .004));
    const yaw = Math.atan2(B.x - A.x, B.z - A.z);
    const turn = (A.dx * B.dz - A.dz * B.dx) / Math.max(1e-6, Math.hypot(A.dx, A.dz) * Math.hypot(B.dx, B.dz));   // sine of the turn between the two
    bank += (clamp(turn * 26, -.55, .55) - bank) * (RM ? 1 : .12);                   // eased, so the roll never snaps
    holder.position.set(P.x, Math.sin(t * .8) * .25, P.z);
    holder.rotation.set(0, yaw + Math.sin(t * .45) * .012, bank + Math.sin(t * .6) * .02, 'YXZ');
    // the camera holds still, high enough to show the whole aircraft between the words
    const fit = Math.max(1, .95 / cam.aspect);              // tall screens step back
    cam.position.set(0, 196 * fit, 1.5); cam.lookAt(0, 0, 1.5);
    sun.position.set(-34, 120, 22); sun.target.position.set(0, 0, 0);    // light from the upper right of the page: the shadow falls to the left, as in Figma
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
}

if (canvas && section) { try { start(); } catch (e) { console.error(e); } }
