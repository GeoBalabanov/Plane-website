/* Mach 2: the real Concorde model seen from straight above on cream paper, as in the Figma frames. It flies up
   from below into the gap between "Fly at" and "Mach 2", then the camera comes down until the delta wing fills the
   page. A soft shadow falls on the paper below it. Scroll progress of the section drives everything. */
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
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
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
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 14; sun.shadow.blurSamples = 20; sun.shadow.bias = -.0004;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdfe6f0, 0xe9e2d4, .2));
  // the paper: only its shadow shows, the colour is the page behind the canvas
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x3b2c1c, opacity: .2 }));
  paper.position.y = -14; paper.receiveShadow = true; scene.add(paper);

  const holder = new THREE.Group(); scene.add(holder);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('assets/models/concorde.glb', gltf => {
    gltf.scene.traverse(o => { if (!o.isMesh) return; o.castShadow = true;
      const m = o.material; if (m.name !== 'Seal') { m.roughness = .26; m.envMapIntensity = 1.15; }
      if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
    const box = new THREE.Box3().setFromObject(gltf.scene), c = box.getCenter(new THREE.Vector3());
    gltf.scene.position.set(-c.x, -c.y, -c.z);               // centre the aircraft on its holder
    holder.add(gltf.scene); dirty = true;
  }, undefined, e => console.error(e));

  let dirty = true, lastP = -1;
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
    const rise = ease(seg(p, 0, .45)), grow = ease(seg(p, .5, .95));
    // fly in from below the page, with a slow breath of bank and yaw like a real aircraft in the air
    holder.position.z = lerp(-95, 0, rise);
    holder.rotation.z = Math.sin(t * .6) * .03 + .12 * (1 - rise);
    holder.rotation.y = Math.sin(t * .45) * .012;
    holder.position.y = Math.sin(t * .8) * .25;
    // the camera: high enough to show the whole aircraft between the words, then down until the wing fills the page
    const fit = Math.max(1, .95 / cam.aspect);              // tall screens step back
    const H = lerp(250, 66, grow) * fit, cz = lerp(-4, 6, grow);
    cam.position.set(0, H, cz); cam.lookAt(0, 0, cz);
    sun.position.set(26, 120, 30); sun.target.position.set(0, 0, 0);     // light from the upper left of the page: the shadow falls to the lower right
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
}

if (canvas && section) { try { start(); } catch (e) { console.error(e); } }
