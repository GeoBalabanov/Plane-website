/* Concorde: the scroll engine. Every .scene is a tall track with a sticky stage; its scroll progress (0..1)
   scrubs the motion. The 3D scenes live in concorde3d.js and are driven from the same progress values. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));          // local 0..1 between a and b
  const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  // headlines: split into characters so they can rise out of a clipped line
  document.querySelectorAll('[data-reveal]').forEach(el => {
    const text = el.textContent.trim(); let i = 0;
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-label', text);
    el.innerHTML = '<span class="ln" aria-hidden="true">' + text.split(/\s+/).map(w =>
      `<span class="wd">${[...w].map(c => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`).join(' ') + '</span>';
  });

  // split the paragraph into words: they light up one by one
  const para = $('para');
  para.innerHTML = para.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
  const pw = [...para.querySelectorAll('.w')];

  const scenes = [...document.querySelectorAll('.scene'), $('end')];
  const stages = scenes.map(s => s.querySelector('.stage') || s);
  const LIGHT = { droop: 1, mach2: 1 };                         // scenes with a light background: the chrome turns dark over them

  // smooth scroll
  let lenis = null;
  if (window.Lenis && !RM) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
  }
  const goTo = target => {
    if (lenis) return lenis.scrollTo(target, { duration: 1.6 });
    const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY;
    scrollTo({ top, behavior: RM ? 'auto' : 'smooth' });
  };
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); goTo(t); }
  }));
  const next = () => {
    const y = scrollY + 4;
    const target = scenes.find(s => s.offsetTop > y);
    if (target) goTo(target); else goTo(0);
  };
  $('cta-next').addEventListener('click', next);
  $('cta-dot').addEventListener('click', next);

  // glass cards: the highlight follows the pointer
  document.querySelectorAll('.glass').forEach(g => g.addEventListener('pointermove', e => {
    const r = g.getBoundingClientRect();
    g.style.setProperty('--gx', (e.clientX - r.left) + 'px'); g.style.setProperty('--gy', (e.clientY - r.top) + 'px');
  }));

  const set = (el, tf, op) => { el.style.transform = tf; if (op !== undefined) el.style.opacity = op; };
  const fmtTime = m => `T+${Math.floor(m/60)}:${String(Math.floor(m%60)).padStart(2,'0')}`;

  // preloader: lift once the fonts are in, then let the first headline rise
  let ready = RM;
  const lift = () => { if (ready) return; ready = true; root.classList.add('is-ready'); last = -1; };
  if (RM) root.classList.add('is-ready');
  else Promise.race([document.fonts ? document.fonts.ready : null, new Promise(r => setTimeout(r, 2200))]).then(() => setTimeout(lift, 700));

  // ---------- living airport behind the window (image coordinates, 1024 x 1024) ----------
  const view = $('view'), vctx = view.getContext('2d');
  const LIGHTS = [[548,540,"b"],[583,540,"b"],[555,546,"b"],[592,550,"b"],[704,551,"b"],[696,554,"b"],[660,555,"b"],[412,556,"b"],[600,556,"b"],[627,556,"b"],[683,556,"b"],[323,557,"b"],[389,557,"b"],[569,557,"b"],[363,558,"b"],[501,558,"b"],[469,559,"b"],[533,559,"b"],[401,560,"b"],[553,560,"b"],[635,564,"b"],[671,564,"b"],[601,565,"b"],[706,565,"b"],[384,567,"b"],[738,569,"b"],[563,580,"b"],[312,487,"w"],[343,493,"w"],[375,497,"w"],[391,499,"w"],[287,500,"w"],[306,500,"w"],[439,501,"w"],[446,503,"w"],[306,510,"w"],[317,510,"w"],[322,510,"w"],[496,510,"a"],[297,511,"w"],[352,511,"a"],[362,511,"a"],[380,511,"w"],[369,512,"w"],[724,512,"a"],[753,512,"w"],[732,514,"a"],[437,517,"w"],[397,518,"w"],[427,518,"w"],[328,519,"w"],[387,519,"w"],[475,520,"w"],[498,520,"a"],[509,521,"w"],[373,522,"w"],[401,522,"w"],[408,522,"w"],[575,522,"a"],[581,522,"a"],[391,524,"w"],[591,524,"a"],[298,525,"w"],[598,525,"a"],[610,527,"a"],[617,528,"a"],[576,529,"a"],[636,531,"a"],[667,531,"a"],[677,532,"w"],[350,533,"w"],[597,534,"a"],[691,534,"a"],[663,535,"a"],[671,536,"w"],[709,536,"a"],[632,537,"w"],[678,537,"a"],[687,539,"a"],[733,539,"a"],[696,540,"a"],[706,542,"a"],[762,542,"w"],[716,543,"a"],[613,544,"a"],[665,544,"a"],[726,545,"a"],[739,546,"a"],[752,548,"a"],[766,551,"w"]]
    .map(([x, y, k]) => ({ x, y, k, p1: Math.random() * 6.28, p2: Math.random() * 6.28, w1: 1.5 + Math.random() * 3, w2: 4 + Math.random() * 7 }));
  const sprite = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.12, `rgba(${rgb},.95)`); gr.addColorStop(.4, `rgba(${rgb},.28)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
  const SPR = { b: sprite('70,140,255'), a: sprite('255,170,70'), w: sprite('255,236,200'), r: sprite('255,40,40'), g: sprite('60,255,140'), s: sprite('235,245,255') };
  const glow = (k, x, y, r, al) => { if (al <= 0.01) return; vctx.globalAlpha = Math.min(1, al); vctx.drawImage(SPR[k], x - r, y - r, r * 2, r * 2); };
  const strobe = (t, period, off = 0) => { const ph = ((t + off) % period); return (ph < .06 || (ph > .16 && ph < .22)) ? 1 : 0; };
  const blink = (t, period, on = .12, off = 0) => (((t + off) % period) < on ? 1 : 0);
  const beacon = (t, f, off = 0) => Math.pow(Math.max(0, Math.cos(6.283 * (t * f + off))), 6);
  const lerpP = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  // generic airliner side silhouette, 100 units long, nose to the right
  const JET = new Path2D('M0 6C0 3.2 3 2 9 2L88 2C95 2 100 4.6 100 6.4 100 8 96 9 90 9L8 9C3 9 0 8 0 6Z M3 2.5L9 -11 16 -11 22 2.5Z M38 7.2L62 7.2 55 9.6 41 9.6Z M45 8.6h13a2 2 0 0 1 0 4h-13a2 2 0 0 1 0-4Z M86.5 9h1.4v4h-1.4Z M47 9h1.6v4h-1.6Z');
  function drawJet(x, y, len, t, dir = 1) {
    const s = len / 100;
    vctx.save(); vctx.translate(x, y); vctx.scale(s * dir, s * 1.45);
    vctx.globalAlpha = .93; vctx.globalCompositeOperation = 'source-over'; vctx.fillStyle = '#0d1119'; vctx.fill(JET);
    vctx.fillStyle = 'rgba(255,214,150,.55)'; for (let i = 14; i < 86; i += 3.2) vctx.fillRect(i, 4.2, 1.1, 1.2);   // lit cabin windows
    vctx.restore();
    vctx.globalCompositeOperation = 'lighter';
    const P = (u, v) => [x + u * s * dir, y + v * s * 1.45];
    let q = P(99, 7.5); glow('s', q[0], q[1], 6, .9); glow('w', q[0] + 10 * dir, q[1] + 4, 14, .18);        // taxi light and its pool on the ground
    q = P(50, 1.2); glow('r', q[0], q[1], 5, beacon(t, .9) * 1.1);                                          // red beacon
    q = P(1, 5.5); glow('s', q[0], q[1], 7, strobe(t, 1.3, .4));                                           // tail strobe
    q = P(56, 8.5); glow('r', q[0], q[1], 3.5, .8);                                                        // nav light
  }
  function sizeView() { const w = view.offsetWidth; const d = Math.min(devicePixelRatio || 1, 2) * 1.6; view.width = Math.min(2400, Math.round(w * d)); view.height = view.width; }
  sizeView(); addEventListener('resize', sizeView);
  let viewOn = true, mx = .5;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth; });
  function drawView(ms) {
    const t = RM ? 3 : ms / 1000;
    const k = view.width / 1024;
    vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.clearRect(0, 0, view.width, view.height);
    vctx.setTransform(k, 0, 0, k, 0, 0);
    vctx.save();
    // clip to the glass opening
    const L = 257, T = 349, R = 768, B = 842, rad = 150;
    vctx.beginPath(); vctx.moveTo(L, T); vctx.lineTo(R, T); vctx.lineTo(R, B - rad); vctx.quadraticCurveTo(R, B, R - rad, B); vctx.lineTo(L + rad, B); vctx.quadraticCurveTo(L, B, L, B - rad); vctx.closePath(); vctx.clip();
    // drifting cloud shadows in the dusk sky
    vctx.globalCompositeOperation = 'source-over';
    for (const [y0, w, sp, off, al] of [[392, 300, 4, 0, .16], [430, 360, 2.6, 380, .12], [462, 260, 6, 700, .1]]) {
      const x = L - w + ((t * sp + off) % (R - L + 2 * w));
      const g = vctx.createRadialGradient(x, y0, 0, x, y0, w / 2);
      g.addColorStop(0, `rgba(18,22,40,${al})`); g.addColorStop(1, 'rgba(18,22,40,0)');
      vctx.save(); vctx.translate(x, y0); vctx.scale(1, .16); vctx.translate(-x, -y0); vctx.fillStyle = g; vctx.fillRect(x - w / 2, y0 - w / 2, w, w); vctx.restore();
    }
    vctx.globalCompositeOperation = 'lighter';
    // airfield lights: scintillation in the evening air
    for (const l of LIGHTS) {
      const f = .5 + .5 * Math.sin(t * l.w1 + l.p1) * Math.sin(t * l.w2 + l.p2);
      const base = l.k === 'b' ? .55 : l.k === 'a' ? .5 : .38;
      glow(l.k, l.x, l.y, l.k === 'w' ? 5 : 6, base * (.55 + .7 * f));
    }
    // approach lights: the sequenced flash runs towards the runway twice a second
    const A0 = [766, 551], A1 = [575, 522], n = 12, ph = (t * 2) % 1;
    for (let i = 0; i < n; i++) { const d = Math.abs(ph - i / n); if (d < .05) { const q = lerpP(A0, A1, i / n); glow('s', q[0], q[1], 9 - i * .4, (1 - d / .05) * 1.1); } }
    // aircraft on final approach, landing lights on
    { const cyc = 30, u = ((t + 6) % cyc) / 22;
      if (u < 1) { const q = lerpP([800, 405], [664, 517], u); const vis = Math.min(1, u * 6) * (1 - Math.max(0, (u - .92) / .08));
        glow('s', q[0], q[1], 10 + u * 6, .95 * vis); glow('w', q[0], q[1], 26 + u * 10, .22 * vis);
        glow('r', q[0] - 4, q[1] - 2, 4, beacon(t, .9) * vis); glow('s', q[0] + 6, q[1] - 1, 6, strobe(t, 1.2) * vis); } }
    // high traffic crossing the sky
    { const u = (t % 70) / 70, q = lerpP([250, 372], [790, 356], u);
      glow('r', q[0], q[1], 3, blink(t, 1.1, .14) + .15); glow('s', q[0] + 2, q[1], 4, strobe(t, 1.5, .7)); }
    // a jet taxiing along the far taxiway
    { const cyc = 46, u = (t % cyc) / 38;
      if (u < 1) { const x = 230 + u * 600; vctx.globalCompositeOperation = 'source-over'; drawJet(x, 532, 72, t); } }
    vctx.globalCompositeOperation = 'lighter';
    // the parked jet on the left: red wingtip light and white strobe
    glow('r', 437.5, 566, 7, .75 + .15 * Math.sin(t * 2)); glow('s', 439, 565, 12, strobe(t, 1.4, .2) * 1.2);
    // amber beacons turning on the ground vehicles
    glow('a', 465, 593, 8, beacon(t, .75)); glow('a', 362, 594, 7, beacon(t, .62, .3)); glow('a', 588, 596, 6, beacon(t, .8, .6));
    // a reflection sliding over the glass, following the pointer a little
    vctx.globalCompositeOperation = 'source-over'; vctx.globalAlpha = 1;
    const rx = L + (R - L) * (.15 + .7 * (.5 + .5 * Math.sin(t * .08))) + (mx - .5) * 60;
    const rg = vctx.createLinearGradient(rx - 120, T, rx + 120, B);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(.5, 'rgba(255,255,255,.07)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    vctx.fillStyle = rg; vctx.fillRect(L, T, R - L, B - T);
    vctx.restore();
  }

  const wordmark = $('wordmark');
  // cabin tour cards: a five-step progress row under each
  const tourcards = [...document.querySelectorAll('#cabin .tourcard')];
  tourcards.forEach((c, i) => c.insertAdjacentHTML('beforeend', '<div class="dots" aria-hidden="true">' + tourcards.map((_, j) => `<i${j === i ? ' class="on"' : ''}></i>`).join('') + '</div>'));
  const ticks = [...$('ticks').children];
  let last = -1, lastP = null, dirty = true;
  function update() {
    const y = scrollY;
    if (y === last) return; last = y;
    const vh = innerHeight;
    const P = {}, rects = scenes.map(s => s.getBoundingClientRect());
    let top = 'dark', bot = 'dark';
    scenes.forEach((s, i) => {
      const r = rects[i], span = s.offsetHeight - vh;
      P[s.id] = span > 0 ? clamp(-r.top / span) : (r.top <= 0 ? 1 : 0);
      const tone = LIGHT[s.id] ? 'light' : 'dark';
      if (r.top <= 44 && r.bottom > 44) top = tone;
      if (r.top <= vh - 44 && r.bottom > vh - 44) bot = tone;
      // entrances play when a stage has come most of the way in, and reset once it has left
      const cl = stages[i].classList;
      if (r.top < vh * .5 && r.bottom > vh * .25 && (i > 0 || ready)) cl.add('is-in');
      else if (r.top > vh * .98 || r.bottom < 0) cl.remove('is-in');
    });
    document.body.dataset.top = top; document.body.dataset.bot = bot;
    lastP = P; dirty = true;

    // ---- 1 boarding
    { const p = P.boarding;
      const open = ease(seg(p, .03, .22));
      const sh = $('shade');
      sh.style.transform = `translateY(${-open * 87.74}%)`;
      sh.style.opacity = 1 - seg(p, .215, .228);
      $('shade-edge').style.opacity = 1 - open;
      const z = ease(seg(p, .3, .95));
      const s = RM ? 1 : 1 + Math.pow(z, 2) * 4.6;
      set($('window'), `translate(-50%,-59%) scale(${s})`);
      const apart = ease(seg(p, .24, .66));
      set($('london'), `translateX(${-apart*55}vw)`, 1 - seg(p, .42, .66));
      set($('newyork'), `translateX(${apart*55}vw)`, 1 - seg(p, .42, .66));
      $('london').style.filter = $('newyork').style.filter = apart > 0 ? `blur(${apart*6}px)` : '';
      $('intro').style.opacity = $('scrollhint').style.opacity = 1 - seg(p, .2, .3);
      const f = seg(p, .3, .4) * (1 - seg(p, .6, .7));
      set($('factchip'), `translateY(${(1 - seg(p, .3, .4))*30}px)`, f);
      $('factchip').style.visibility = f > 0 ? 'visible' : 'hidden';
      $('veil').style.opacity = seg(p, .68, .96);
      viewOn = p < 1 && rects[0].bottom > 0;
      // the wordmark starts on the window shade and rides up into the nav as the shade lifts
      const k = (RM || innerWidth <= 720) ? 0 : 1 - ease(seg(p, .02, .2));
      wordmark.style.transform = k ? `translateY(${k * (vh * .5 - 40)}px) scale(${1 + k * .55})` : '';
      wordmark.style.color = k ? `color-mix(in srgb, var(--ink) ${Math.round(k * 78)}%, var(--chrome-top))` : '';
    }
    // ---- 2 cabin tour (the 3D camera and hotspots are driven in concorde3d.js)
    { const p = P.cabin;
      const STOPS = [[.04,.16],[.19,.31],[.34,.46],[.50,.64],[.84,.99]];
      const w = ([a, b]) => seg(p, a - .03, a) * (1 - seg(p, b, b + .03));
      const away = ease(seg(p, .008, .05));
      set($('cab-l'), `translateX(${-away * 30}vw)`, 1 - away);
      set($('cab-r'), `translateX(${away * 30}vw)`, 1 - away);
      $('cab-copy').style.opacity = 1 - seg(p, .008, .035);
      tourcards.forEach((c, i) => {
        const o = w(STOPS[i]); c.style.opacity = o; c.style.transform = `translateY(${(1 - o) * 16}px)`; c.style.visibility = o > 0 ? 'visible' : 'hidden';
      });
    }
    // ---- 3 droop
    { const p = P.droop;
      const angle = p < .42 ? lerp(0, 5, ease(seg(p, .1, .36))) : lerp(5, 12.5, ease(seg(p, .62, .88)));
      $('readout').textContent = angle.toFixed(1) + '°';
      const landing = angle > 9;
      $('fact-state').textContent = angle < .05 ? 'Nose up' : angle < 4.9 ? 'Nose lowering' : landing ? 'Landing position' : 'Take-off position';
      const txt = landing
        ? 'For landing it drops further, to 12.5 degrees. The delta wing needs a nose-high attitude, so the droop lets the pilots see past the long nose.'
        : 'Before take-off the long nose is lowered 5 degrees, so the pilots can see past it.';
      if ($('fact-text').textContent !== txt) $('fact-text').textContent = txt;
      const tick = angle < 2.5 ? 0 : landing ? 2 : 1;
      ticks.forEach((t, i) => t.classList.toggle('on', i === tick));
    }
    // ---- 4 supersonic
    { const p = P.boom;
      set($('boom-photo'), RM ? 'none' : `scale(${1.18 - p*.16}) translateY(${p*-3}%)`);
      const n = pw.length, r = seg(p, .05, .78) * (n + 1);
      pw.forEach((w, i) => w.style.opacity = (.24 + .76 * clamp(r - i)).toFixed(3));
      $('mach-big').textContent = lerp(.95, 1.7, ease(seg(p, .1, .9))).toFixed(2);
    }
    // ---- 5 mach 2 plane
    { const p = P.mach2;
      const grow = ease(seg(p, .5, .95)), spread = ease(seg(p, .15, .6));
      set($('flyat'), `translateX(${-spread*3 - grow*4}vw)`);
      set($('machtwo'), `translateX(${spread*3 + grow*4}vw)`);
      const info = seg(p, .12, .3) * (1 - seg(p, .62, .78));
      $('sidecopy').style.opacity = $('spec').style.opacity = info;
    }
    // ---- 6 cruise
    { const p = P.cruise;
      set($('earth'), RM ? 'none' : `translateY(${(1 - ease(seg(p, 0, .7))) * 22}vh) scale(${1.12 - p*.1})`);
      const a = 1 - seg(p, .42, .55), h = seg(p, .55, .68);
      set($('alt-block'), `translateY(${-(1-a)*30}px)`, a);
      set($('heat-block'), `translateY(${(1-h)*30}px)`, h);
      $('temp').textContent = Math.round(lerp(20, 127, ease(seg(p, .55, .85)))) + '°C';
      $('stretch-bar').style.transform = `scaleX(${1 + .06 * ease(seg(p, .7, .95))})`;
    }
    // ---- 7 arrival
    { const p = P.arrival;
      const enter = ease(seg(p, 0, .35));
      set($('globe'), `translate(${lerp(25, -50, enter)}%, -50%) rotate(${lerp(-8, 0, enter)}deg)`);
      set($('bigword'), `translateX(${-p*8}vw)`, .5 + .5*seg(p, 0, .3));
      const draw = ease(seg(p, .3, .7));
      $('arc').setAttribute('stroke-dashoffset', (1 - draw).toFixed(4));
      $('jfk-dot').setAttribute('opacity', seg(draw, .9, 1));
      $('jfk-label').setAttribute('opacity', seg(draw, .9, 1));
      const t = ease(seg(p, .35, .6)), out = seg(p, .82, .97);
      set($('ticket'), `translateY(${(1 - t) * 110 - out*40}vh) rotate(${lerp(10, -4, t)}deg)`, 1 - out);
      $('landing').style.opacity = seg(p, .62, .75);
    }

    // ---- HUD + stage bar
    const k = [P.boarding, P.droop, P.boom, P.mach2, P.cruise, P.arrival];
    let alt = 0, mach = 0;
    if (k[1] > 0) { alt = lerp(0, 2000, seg(k[1], .6, 1)); mach = lerp(0, .4, k[1]); }
    if (k[2] > 0) { alt = lerp(2000, 50000, k[2]); mach = lerp(.95, 1.7, ease(seg(k[2], .1, .9))); }
    if (k[3] > 0) { alt = lerp(50000, 60000, k[3]); mach = lerp(1.7, 2, k[3]); }
    if (k[4] > 0) { alt = 60000; mach = 2; }
    if (k[5] > 0) { alt = lerp(60000, 0, k[5]); mach = lerp(2, 0, k[5]); }
    const k2 = [P.boarding, P.cabin, P.droop, P.boom, P.mach2, P.cruise, P.arrival];
    const total = k2.reduce((s, v) => s + v, 0) / 7;
    $('hud-alt').textContent = (Math.round(alt / 100) * 100).toLocaleString('en-GB') + ' ft';
    $('hud-mach').textContent = mach.toFixed(2);
    $('hud-time').textContent = fmtTime(total * 210);
    let idx = k2.findIndex(v => v < 1); if (idx === -1) idx = 6;
    const names = ['Boarding','Cabin','Take-off','Supersonic','Mach 2','Cruise','Arrival'];
    $('stage-name').textContent = names[idx];
    $('stage-num').textContent = `${idx + 1} / 7`;
    $('stage-fill').style.transform = `scaleX(${total.toFixed(4)})`;
    const atEnd = rects[rects.length - 1].top < vh * .5;
    document.body.classList.toggle('at-end', atEnd);
    $('cta-next').textContent = atEnd ? 'Replay the flight' : (y < 10 ? 'Begin the flight' : 'Next scene');
  }

  function frame(t) {
    if (lenis) lenis.raf(t);
    update();
    if (viewOn && !RM) drawView(t);
    if (window.C3D && lastP && (dirty || C3D.animating())) { C3D.update(lastP, t); dirty = false; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('resize', () => { last = -1; if (window.C3D) C3D.resize(); });
  update();
  drawView(0);
})();
