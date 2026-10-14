/* A tileable 3D noise volume for the clouds, shared by the take-off and supersonic scenes, built once.
   Two channels, the usual recipe for real-time cloud: red = smooth noise carved by billowy cell noise (the big rounded
   heaps), green = finer billows (wispy edges). Returns { data, N }: N*N*N texels, two bytes each. */
window.cloudNoise = (() => {
  let made = null;
  return (N = 64) => made || (made = (() => {
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
    return { data, N };
  })());
})();
