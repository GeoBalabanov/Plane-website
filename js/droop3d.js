/* Take-off scene: the droop nose, on a real Concorde model in a warm studio.
   Model: "Concorde" by manilov.ap (Sketchfab, CC BY 4.0), prepared by tools/build-concorde.mjs, which splits the
   nose from the fuselage and hangs it on a "NosePivot" node. Units are metres; +z towards the nose, +y up.
   A GSAP timeline scrubbed by ScrollTrigger drives the nose angle and the camera. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

const canvas = document.getElementById('droop3d'), section = document.getElementById('droop');
const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEG = Math.PI / 180, STAND = 2.77;                   // height of the model's lowest point when the aircraft stands on its gear (12.2 m to the fin tip)

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  // colour stays linear until the last pass, which applies ACES tone mapping and the sRGB curve itself
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, 1, .5, 900);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();

  /* ---------- studio: a warm cove (backdrop dome and floor that melt into each other) ---------- */
  const WALL = new THREE.Color(0xcdb394).convertSRGBToLinear(), GLOW = new THREE.Color(0xffedd2).convertSRGBToLinear();
  const cove = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { wall: { value: WALL }, glow: { value: GLOW } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    // brightest low behind the aircraft, falling off upwards and to the sides
    fragmentShader: 'uniform vec3 wall, glow; varying vec3 d; void main(){ float h = smoothstep(-.05, .55, d.y); float side = smoothstep(.2, 1., abs(d.z)); gl_FragColor = vec4(mix(glow, wall, clamp(h * .9 + side * .3, 0., 1.)) * 1.5, 1.); }'
  }));
  scene.add(cove);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.ShaderMaterial({
    depthWrite: false, transparent: true, uniforms: { wall: { value: WALL }, glow: { value: GLOW } },
    vertexShader: 'varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position, 1.); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
    // a pool of light under the aircraft that fades out into the cove, so no horizon line shows
    fragmentShader: 'uniform vec3 wall, glow; varying vec3 w; void main(){ float r = length(w.xz * vec2(1., .5)); gl_FragColor = vec4(glow * 1.56, 1. - smoothstep(18., 120., r)); }'
  }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = -2; scene.add(floor);
  cove.renderOrder = -3;

  /* ---------- lights: the room for soft fill, a warm key from the camera side, a rim from behind ---------- */
  const key = new THREE.DirectionalLight(0xfff0dc, 1.5); key.position.set(-40, 55, 45); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe6cc, .9); rim.position.set(35, 30, -50); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0xcbb69c, .32));

  /* ---------- soft contact shadow: depth seen from under the floor, blurred, laid back on the floor ---------- */
  const SW = 44, SL = 84, SH = 14, SZ = 3;                  // shadow area (width, length), height it looks up, centre along the aircraft
  const rtA = new THREE.WebGLRenderTarget(512, 1024), rtB = new THREE.WebGLRenderTarget(512, 1024);
  rtA.texture.generateMipmaps = rtB.texture.generateMipmaps = false;
  const shadowCam = new THREE.OrthographicCamera(-SW / 2, SW / 2, SL / 2, -SL / 2, 0, SH);
  shadowCam.position.set(0, 0, SZ); shadowCam.rotation.x = Math.PI / 2; shadowCam.layers.set(1); shadowCam.updateMatrixWorld();
  const depthMat = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false });
  depthMat.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.4 ) * 1.3 );'); };
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(SW, SL).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rtA.texture, color: 0x3a2618, transparent: true, opacity: .68, depthWrite: false }));
  shadowPlane.position.set(0, .02, SZ); shadowPlane.scale.y = -1; shadowPlane.renderOrder = -1; scene.add(shadowPlane);   // scale flips it to face up
  const blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), blurScene = new THREE.Scene().add(blurQuad);
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader), vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  function blur(amount) {
    blurQuad.material = hBlur; hBlur.uniforms.tDiffuse.value = rtA.texture; hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtB); renderer.render(blurScene, blurCam);
    blurQuad.material = vBlur; vBlur.uniforms.tDiffuse.value = rtB.texture; vBlur.uniforms.v.value = amount / 256 * (SW / SL);
    renderer.setRenderTarget(rtA); renderer.render(blurScene, blurCam);
  }
  function castShadow() {
    scene.overrideMaterial = depthMat;
    const clear = renderer.getClearAlpha(); renderer.setClearAlpha(0);
    renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(scene, shadowCam);
    scene.overrideMaterial = null;
    blur(2.2); blur(.9);
    renderer.setRenderTarget(null); renderer.setClearAlpha(clear);
  }

  /* ---------- the aircraft ---------- */
  const aircraft = new THREE.Group(); aircraft.position.y = STAND; scene.add(aircraft);

  /* The model comes without landing gear, so the gear is built here from Concorde's real layout:
     wheelbase 18.19 m, track 7.72 m, four-wheel main bogies and a twin-wheel nose leg. Its origin is on the floor. */
  const gear = new THREE.Group(); gear.position.y = -STAND; aircraft.add(gear);
  {
    const std = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .9 });
    const rubber = std(0x0e0f10, .9, 0), alloy = std(0xb9bdc2, .38, .7), chrome = std(0xe6e8ea, .16, 1), paint = std(0xeeeeec, .4, 0), dark = std(0x24262a, .6, .3);
    const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.layers.enable(1); gear.add(m); return m; };
    const rod = (mat, r, a, b) => {                          // a cylinder from point a to point b
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = put(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 20), mat, 0, 0, 0);
      m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return m;
    };
    const wheel = (x, z, R, w) => {
      const s = R * .16, tyre = new THREE.LatheGeometry([[R * .58, -w / 2], [R - s, -w / 2], [R - s * .3, -w / 2 + s * .3], [R, -w / 2 + s], [R, w / 2 - s], [R - s * .3, w / 2 - s * .3], [R - s, w / 2], [R * .58, w / 2]].map(p => new THREE.Vector2(...p)), 40).rotateZ(Math.PI / 2);
      put(tyre, rubber, x, R, z).material.side = THREE.DoubleSide; put(new THREE.CylinderGeometry(R * .56, R * .56, w * .8, 32).rotateZ(Math.PI / 2), alloy, x, R, z);
      put(new THREE.CylinderGeometry(R * .2, R * .2, w * 1.04, 20).rotateZ(Math.PI / 2), dark, x, R, z);
    };
    // main gear: under the wing, just inboard of the engine nacelles
    for (const side of [-1, 1]) {
      const x = side * 3.86, z = -2.7, top = STAND + .7;
      for (const dz of [-.84, .84]) { for (const dx of [-.34, .34]) wheel(x + dx, z + dz, .6, .4); rod(dark, .07, [x - .5, .6, z + dz], [x + .5, .6, z + dz]); }
      put(new THREE.BoxGeometry(.24, .26, 2.0), alloy, x, .62, z);                      // bogie beam
      rod(chrome, .105, [x, .62, z], [x, 1.7, z]); rod(alloy, .17, [x, 1.6, z], [x, top, z]);
      rod(alloy, .075, [x, 2.05, z], [x - side * 1.5, top, z]);                          // side brace
      rod(alloy, .06, [x, 1.75, z], [x, top - .2, z + 1.5]);                             // drag brace
      rod(dark, .04, [x, .8, z - .26], [x, 1.5, z - .2]);                                // torque link
      put(new THREE.BoxGeometry(.04, .8, 1.9), paint, x + side * .6, top - .5, z);       // gear door
    }
    // nose gear: a long leg under the forward cabin
    { const z = 15.5, top = STAND + 1.15;
      for (const dx of [-.25, .25]) wheel(dx, z, .4, .26);
      rod(dark, .06, [-.4, .4, z], [.4, .4, z]);
      rod(chrome, .08, [0, .4, z], [0, 1.9, z]); rod(alloy, .13, [0, 1.8, z], [0, top, z]);
      rod(alloy, .055, [0, 2.1, z], [0, top - .1, z + 1.9]);                              // drag brace
      rod(dark, .035, [0, .55, z - .2], [0, 1.55, z - .16]);
      for (const side of [-1, 1]) put(new THREE.BoxGeometry(.03, .6, 1.8), paint, side * .46, top - .72, z + .1);
    }
  }
  let nosePivot = null, profile = [];
  const EYE = new THREE.Vector3(0, 3.38, 25.4);             // pilot's eye, in the aircraft frame
  const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([EYE, EYE.clone().setZ(90)]),
    new THREE.LineDashedMaterial({ color: 0xff5a1f, dashSize: .7, gapSize: .45, transparent: true, opacity: 0 }));
  sight.computeLineDistances(); aircraft.add(sight);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('assets/models/concorde.glb', gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.layers.enable(1);                                    // layer 1 is what the contact shadow sees
      const m = o.material; if (m.name !== 'Seal') { m.roughness = .4; m.envMapIntensity = .85; }
      if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    aircraft.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
    nosePivot = gltf.scene.getObjectByName('NosePivot');
    // side profile of the solid nose (ahead of the visor glass), for the pilot's sight line
    const toPivot = nosePivot.matrixWorld.clone().invert(), m = new THREE.Matrix4();
    nosePivot.traverse(o => { if (!o.isMesh || o.material.name === 'Seal') return; const p = o.geometry.attributes.position, v = new THREE.Vector3();
      m.multiplyMatrices(toPivot, o.matrixWorld);            // the compressed mesh carries its own scale, so go through the matrices
      for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (v.z > 1.4) profile.push(v.y, v.z); } });
    dirty = true;
  }, undefined, e => console.error(e));

  // lowest view the pilot gets over the nose: the steepest ray from the eye that clears every point of the profile
  function aim(deg) {
    if (!nosePivot) return;
    nosePivot.rotation.x = deg * DEG;
    const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG), py = nosePivot.position.y, pz = nosePivot.position.z;
    let ang = -Math.PI / 2;
    for (let i = 0; i < profile.length; i += 2) { const y = profile[i], z = profile[i + 1]; ang = Math.max(ang, Math.atan2(py + y * c - z * s - EYE.y, pz + y * s + z * c - EYE.z)); }
    sight.geometry.setFromPoints([EYE, new THREE.Vector3(0, EYE.y + 70 * Math.sin(ang), EYE.z + 70 * Math.cos(ang))]); sight.computeLineDistances();
  }

  /* ---------- post: subtle bloom, then tone mapping, vignette and grain in one last pass ---------- */
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .22, .6, 1.8); composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: .022 }, exposure: { value: 1.02 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, grain, exposure; varying vec2 vUv;
      vec3 fit(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
      vec3 aces(vec3 c){                                     // the ACES filmic curve three.js uses
        const mat3 inM = mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777);
        const mat3 outM = mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602);
        return clamp(outM * fit(inM * (c * exposure / .6)), 0., 1.); }
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
        vec2 q = vUv - .5; c *= 1. - dot(q, q) * .22;
        c += (hash(gl_FragCoord.xy + time * 917.) - .5) * grain;
        gl_FragColor = vec4(c, 1.); }`
  });
  composer.addPass(grade);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    cam.aspect = w / h;
    // on a phone the readout card sits at the top, so slide the picture down into the gap between the two cards
    if (w < h) cam.setViewOffset(w, h, 0, -h * .1, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix(); dirty = true;
  }

  /* ---------- scroll: one scrubbed timeline for the nose and the camera ---------- */
  // wide side view -> dolly in on the front of the aircraft as the nose lowers to 5 degrees
  // -> a low three-quarter hero angle, nose and cockpit in full view, as it drops to 12.5
  const S = { deg: 0, sight: 0, cx: -104, cy: 7.5, cz: 2, tx: 0, ty: 5.2, tz: 2, fov: 26 };
  const FRONT = { cx: -50, cy: 7, cz: 33, tx: 0, ty: 4.6, tz: 19, fov: 28 };
  const HERO = { cx: -31, cy: 2.4, cz: 58, tx: 2, ty: 3.8, tz: 16, fov: 30 };
  let dirty = true;
  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onUpdate: () => { dirty = true; },
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: RM ? true : .6 } });
  tl.to(S, { ...FRONT, duration: .42 }, .02)
    .to(S, { deg: 5, duration: .26 }, .1)
    .to(S, { sight: 1, duration: .08, ease: 'none' }, .16)
    .to(S, { ...HERO, duration: .42 }, .54)
    .to(S, { deg: 12.5, duration: .26 }, .62)
    .set({}, {}, 1);
  if (window.lenis) window.lenis.on('scroll', ScrollTrigger.update);
  window.noseDriven = true;                                  // site.js now takes the nose angle from this timeline

  const target = new THREE.Vector3();
  let shownDeg = -1, lastGrain = -1;
  function frame(t) {
    requestAnimationFrame(frame);
    const r = section.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight) return;
    const tick = RM ? 0 : Math.floor(t / 42);                // new grain about 24 times a second
    if (!dirty && tick === lastGrain) return;
    if (dirty) {
      aim(S.deg); sight.material.opacity = .95 * S.sight;
      const pull = Math.max(1, 1.5 / cam.aspect);            // on a tall screen, step back so the aircraft still fits
      target.set(S.tx, S.ty, S.tz); cam.position.set(S.cx, S.cy, S.cz).sub(target).multiplyScalar(pull).add(target); cam.position.y = Math.max(cam.position.y, 1); cam.lookAt(target);
      if (cam.fov !== S.fov) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
      if (nosePivot && S.deg !== shownDeg) { castShadow(); shownDeg = S.deg; }
      window.dispatchEvent(new CustomEvent('concorde:nose', { detail: S.deg }));
      dirty = false;
    }
    lastGrain = tick; grade.uniforms.time.value = tick % 1000 / 1000;
    composer.render();
  }
  resize(); addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

if (canvas && gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  try { start(); } catch (e) { console.error(e); }
}
