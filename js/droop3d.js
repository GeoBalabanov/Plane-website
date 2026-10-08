/* Take-off scene: a real Concorde model lines up on a runway at golden hour, lowers its nose, rolls, rotates,
   lifts off, folds its gear and climbs through the cloud deck into the evening sun.
   Model: "Concorde" by manilov.ap (Sketchfab, CC BY 4.0), prepared by tools/build-concorde.mjs, which splits the
   nose from the fuselage and hangs it on a "NosePivot" node. Units are metres; +z towards the nose, +y up.
   The aircraft stays at the origin and the world moves past it: the runway, its lights and the clouds all read
   one distance value. A GSAP timeline scrubbed by ScrollTrigger drives everything. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
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
const MAIN_Z = -2.7;                                       // main bogies along the aircraft: the aircraft rotates about them
const BASE = 330, TOPS = 400;                              // cloud deck: base and tops, in metres above the runway

/* ---------- shared GLSL: the photographed evening sky ("Kloppenheim 06", Poly Haven, CC0), used by the dome,
   the haze on the ground and the clouds. Only its upper part is stored, so below the horizon it holds the horizon. ---------- */
const SKY = `
  uniform vec3 sunDir; uniform sampler2D tSky; uniform float skyRot, skyGain;
  vec3 sky(vec3 d){
    d = normalize(d);
    float u = atan(d.z, d.x) * .1591549 + .5 + skyRot, v = .5 - asin(clamp(d.y, -1., 1.)) * .3183099;
    vec3 c = texture2D(tSky, vec2(u, 1. - min(v, .552) / .56)).rgb;
    return pow(c, vec3(2.2)) * skyGain; }
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; } return v; }`;
const VERT = 'varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position, 1.); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }';

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  // colour stays linear until the last pass, which applies ACES tone mapping and the sRGB curve itself
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, 1, .5, 40000);
  // the photo's sun stands 12.6 degrees up; the sky is turned so it sits ahead and to the left, lighting the side the camera sees
  const SKY_ROT = -.2704, sunDir = new THREE.Vector3(-.6 * Math.cos(12.6 * DEG), Math.sin(12.6 * DEG), .8 * Math.cos(12.6 * DEG));
  const tex = (url, srgb) => { const t = new THREE.TextureLoader().load(url, () => { dirty = true; }); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  const skyTex = tex('assets/sky.webp'); skyTex.wrapT = THREE.ClampToEdgeWrapping; skyTex.generateMipmaps = false; skyTex.minFilter = THREE.LinearFilter;
  const U = { sunDir: { value: sunDir }, dist: { value: 0 }, time: { value: 0 }, tSky: { value: skyTex }, skyRot: { value: SKY_ROT }, skyGain: { value: .82 } };

  /* ---------- sky dome; the reflections and fill light come from the same sky as a full HDR ---------- */
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: U,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: SKY + 'varying vec3 d; void main(){ gl_FragColor = vec4(sky(d), 1.); }' });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 64, 32), skyMat); dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
  new RGBELoader().load('assets/sky.hdr', hdr => {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { t: { value: hdr }, rot: { value: SKY_ROT } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D t; uniform float rot; varying vec3 d; void main(){ vec3 n = normalize(d); gl_FragColor = vec4(texture2D(t, vec2(atan(n.z, n.x) * .1591549 + .5 + rot, asin(clamp(n.y, -1., 1.)) * .3183099 + .5)).rgb, 1.); }' })));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, .015, .1, 100).texture; pmrem.dispose(); hdr.dispose(); dirty = true;
  });

  /* ---------- the airfield: photographed asphalt and grass (Poly Haven, CC0) under real light and shadow; the markings,
     taxiway and the fields beyond are painted over them in the material ---------- */
  const tAsph = tex('assets/runway-albedo.webp'), tRough = tex('assets/runway-rough.webp'), tGrass = tex('assets/grass.webp');
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: .7 });
  groundMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { tAsph: { value: tAsph }, tRough: { value: tRough }, tGrass: { value: tGrass } });
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = 'varying vec3 vW; uniform sampler2D tAsph, tRough, tGrass; uniform float dist, time; float paved, rubber;\n' + SKY + `
      float band(float v, float a, float b){ float f = fwidth(v) * .75; return smoothstep(a - f, a + f, v) - smoothstep(b - f, b + f, v); }
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
    ` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        float x = vW.x, z = vW.z + dist, ax = abs(x);            // z: metres along the runway from the start of the roll
        vec2 g = vec2(x, z);
        float fade = 1. - smoothstep(.15, .9, fwidth(z) / 6.);   // markings melt away before they would shimmer
        // grass: the photo at two scales so it never repeats, mown in stripes along the runway, then fields
        vec3 grass = lin(texture2D(tGrass, g / 16.).rgb) * lin(texture2D(tGrass, g / 131. + .37).rgb) * 3.2 * vec3(.78, 1., .62);
        grass *= 1. + .08 * sign(sin(x * .13)) * fade * step(ax, 320.);
        float gust = noise((g - vec2(1.1, 1.6) / 1.94 * time * 7.) * .03) * .65 + noise((g - vec2(1.1, 1.6) / 1.94 * time * 11.) * .09) * .35;
        gust = smoothstep(.25, .85, gust); grass *= .8 + .45 * gust;   // gusts rolling over the grass as light and dark waves
        vec2 cell = floor((g + vec2(9000., 3000.)) / vec2(420., 300.)), fc = fract((g + vec2(9000., 3000.)) / vec2(420., 300.));
        float h = hash(cell), edge = min(min(fc.x, 1. - fc.x) * 420., min(fc.y, 1. - fc.y) * 300.);
        vec3 field = grass * (h < .3 ? vec3(1.35, 1.05, .7) : h < .55 ? vec3(.7, .85, .6) : h < .8 ? vec3(1.1, 1., .75) : vec3(.9, .75, .6));
        field = mix(field * .5, field, smoothstep(3., 14., edge));
        float airfield = smoothstep(560., 480., ax) * smoothstep(-1300., -1100., z) * smoothstep(5300., 5100., z);
        vec3 col = mix(field, grass * vec3(.78, .86, .62), airfield);   // under the blades: the shade inside thick grass
        // paved: runway (45 m) with shoulders, a parallel taxiway and four links between them
        float run = band(z, -300., 3900.) * band(ax, -1., 22.5), shoulder = band(z, -300., 3900.) * band(ax, 22.5, 30.);
        float twy = band(z, -900., 4500.) * band(x, 168.5, 191.5);
        float link = 0.; for (int i = 0; i < 4; i++){ float c = 600. + float(i) * 900.; link = max(link, band(z, c - 11.5, c + 11.5) * band(x, 20., 180.)); }
        paved = max(max(run, shoulder), max(twy, link));
        vec3 tar = lin(texture2D(tAsph, g / 22.).rgb) * mix(.75, 1.2, texture2D(tAsph, g / 190. + .5).r) * .62;
        rubber = (1. - smoothstep(3., 8., ax)) * (band(z, -300., 1000.) + band(z, 2900., 3900.));
        tar *= 1. - .45 * rubber * (.5 + .5 * texture2D(tAsph, vec2(x / 6., z / 160.)).r);
        col = mix(col, tar * 1.25, max(shoulder, max(twy, link)) * .9);
        col = mix(col, tar, run);
        // markings: worn white paint
        float wht = 0.;
        wht += band(z, -240., 3860.) * band(ax, -1., .45) * step(mod(z, 50.), 30.);                         // centreline
        wht += band(z, -300., 3900.) * band(ax, 20.6, 21.5);                                                  // edge lines
        wht += band(z, -290., -260.) * band(ax, 3., 21.) * step(1.6, mod(ax - 3., 3.4));                       // threshold piano keys
        wht += band(z, 100., 160.) * band(ax, 6.5, 16.5);                                                      // aiming points
        for (int i = 0; i < 3; i++){ float c = 250. + float(i) * 150.; wht += band(z, c, c + 22.5) * band(ax, 5., 14.) * step(1.1, mod(ax - 5., 3.)); }   // touchdown zone
        col = mix(col, vec3(.58, .57, .54) * (.7 + .5 * texture2D(tAsph, g / 9.).r), clamp(wht, 0., 1.) * run * fade * (1. - .5 * rubber));
        float yel = (band(x, 179.6, 180.4) * band(z, -900., 4500.) + band(z, 599.6, 600.4) * band(x, 22., 180.)) * fade;
        col = mix(col, vec3(.5, .34, .04), clamp(yel, 0., 1.) * .8);
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.97, .55 + .4 * texture2D(tRough, vec2(vW.x, vW.z + dist) / 22.).r, paved);')
      .replace('#include <fog_fragment>', `
        vec3 vd = vW - cameraPosition;                           // the haze of distance takes on the colour of the sky behind it
        gl_FragColor.rgb = mix(gl_FragColor.rgb, sky(vec3(vd.x, length(vd.xz) * .012, vd.z)), 1. - exp(-length(vd) / 6500.));`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true; ground.renderOrder = -9; ground.frustumCulled = false; scene.add(ground);

  /* ---------- real grass: blades that sway in the wind, in two fields that follow the camera across the airfield: a fine
     56 m patch at its feet and a 240 m field of fuller clumps beyond, out to where the photographed grass takes over.
     Each tuft keeps its own place on the ground (the field wraps, it does not slide) and stays off the tarmac. ---------- */
  const PHONE = matchMedia('(max-width: 720px)').matches;
  function makeGrass({ T, count, blades, spread, h, w, hole, seg }) {
    const geo = new THREE.InstancedBufferGeometry();
    // a tuft: several tapered blades leaning out from one root, each in four segments so it can bend
    // position: the blade's root in the tuft (metres) and its height (0 to 1); lean: how far its tip falls outwards,
    // in heights; wv: which way and how wide the blade is at this point, in blade widths
    const pos = [], lean = [], wv = [], idx = [];
    for (let b = 0; b < blades; b++) {
      const a = b * 2.4 + Math.random(), c = Math.cos(a), sn = Math.sin(a), ox = (Math.random() - .5) * spread, oz = (Math.random() - .5) * spread, base = pos.length / 3;
      const l = .12 + Math.random() * .3, tall = .65 + Math.random() * .35;
      for (let i = 0; i <= seg; i++) { const y = i / seg, wd = .5 * (1 - y * .92);
        for (const sd of [-1, 1]) { pos.push(ox, y * tall, oz); lean.push(-sn * l * y * y, c * l * y * y); wv.push(sd * wd * c, sd * wd * sn); } }
      for (let i = 0; i < seg; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    geo.setAttribute('lean', new THREE.Float32BufferAttribute(lean, 2)); geo.setAttribute('wv', new THREE.Float32BufferAttribute(wv, 2));
    const off = new Float32Array(count * 2), shape = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      off[i * 2] = Math.random() * T; off[i * 2 + 1] = Math.random() * T;
      shape[i * 4] = h[0] + Math.pow(Math.random(), 2.2) * h[1];       // height, m
      shape[i * 4 + 1] = w[0] + Math.random() * w[1];                  // blade width, m
      shape[i * 4 + 2] = Math.random() * 6.283;                        // turn
      shape[i * 4 + 3] = Math.random();                                // colour and stiffness
    }
    geo.setAttribute('off', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('shape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.instanceCount = count;
    const u = Object.assign({}, U, { focus: { value: new THREE.Vector2() }, hole: { value: new THREE.Vector3(0, 0, hole || 0) } });
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, side: THREE.DoubleSide,
      vertexShader: `uniform float dist, time; uniform vec2 focus; uniform vec3 hole, sunDir;
        attribute vec2 off, lean, wv; attribute vec4 shape; varying float vH, vTone, vLit, vFog; varying vec3 vW;
        float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1)), f.x), f.y); }
        float band(float v, float a, float b){ return step(a, v) * step(v, b); }
        void main(){
          // the nearest copy of this tuft to the focus, in runway coordinates (z along the runway)
          vec2 w = focus + mod(off - focus + ${T / 2}., ${T}.) - ${T / 2}.;
          float ax = abs(w.x), z = w.y;
          float paved = band(z, -305., 3905.) * band(ax, 0., 31.) + band(z, -905., 4505.) * band(w.x, 166., 194.);
          for (int i = 0; i < 4; i++){ float c = 600. + float(i) * 900.; paved += band(z, c - 13., c + 13.) * band(w.x, 18., 182.); }
          float edge = 1. - smoothstep(${(T * .3).toFixed(1)}, ${(T * .5).toFixed(1)}, length(w - focus));
          float inner = hole.z > 0. ? smoothstep(hole.z * .55, hole.z * .85, length(w - hole.xy)) : 1.;   // the fine patch has this ground
          float keep = (1. - min(paved, 1.)) * edge * inner;
          float h = shape.x * keep * (.7 + .6 * n2(w * .3)), wd = shape.y, a = shape.z;
          float y = position.y;
          vec3 p = vec3(position.x + lean.x * h + wv.x * wd, position.y * h, position.z + lean.y * h + wv.y * wd);
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          // wind: gusts that roll across the field and lay the grass over, a sway, and a quick flutter at the tips
          vec2 wdir = normalize(vec2(1.1, 1.6));
          float gust = n2((w - wdir * time * 7.) * .03) * .65 + n2((w - wdir * time * 11.) * .09) * .35;
          gust = smoothstep(.25, .85, gust);
          float sway = .1 + gust * 1.05 + sin(time * 2.1 + dot(w, vec2(.6, .35)) + shape.w * 6.) * .1 + sin(time * 5.3 + shape.w * 17.) * .03;
          float bend = y * y * sway * h * (1.3 - shape.w * .5);
          p.xz += wdir * bend; p.y -= bend * bend * .45 / max(h, .01);
          vec3 world = vec3(w.x + p.x, p.y, w.y - dist + p.z);
          vH = y; vTone = shape.w; vW = world;
          // light: the sun through the blades from behind; laid-over grass shows its pale side
          vec3 n = normalize(vec3(-sin(a), .35, cos(a)));
          vLit = abs(dot(n, sunDir)) * .65 + .3 + gust * .45;
          vec4 mv = modelViewMatrix * vec4(world, 1.);
          vFog = 1. - exp(-length(mv.xyz) / 6500.);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: SKY + `varying float vH, vTone, vLit, vFog; varying vec3 vW;
        void main(){
          // olive at the root, sun-dried straw at some tips, like late-summer airfield grass
          vec3 root = vec3(.05, .05, .02), mid = mix(vec3(.12, .12, .045), vec3(.17, .145, .06), vTone);
          vec3 tip = mix(vec3(.22, .2, .085), vec3(.36, .29, .13), smoothstep(.4, 1., vTone));
          vec3 c = vH < .45 ? mix(root, mid, vH / .45) : mix(mid, tip, (vH - .45) / .55);
          c *= vec3(1.25, 1.08, .92) * (.55 + vLit * .7);
          vec3 v = vW - cameraPosition;
          c = mix(c, sky(vec3(v.x, length(v.xz) * .012, v.z)) * .92, vFog);
          gl_FragColor = vec4(c, 1.);
        }` }));
    mesh.frustumCulled = false; mesh.renderOrder = -8; scene.add(mesh);
    return { mesh, u, T };
  }
  const GT = 56;
  const fields = [
    makeGrass({ T: GT, count: PHONE ? 34000 : 95000, blades: 3, spread: .07, h: [.08, .26], w: [.007, .012], seg: 3 }),
    makeGrass({ T: 200, count: PHONE ? 36000 : 110000, blades: 7, spread: .5, h: [.18, .36], w: [.025, .04], hole: GT * .5, seg: 1 }),
  ];
  const grass = { set visible(v) { fields.forEach(f => f.mesh.visible = v); }, get visible() { return fields[0].mesh.visible; } };

  /* ---------- airfield lights: points that the runway carries past the aircraft ---------- */
  const lights = { p: [], c: [], s: [] };
  const L = (x, y, z, c, s) => { lights.p.push(x, y, z); lights.c.push(...c); lights.s.push(s); };
  const WARM = [1, .9, .74], AMBER = [1, .58, .16], RED = [1, .12, .07], GREEN = [.2, 1, .45], BLUE = [.2, .4, 1];
  for (let z = -300; z <= 3900; z += 60) for (const s of [-1, 1]) L(s * 24.5, .4, z, z > 3300 ? AMBER : WARM, .7);
  for (let z = -240, i = 0; z <= 3860; z += 30, i++) L(0, .06, z, z > 3600 ? RED : z > 3000 && i % 2 ? RED : [.85, .92, 1], .45);
  for (let x = -21; x <= 21; x += 1.5) { L(x, .3, -300, GREEN, .55); L(x, .3, 3900, RED, .55); }
  for (let k = 1; k <= 30; k++) { const z = -300 - k * 30, y = .4 + k * .25;
    for (let x = -2; x <= 2; x++) L(x, y, z, WARM, .55);
    if (k % 10 === 0) for (let x = -15; x <= 15; x += 1.5) if (Math.abs(x) > 3) L(x, y, z, WARM, .55); }
  for (let z = -900; z <= 4500; z += 30) for (const x of [167.5, 192.5]) L(x, .3, z, BLUE, .45);
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.Float32BufferAttribute(lights.p, 3));
  lightGeo.setAttribute('color', new THREE.Float32BufferAttribute(lights.c, 3));
  lightGeo.setAttribute('size', new THREE.Float32BufferAttribute(lights.s, 1));
  const lightMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { dist: U.dist, scale: { value: 1000 }, glow: { value: .9 } },
    vertexShader: `uniform float dist, scale; attribute vec3 color; attribute float size; varying vec3 c; varying float a;
      void main(){ vec3 p = position; p.z -= dist; vec4 mv = modelViewMatrix * vec4(p, 1.);
        float px = size * scale / -mv.z; a = clamp(px / 2., 0., 1.) * exp(-length(mv.xyz) / 4000.); c = color;
        gl_PointSize = clamp(px * .6, 1.5, 16.); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float glow; varying vec3 c; varying float a;
      void main(){ vec2 q = gl_PointCoord - .5; float r = dot(q, q) * 4.; float k = exp(-r * 9.) * 1.6 + exp(-r * 2.6) * .22;
        gl_FragColor = vec4(c * k * glow * a, 1.); }` });
  const lightPts = new THREE.Points(lightGeo, lightMat); lightPts.frustumCulled = false; scene.add(lightPts);

  /* ---------- the cloud deck: a broken base seen from below, a sea of tops seen from above ---------- */
  const deckMat = (top) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: U, vertexShader: VERT,
    fragmentShader: SKY + `uniform float dist, time; varying vec3 w;
      float cl(vec2 p){ return fbm(p) * .75 + fbm(p * 3.1 + 7.) * .25; }
      void main(){
        vec2 p = (w.xz + vec2(time * 3., dist)) / ${top ? '520.' : '1300.'};
        float n = cl(p);
        vec3 v = normalize(w - cameraPosition), hz = sky(normalize(vec3(v.x, 0., v.z)));
        float az = dot(normalize(v.xz + 1e-5), normalize(sunDir.xz)) * .5 + .5, d = length(w - cameraPosition), col_a;
        vec3 col;
        ${top ? `
        float e = .01;
        vec3 nn = normalize(vec3(-(cl(p + vec2(e, 0)) - n) / e * .55, 1., -(cl(p + vec2(0, e)) - n) / e * .55));
        float lit = clamp(.35 + 2.2 * dot(nn, sunDir), 0., 1.), deep = smoothstep(.25, .75, n);
        col = mix(vec3(.3, .32, .5), vec3(1.25, .9, .62), lit) * (.55 + .6 * deep);
        col += vec3(1., .55, .3) * pow(az, 6.) * .35 * deep;          // the sun side of the sea glows
        col_a = smoothstep(.22, .42, n);
        col = mix(col, hz * .95, 1. - exp(-d / 9000.));` : `
        col = mix(vec3(.38, .36, .42), vec3(.5, .46, .5), n) * 1.25;
        col += vec3(1., .5, .25) * pow(az, 5.) * .55 * (1. - n);         // the low sun warms the undersides on its side of the sky
        col_a = smoothstep(.46, .64, n) * .94;
        col = mix(col, hz, 1. - exp(-d / 7000.));`}
        gl_FragColor = vec4(col, col_a); }` });
  const deckTops = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), deckMat(true)); deckTops.position.y = TOPS;
  for (const m of [deckTops]) { m.frustumCulled = false; m.renderOrder = -5; scene.add(m); }

  // loose puffs in and around the deck: they stream past as the aircraft climbs through
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.283, r = Math.pow(Math.random(), .7) * 70, x = 128 + Math.cos(a) * r * 1.2, y = 136 + Math.sin(a) * r * .55, R = 26 + Math.random() * 44;
      const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, 40, 0, 220); sh.addColorStop(0, '#fff3e4'); sh.addColorStop(.55, '#e4d6d6'); sh.addColorStop(1, '#8e8a9c');
    g.fillStyle = sh; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  const puffs = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: new THREE.Color(1.5, 1.4, 1.35), rotation: (Math.random() - .5) * .3 }));
    const size = 90 + Math.random() * 190; s.scale.set(size * 1.7, size, 1);
    const side = Math.random() < .5 ? -1 : 1;
    s.userData = { x: side * (14 + Math.random() * 300), y: BASE - 60 + Math.random() * (TOPS - BASE + 90), z0: Math.random() * 2600, o: .55 + Math.random() * .4 };
    puffs.push(s); scene.add(s);
  }

  /* ---------- light: the low sun of the photo, with real shadows; the sky itself fills in through the reflections ---------- */
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const sun = new THREE.DirectionalLight(0xffb070, 4.2); sun.castShadow = true; scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 400 }); sun.shadow.camera.updateProjectionMatrix();

  /* ---------- soft contact shadow: depth seen from under the aircraft, blurred, laid on the tarmac ---------- */
  const SW = 44, SL = 84, SH = 22, SZ = 3;                  // shadow area (width, length), height it looks up, centre along the aircraft
  const rtA = new THREE.WebGLRenderTarget(512, 1024), rtB = new THREE.WebGLRenderTarget(512, 1024);
  rtA.texture.generateMipmaps = rtB.texture.generateMipmaps = false;
  const shadowCam = new THREE.OrthographicCamera(-SW / 2, SW / 2, SL / 2, -SL / 2, 0, SH);
  shadowCam.rotation.x = Math.PI / 2; shadowCam.layers.set(1);
  const depthMat = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false });
  depthMat.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.4 ) * 1.3 );'); };
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(SW, SL).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rtA.texture, color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
  shadowPlane.position.set(0, .03, SZ); shadowPlane.scale.y = -1; shadowPlane.renderOrder = -8; scene.add(shadowPlane);   // scale flips it to face up
  const blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), blurScene = new THREE.Scene().add(blurQuad);
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader), vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  function blur(amount) {
    blurQuad.material = hBlur; hBlur.uniforms.tDiffuse.value = rtA.texture; hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtB); renderer.render(blurScene, blurCam);
    blurQuad.material = vBlur; vBlur.uniforms.tDiffuse.value = rtB.texture; vBlur.uniforms.v.value = amount / 256 * (SW / SL);
    renderer.setRenderTarget(rtA); renderer.render(blurScene, blurCam);
  }
  function castShadow(alt) {
    shadowCam.position.set(0, alt - .6, SZ); shadowCam.updateMatrixWorld();
    scene.overrideMaterial = depthMat;
    const clear = renderer.getClearAlpha(); renderer.setClearAlpha(0);
    renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(scene, shadowCam);
    scene.overrideMaterial = null;
    const spread = 1 + alt * .12; blur(2.2 * spread); blur(.9 * spread);
    renderer.setRenderTarget(null); renderer.setClearAlpha(clear);
    shadowPlane.material.opacity = .55 * (1 - THREE.MathUtils.smoothstep(alt, 0, 26));
  }

  /* ---------- the aircraft: rig (altitude) > pitch (about the main bogies) > aircraft ---------- */
  const rig = new THREE.Group(), pitch = new THREE.Group(), aircraft = new THREE.Group();
  pitch.position.z = MAIN_Z; aircraft.position.set(0, STAND, -MAIN_Z);
  rig.add(pitch); pitch.add(aircraft); scene.add(rig);

  /* The model comes without landing gear, so the gear is built here from Concorde's real layout:
     wheelbase 18.19 m, track 7.72 m, four-wheel main bogies and a twin-wheel nose leg. Its origin is on the ground.
     Each leg hangs from its own pivot so it can fold up: the mains inwards, the nose leg forwards. */
  const gear = new THREE.Group(); gear.position.y = -STAND; aircraft.add(gear);
  const legs = [];
  {
    const std = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .9 });
    const rubber = std(0x101112, .85, 0), alloy = std(0x8d9095, .42, .75), chrome = std(0xd9dbde, .14, 1), dark = std(0x1d1f22, .6, .3);
    let into = gear, off = new THREE.Vector3();
    const leg = (x, y, z, axis, sign) => { const g = new THREE.Group(); g.position.set(x, y, z); gear.add(g); into = g; off.set(x, y, z); legs.push({ g, axis, sign }); };
    const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z).sub(off); m.layers.enable(1); m.castShadow = true; into.add(m); return m; };
    const rod = (mat, r, a, b) => {                          // a cylinder from point a to point b
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = put(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 20), mat, 0, 0, 0);
      m.position.copy(A).add(B).multiplyScalar(.5).sub(off); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return m;
    };
    const wheel = (x, z, R, w) => {
      const s = R * .16, tyre = new THREE.LatheGeometry([[R * .58, -w / 2], [R - s, -w / 2], [R - s * .3, -w / 2 + s * .3], [R, -w / 2 + s], [R, w / 2 - s], [R - s * .3, w / 2 - s * .3], [R - s, w / 2], [R * .58, w / 2]].map(p => new THREE.Vector2(...p)), 40).rotateZ(Math.PI / 2);
      put(tyre, rubber, x, R, z).material.side = THREE.DoubleSide; put(new THREE.CylinderGeometry(R * .56, R * .56, w * .8, 32).rotateZ(Math.PI / 2), alloy, x, R, z);
      put(new THREE.CylinderGeometry(R * .2, R * .2, w * 1.04, 20).rotateZ(Math.PI / 2), dark, x, R, z);
    };
    // main gear: under the wing, just inboard of the engine nacelles
    for (const side of [-1, 1]) {
      const x = side * 3.86, z = MAIN_Z, top = STAND + .7;
      leg(x, top, z, 'z', -side);
      for (const dz of [-.84, .84]) { for (const dx of [-.34, .34]) wheel(x + dx, z + dz, .6, .4); rod(dark, .07, [x - .5, .6, z + dz], [x + .5, .6, z + dz]); }
      put(new THREE.BoxGeometry(.24, .26, 2.0), alloy, x, .62, z);                      // bogie beam
      rod(chrome, .105, [x, .62, z], [x, 1.7, z]); rod(alloy, .17, [x, 1.6, z], [x, top, z]);
      rod(alloy, .075, [x, 2.05, z], [x - side * 1.5, top, z]);                          // side brace
      rod(alloy, .06, [x, 1.75, z], [x, top - .2, z + 1.5]);                             // drag brace
      rod(dark, .04, [x, .8, z - .26], [x, 1.5, z - .2]);                                // torque link
    }
    // nose gear: a long leg under the forward cabin
    { const z = 15.5, top = STAND + 1.15;
      leg(0, top, z, 'x', -1);
      for (const dx of [-.25, .25]) wheel(dx, z, .4, .26);
      rod(dark, .06, [-.4, .4, z], [.4, .4, z]);
      rod(chrome, .08, [0, .4, z], [0, 1.9, z]); rod(alloy, .13, [0, 1.8, z], [0, top, z]);
      rod(alloy, .055, [0, 2.1, z], [0, top - .1, z + 1.9]);                              // drag brace
      rod(dark, .035, [0, .55, z - .2], [0, 1.55, z - .16]);
    }
  }
  function stow(k) {                                         // 0: gear down, 1: folded away
    for (const { g, axis, sign } of legs) { g.rotation[axis] = sign * k * Math.PI / 2; g.visible = k < .97; }
  }

  /* Reheat: Olympus afterburner flames from the four nozzles, with the bright bands of shock diamonds */
  const flameMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: U.time, power: { value: 0 } },
    vertexShader: `varying float along; varying float rim; uniform float power;
      void main(){ along = -position.z / 7.; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.);
        rim = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time, power; varying float along; varying float rim;
      void main(){
        float diamonds = .55 + .45 * smoothstep(.55, 1., cos(along * 6.283 * 3.2 - .6));
        float flick = .86 + .14 * sin(time * 47. + along * 23.) * sin(time * 31. - along * 11.);
        vec3 c = mix(vec3(1., .82, .62) * 5., vec3(1., .38, .1) * 2.2, smoothstep(0., .8, along));
        float a = pow(1. - along, 1.6) * pow(rim, 1.4) * diamonds * flick * power;
        gl_FragColor = vec4(c * a, 1.); }` });
  const flameGeo = new THREE.CylinderGeometry(.62, .16, 7, 28, 24, true).rotateX(Math.PI / 2).translate(0, 0, -3.5);
  const coreGeo = new THREE.CylinderGeometry(.4, .05, 4.4, 20, 12, true).rotateX(Math.PI / 2).translate(0, 0, -2.2);
  for (const x of [-6.2, -4.75, 4.75, 6.2]) for (const geo of [flameGeo, coreGeo]) {
    const f = new THREE.Mesh(geo, flameMat); f.position.set(x, .73, -15.05); f.renderOrder = 2; aircraft.add(f);
  }

  let nosePivot = null, profile = [];
  const EYE = new THREE.Vector3(0, 3.38, 25.4);             // pilot's eye, in the aircraft frame
  const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([EYE, EYE.clone().setZ(90)]),
    new THREE.LineDashedMaterial({ color: 0xff5a1f, dashSize: .7, gapSize: .45, transparent: true, opacity: 0 }));
  sight.computeLineDistances(); aircraft.add(sight);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('assets/models/concorde.glb', gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.layers.enable(1); o.castShadow = o.receiveShadow = true;   // layer 1 is what the contact shadow sees
      const m = o.material; if (m.name !== 'Seal') { m.roughness = .32; m.envMapIntensity = .55; }
      if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    aircraft.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
    nosePivot = gltf.scene.getObjectByName('NosePivot');
    // side profile of the solid nose (ahead of the visor glass), for the pilot's sight line
    const toPivot = nosePivot.matrixWorld.clone().invert(), m = new THREE.Matrix4();
    nosePivot.traverse(o => { if (!o.isMesh || o.material.name === 'Seal') return; const p = o.geometry.attributes.position, v = new THREE.Vector3();
      m.multiplyMatrices(toPivot, o.matrixWorld);            // the compressed mesh carries its own scale, so go through the matrices
      for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (v.z > 1.4) profile.push(v.y, v.z); } });
    shownKey = ''; dirty = true;
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

  /* ---------- post: speed blur and the inside of the cloud, bloom, then tone mapping, vignette and grain ---------- */
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, cam));
  const dof = new BokehPass(scene, cam, { focus: 60, aperture: .00012, maxblur: .0065 }); composer.addPass(dof);   // a long lens: soft sky, soft foreground
  { const r = dof.render.bind(dof); dof.render = (...a) => { const v = grass.visible; grass.visible = false; r(...a); grass.visible = v; }; }   // its depth pass cannot follow the blades: the ground beneath stands in
  const air = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, speed: { value: 0 }, cloud: { value: 0 }, time: U.time, centre: { value: new THREE.Vector2(.5, .5) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float speed, cloud, time; uniform vec2 centre; varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y); }
      void main(){
        vec2 d = vUv - centre; float r = length(d);
        vec3 c = vec3(0.);                                    // a radial blur that grows towards the edges with speed
        float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);   // jittered taps: a smooth streak, never ghost copies
        for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv - d * speed * smoothstep(.3, .85, r) * (float(i) + j) / 12.).rgb;
        c /= 12.;
        if (cloud > 0.) {                                     // inside the deck: soft white wisps racing past
          vec2 q = d * vec2(1.6, 1.) / (r + .3);
          float n = noise(q * 3. + vec2(0., time * 2.6)) * .6 + noise(q * 7. - vec2(time * 1.3, time * 4.)) * .4;
          float k = clamp(cloud * (.72 + .5 * n) - .08 * (1. - r), 0., .97);
          c = mix(c, vec3(1.45, 1.38, 1.36) * (.9 + .1 * n), k);
        }
        gl_FragColor = vec4(c, 1.); }`
  });
  composer.addPass(air);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .3, .55, 1.7); composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: .022 }, exposure: { value: .92 } },
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
        float l = dot(c, vec3(.2126, .7152, .0722));                // golden hour grade: warm highlights, cool shadows
        c *= mix(vec3(.9, .97, 1.08), vec3(1.08, 1., .88), smoothstep(.05, .6, l));
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
        c = mix(vec3(dot(c, vec3(.33))), c, 1.06); c = (c - .5) * 1.06 + .5;
        vec2 q = vUv - .5; c *= 1. - dot(q, q) * .26;
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

  /* ---------- scroll: one scrubbed timeline for the whole take-off ---------- */
  // camera offsets are measured from the main bogies; fy is how much the camera rises with the aircraft (0: it stays by the runway)
  const S = { deg: 0, sight: 0, dist: 0, pitch: 0, alt: 0, gear: 0, reheat: 0, mach: 0, blur: 0, fy: 1,
    cx: -150, cy: 5, cz: 20, tx: 0, ty: 4.4, tz: 3, fov: 17 };
  const shot = (cx, cy, cz, tx, ty, tz, fov) => ({ cx, cy, cz, tx, ty, tz, fov });
  // a long lens throughout, as aviation is filmed: the aircraft fills the frame and the world behind it compresses
  const LINEUP = shot(-78, 2.2, 92, 0, 4.4, 15, 17);       // front three-quarter while the nose comes down
  const ROLL_A = shot(-52, 1.1, 92, 0, 3.6, 6, 19);        // low by the nose wheel as the roll begins
  const ROLL_B = shot(-56, 1.3, -88, 0, 3.8, -2, 18);      // swung round behind the wing: reheat and the runway streaming away
  const ROTATE = shot(-105, 1.4, -6, 0, 5.2, 0, 16);       // side on for rotation
  const LIFT = shot(-80, 1, -60, 0, 4, 2, 18);             // the camera stays on the ground as the aircraft climbs away
  const CLIMB = shot(-70, 12, -105, 0, 3, 6, 19);          // chase from behind and above, the airfield falling away
  const CLOUD = shot(-40, 5, -38, 0, 4, 3, 24);            // close in through the deck
  const ABOVE = shot(-100, 34, 66, 0, 1, 9, 18);           // side on over the sea of cloud
  let dirty = true;
  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onUpdate: () => { dirty = true; },
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: RM ? true : .6 } });
  tl.to(S, { ...LINEUP, duration: .16 }, 0)
    .to(S, { deg: 5, duration: .1 }, .04)
    .to(S, { sight: 1, duration: .03, ease: 'none' }, .11)
    .to(S, { sight: 0, duration: .03, ease: 'none' }, .19)
    .to('#droop h2, #droop .kicker', { autoAlpha: 0, duration: .05, ease: 'none' }, .17)
    .to(S, { reheat: 1, duration: .04, ease: 'power1.out' }, .19)
    .to(S, { dist: 1700, mach: .3, duration: .38, ease: 'power2.in' }, .2)          // the roll: accelerating
    .to(S, { dist: 5460, mach: .42, duration: .42, ease: 'none' }, .58)             // then onwards at the same speed
    .to(S, { ...ROLL_A, duration: .12 }, .19)
    .to(S, { ...ROLL_B, duration: .16 }, .33)
    .to(S, { blur: .012, duration: .18, ease: 'power1.in' }, .4)
    .to(S, { ...ROTATE, duration: .08 }, .49)
    .to(S, { pitch: 10, duration: .09, ease: 'sine.inOut' }, .52)                   // rotation
    .set(S, { fy: 0 }, .58)
    .to(S, { alt: 34, duration: .12, ease: 'power1.in' }, .6)                       // lift-off
    .to(S, { pitch: 13, duration: .08, ease: 'sine.inOut' }, .61)
    .to(S, { ...LIFT, blur: .004, duration: .1 }, .58)
    .to(S, { gear: 1, duration: .09, ease: 'power1.inOut' }, .68)
    .to(S, { ...CLIMB, fy: 1, duration: .12 }, .7)
    .to(S, { alt: 250, duration: .14, ease: 'power1.inOut' }, .72)
    .to(S, { deg: 0, duration: .1 }, .74)                                           // nose back up for the climb
    .to(S, { reheat: 0, duration: .06, ease: 'power1.in' }, .8)
    .to(S, { alt: 470, duration: .12, ease: 'power1.inOut' }, .86)
    .to(S, { ...CLOUD, blur: .008, duration: .08 }, .84)
    .to(S, { ...ABOVE, blur: 0, duration: .08 }, .92)
    .to(S, { pitch: 7, duration: .1 }, .9)
    .set({}, {}, 1);
  if (window.lenis) window.lenis.on('scroll', ScrollTrigger.update);
  window.noseDriven = true;                                  // site.js now takes the nose angle from this timeline

  const target = new THREE.Vector3(), hudAlt = document.getElementById('hud-alt'), hudMach = document.getElementById('hud-mach');
  const shake = new THREE.Vector3();
  let shownKey = '', lastGrain = -1, scale = 1;
  function frame(ms) {
    requestAnimationFrame(frame);
    const r = section.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight) return;
    const tick = RM ? 0 : Math.floor(ms / 42);               // new grain about 24 times a second
    const live = !RM && (S.reheat > .01 || air.uniforms.cloud.value > .01);   // flames and cloud move on their own
    if (!dirty && !live && tick === lastGrain) return;
    U.time.value = ms / 1000;
    if (dirty || live) {
      aim(S.deg); sight.material.opacity = .95 * S.sight;
      rig.position.y = S.alt; pitch.rotation.x = -S.pitch * DEG; stow(S.gear);
      U.dist.value = S.dist; flameMat.uniforms.power.value = S.reheat;
      // the camera: offset from the bogies, stepped back on a tall screen, with the rumble of the runway
      const pull = Math.max(1, 1.5 / cam.aspect);
      target.set(S.tx, S.ty + S.alt, S.tz + MAIN_Z);
      cam.position.set(S.cx, S.cy, S.cz + MAIN_Z).sub(new THREE.Vector3(S.tx, S.ty, S.tz + MAIN_Z)).multiplyScalar(pull).add(target);
      cam.position.y += S.alt * (S.fy - 1); cam.position.y = Math.max(cam.position.y, .8);
      if (!RM) { const t = ms / 1000, k = S.reheat * (S.alt < 1 ? .06 : .012) * (.3 + S.mach * 2.4);
        shake.set(Math.sin(t * 37) * Math.sin(t * 13), Math.sin(t * 41 + 1) * Math.sin(t * 17), 0).multiplyScalar(k); cam.position.add(shake); }
      cam.lookAt(target);
      { const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
        fields.forEach(F => F.u.focus.value.set(cam.position.x + f.x * F.T * .32, cam.position.z + f.z * F.T * .32 + S.dist));
        fields[1].u.hole.value.x = fields[0].u.focus.value.x; fields[1].u.hole.value.y = fields[0].u.focus.value.y;
        grass.visible = cam.position.y < 60; }
      sun.target.position.set(0, S.alt, 0); sun.position.copy(sunDir).multiplyScalar(150).add(sun.target.position);
      dof.uniforms.focus.value = cam.position.distanceTo(target);
      if (cam.fov !== S.fov) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
      scale = canvas.height / (2 * Math.tan(cam.fov * DEG / 2)); lightMat.uniforms.scale.value = scale;
      // speed blur centred on the aircraft
      const c = target.clone().project(cam); air.uniforms.centre.value.set(c.x * .5 + .5, c.y * .5 + .5); air.uniforms.speed.value = RM ? 0 : S.blur;
      // inside the cloud deck the picture goes white
      const y = cam.position.y, inside = THREE.MathUtils.smoothstep(y, BASE - 6, BASE + 14) * (1 - THREE.MathUtils.smoothstep(y, TOPS - 10, TOPS + 8));
      air.uniforms.cloud.value = inside;
      // puffs ride the same distance as the runway, and fade in and out at the ends of their loop
      for (const p of puffs) { const u = p.userData, z = ((u.z0 - S.dist * .9) % 2600 + 2600) % 2600 - 1300;
        p.position.set(u.x, u.y, z); const d = p.position.distanceTo(cam.position);
        p.material.opacity = u.o * (1 - THREE.MathUtils.smoothstep(Math.abs(z), 900, 1300)) * THREE.MathUtils.smoothstep(d, 20, 90) * Math.exp(-d / 5000)
          * (1 - THREE.MathUtils.smoothstep(cam.position.y, TOPS + 4, TOPS + 30)) * THREE.MathUtils.smoothstep(cam.position.y, 150, 260); }   // gone once the aircraft is above the deck
      const key = [S.deg.toFixed(2), S.pitch.toFixed(2), S.alt.toFixed(1), S.gear.toFixed(2)].join();
      if (nosePivot && key !== shownKey && S.alt < 40) { castShadow(S.alt); shownKey = key; }
      shadowPlane.visible = S.alt < 30;
      window.dispatchEvent(new CustomEvent('concorde:nose', { detail: { deg: S.deg, air: S.alt > 1 } }));
      if (r.top <= 0 && r.bottom >= innerHeight) {           // while the scene is pinned it owns the flight readout
        hudAlt.textContent = (Math.round(S.alt * 4.26 / 10) * 10).toLocaleString('en-GB') + ' ft';
        hudMach.textContent = S.mach.toFixed(2);
      }
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
