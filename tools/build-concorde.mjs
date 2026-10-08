/* Builds assets/models/concorde.glb from the Sketchfab download in assets/raw/concorde.glb
   ("Concorde" by manilov.ap, CC BY 4.0).  Run:  cd tools && npm install && npm run build

   The download has the whole fuselage, nose included, as one mesh (S01). This script
   1. drops the display pose and bakes every part into the aircraft's own frame
      (metres; +z towards the nose, +y up, lowest point at y = 0),
   2. cuts the fuselage on the plane z = HINGE_Z, just ahead of the windscreen, into "Fuselage"
      and "Nose", caps both openings, and hangs the nose on a "NosePivot" node low on the cut
      (the two small strakes under the cockpit cross that plane but stay whole on the fuselage),
   3. removes duplicated engine parts, merges what shares a material, converts textures to WebP
      and compresses the geometry with meshopt. */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, join, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const SRC = new URL('../assets/raw/concorde.glb', import.meta.url).pathname;
const OUT = new URL('../assets/models/concorde.glb', import.meta.url).pathname;
const HINGE_Z = 25.95;                                   // base of the windscreen, in the aircraft frame before grounding
const DUPLICATES = /^Sphere0[1-8]-/;                     // nozzle parts that exist twice in the download
const NAMES = { S01: 'Fuselage', Object04: 'WingRight', Object10: 'WingLeft', SShape07: 'Fin' };

const io = new NodeIO();
const src = await io.read(SRC), sroot = src.getRoot();
// the two top nodes only hold Sketchfab's display pose
for (const n of sroot.listNodes()) if (n.getName() === 'Sketchfab_model' || n.getName().startsWith('Concorde')) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }

/* ---------- read every part as plain triangles in the aircraft frame ---------- */
const parts = [];
for (const node of sroot.listNodes()) {
  const mesh = node.getMesh(); if (!mesh || DUPLICATES.test(mesh.getName())) continue;
  const m = node.getWorldMatrix();
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
    const count = I ? I.getCount() : P.getCount(), verts = [], p = [], n = [], u = [];
    for (let i = 0; i < count; i++) {
      const k = I ? I.getScalar(i) : i; P.getElement(k, p); N.getElement(k, n); U.getElement(k, u);
      // positions take the full matrix; normals its rotation part (the scaled parts are flat plates, so this is close enough)
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      let nx = m[0] * n[0] + m[4] * n[1] + m[8] * n[2], ny = m[1] * n[0] + m[5] * n[1] + m[9] * n[2], nz = m[2] * n[0] + m[6] * n[1] + m[10] * n[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      verts.push({ p: [x, y, z], n: [nx / l, ny / l, nz / l], u: [u[0], u[1]] });
    }
    if (det < 0) for (let i = 0; i < verts.length; i += 3) { const t = verts[i + 1]; verts[i + 1] = verts[i + 2]; verts[i + 2] = t; }
    const key = mesh.getName().replace('-FACES', '');
    parts.push({ name: NAMES[key] || key, material: prim.getMaterial(), verts });
  }
}

/* ---------- cut the fuselage at the hinge ---------- */
const mix = (a, b, t) => { const n = a.n.map((v, i) => v + (b.n[i] - v) * t), l = Math.hypot(...n) || 1; return { p: a.p.map((v, i) => v + (b.p[i] - v) * t), n: n.map(v => v / l), u: a.u.map((v, i) => v + (b.u[i] - v) * t) }; };
function clip(tri, sign, rim) {                          // Sutherland-Hodgman against the hinge plane; keeps the side where sign * (z - HINGE_Z) >= 0
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], da = sign * (a.p[2] - HINGE_Z), db = sign * (b.p[2] - HINGE_Z);
    if (da >= 0) out.push({ ...a });
    if ((da >= 0) !== (db >= 0)) { const v = mix(a, b, da / (da - db)); v.p[2] = HINGE_Z; out.push(v); if (rim) rim.push(v.p); }
  }
  const tris = []; for (let i = 1; i + 1 < out.length; i++) tris.push(out[0], out[i], out[i + 1]);
  return tris;
}
const fus = parts.find(p => p.name === 'Fuselage'), rim = [], back = [], front = [];
// connected shells of the fuselage mesh: the strakes are separate shells that stick out past the hull
const shell = new Map(), find = k => { while (shell.get(k) !== k) { shell.set(k, shell.get(shell.get(k))); k = shell.get(k); } return k; };
const keyOf = v => v.p.map(x => x.toFixed(3)).join(',');
for (let i = 0; i < fus.verts.length; i += 3) { const k = [0, 1, 2].map(j => keyOf(fus.verts[i + j])); k.forEach(x => shell.has(x) || shell.set(x, x)); shell.set(find(k[1]), find(k[0])); shell.set(find(k[2]), find(k[0])); }
const strakes = new Set(fus.verts.filter(v => Math.abs(v.p[0]) > 1.42 && v.p[2] > 24 && v.p[2] < 27.5).map(v => find(keyOf(v))));
let kept = 0;
for (let i = 0; i < fus.verts.length; i += 3) {
  const tri = fus.verts.slice(i, i + 3);
  if (strakes.has(find(keyOf(tri[0])))) { back.push(...tri.map(v => ({ ...v }))); kept++; continue; }
  back.push(...clip(tri, -1, null)); front.push(...clip(tri, 1, rim));
}
fus.verts = back;
// close both openings with a flat cap: the cut outline, taken as the innermost rim point in each 5 degree slice
const cx = rim.reduce((s, p) => s + p[0], 0) / rim.length, cy = rim.reduce((s, p) => s + p[1], 0) / rim.length;
const slices = new Map();
for (const p of rim) { const a = Math.floor((Math.atan2(p[1] - cy, p[0] - cx) + Math.PI) / (Math.PI / 36)), r = Math.hypot(p[0] - cx, p[1] - cy); if (!slices.has(a) || r < slices.get(a).r) slices.set(a, { r, p }); }
const ring = [...slices.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1].p);
const cap = dir => { const v = [], mk = p => ({ p: [p[0], p[1], HINGE_Z], n: [0, 0, dir], u: [0, 0] });
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; dir > 0 ? v.push(mk([cx, cy]), mk(a), mk(b)) : v.push(mk([cx, cy]), mk(b), mk(a)); } return v; };
const bottom = Math.min(...rim.map(p => p[1])), top = Math.max(...rim.map(p => p[1]));
const ground = -Math.min(...parts.flatMap(p => p.verts.map(v => v.p[1])));        // lift so the lowest point sits at y = 0
const pivot = [0, bottom + ground, HINGE_Z];
const capF = cap(1), capN = cap(-1);
// clipped triangles share vertex objects, so lift each object once
for (const v of new Set([...parts.flatMap(p => p.verts), ...front, ...capF, ...capN])) v.p = [v.p[0], v.p[1] + ground, v.p[2]];
const local = verts => verts.map(v => ({ ...v, p: [v.p[0] - pivot[0], v.p[1] - pivot[1], v.p[2] - pivot[2]] }));

/* ---------- write the new document ---------- */
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('Concorde');
const materials = new Map();
const copyMaterial = m => {
  if (materials.has(m)) return materials.get(m);
  const t = m.getBaseColorTexture(); let tex = null;
  if (t) tex = doc.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType());
  const out = doc.createMaterial(m.getName().replace('-FACES', '')).setBaseColorFactor(m.getBaseColorFactor()).setBaseColorTexture(tex).setRoughnessFactor(m.getRoughnessFactor()).setMetallicFactor(m.getMetallicFactor());
  materials.set(m, out); return out;
};
const seal = doc.createMaterial('Seal').setBaseColorFactor([.05, .055, .065, 1]).setRoughnessFactor(.35).setMetallicFactor(0);
const prim = (verts, material) => {
  const acc = (size, key) => doc.createAccessor().setType(size === 3 ? 'VEC3' : 'VEC2').setArray(new Float32Array(verts.flatMap(v => v[key]))).setBuffer(buffer);
  return doc.createPrimitive().setAttribute('POSITION', acc(3, 'p')).setAttribute('NORMAL', acc(3, 'n')).setAttribute('TEXCOORD_0', acc(2, 'u')).setMaterial(material);
};
const body = doc.createNode('Body'); scene.addChild(body);
for (const p of parts) {
  const mesh = doc.createMesh(p.name).addPrimitive(prim(p.verts, copyMaterial(p.material)));
  if (p === fus) mesh.addPrimitive(prim(capF, seal));
  body.addChild(doc.createNode(p.name).setMesh(mesh));
}
const nosePivot = doc.createNode('NosePivot').setTranslation(pivot); scene.addChild(nosePivot);
nosePivot.addChild(doc.createNode('Nose').setMesh(doc.createMesh('Nose').addPrimitive(prim(local(front), copyMaterial(fus.material))).addPrimitive(prim(local(capN), seal))));
doc.getRoot().getAsset().copyright = '"Concorde" by manilov.ap (https://sketchfab.com/3d-models/concorde-6d95290363474798a429a38bbf9ad49d), CC BY 4.0. Nose split from the fuselage and file compressed.';
const tip = Math.max(...front.map(v => v.p[2]));
scene.setExtras({ hinge: pivot, noseLength: +(tip - HINGE_Z).toFixed(3), cutTop: +(top + ground).toFixed(3) });

doc.createExtension(EXTTextureWebP).setRequired(true);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await MeshoptEncoder.ready;
await doc.transform(
  weld(),
  dedup(),                                               // the download repeats the same texture and material many times
  join({ filter: n => n.getName() !== 'Nose' && n.getName() !== 'NosePivot' }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 84 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(OUT, doc);

const kb = f => Math.round(statSync(f).size / 1024) + ' KB';
console.log(`fuselage cut at z = ${HINGE_Z}: nose ${front.length / 3} triangles, ${(tip - HINGE_Z).toFixed(2)} m long; fuselage keeps ${back.length / 3}`);
console.log(`hinge at (${pivot.map(v => v.toFixed(2)).join(', ')}), cut spans y ${(bottom + ground).toFixed(2)} to ${(top + ground).toFixed(2)}, cap outline ${ring.length} points, ${shell.size ? new Set([...shell.keys()].map(find)).size : 0} shells, ${strakes.size} strake shells (${kept} triangles) kept on the fuselage`);
console.log(`nodes: ${doc.getRoot().listNodes().map(n => n.getName()).join(', ')}`);
console.log(`meshes ${doc.getRoot().listMeshes().length}, materials ${doc.getRoot().listMaterials().length}, textures ${doc.getRoot().listTextures().length}`);
console.log(`${kb(SRC)} -> ${kb(OUT)}`);
