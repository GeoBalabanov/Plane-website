/* Sound, off until the visitor turns it on. Everything is synthesised with Web Audio, no files:
   - the cabin: a low hum with the whine of the turbines far back,
   - the engines: deep rumbling noise whose loudness and brightness follow the flight (idle, take-off roll with
     reheat, climb, the smooth roar of the cruise, quiet at the gate),
   - the sonic boom: the double crack of an N-wave and its rumble, when the clouds scene passes Mach 1,
   - footsteps in the cabin: real carpet recordings (Kenney, CC0), the only sound files. */
(() => {
  const btn = document.getElementById('sound'); if (!btn) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { btn.hidden = true; return; }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  let ctx = null, on = false, master, roarGain, roarFilter, humGain, whineGain;

  function noiseBuffer(sec, brown) {
    const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function build() {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0; master.connect(comp).connect(ctx.destination);
    // engines: looped brown noise through a low-pass that opens with power
    const roar = ctx.createBufferSource(); roar.buffer = noiseBuffer(4, true); roar.loop = true;
    roarFilter = ctx.createBiquadFilter(); roarFilter.type = 'lowpass'; roarFilter.frequency.value = 300; roarFilter.Q.value = .4;
    roarGain = ctx.createGain(); roarGain.gain.value = 0;
    roar.connect(roarFilter).connect(roarGain).connect(master); roar.start();
    // cabin hum: two low, slightly detuned tones
    humGain = ctx.createGain(); humGain.gain.value = 0; humGain.connect(master);
    const humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 180; humLp.connect(humGain);
    for (const f of [58, 87.3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = Math.random() * 8 - 4; o.connect(humLp); o.start(); }
    // turbine whine, very quiet, wobbling a little
    whineGain = ctx.createGain(); whineGain.gain.value = 0; whineGain.connect(master);
    const w = ctx.createOscillator(); w.frequency.value = 2350; const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = .25; lfoG.gain.value = 18; lfo.connect(lfoG).connect(w.frequency); lfo.start(); w.connect(whineGain); w.start();
  }

  function boom() {
    if (!on || !ctx) return;
    const sr = ctx.sampleRate, n = Math.floor(sr * 3), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const nwave = (t0, len, amp) => { for (let i = 0; i < len * sr; i++) { const k = i / (len * sr); d[Math.floor(t0 * sr) + i] += amp * (1 - 2 * k) * (k < .04 ? k / .04 : 1); } };
    nwave(.02, .11, .95); nwave(.2, .1, .8);                   // the double bang: nose shock, then tail shock
    let last = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; last = (last + .03 * (Math.random() * 2 - 1)) / 1.03; d[i] += last * 6 * Math.exp(-(t - .05) * 2.4) * (t > .05 ? 1 : 0); }   // rumble
    const src = ctx.createBufferSource(); src.buffer = b;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ctx.createGain(); g.gain.value = .95;
    src.connect(lp).connect(g).connect(master); src.start();
    const sub = ctx.createOscillator(), sg = ctx.createGain();    // a sub-bass thud under it
    sub.frequency.setValueAtTime(62, ctx.currentTime); sub.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + .9);
    sg.gain.setValueAtTime(.0001, ctx.currentTime); sg.gain.exponentialRampToValueAtTime(.8, ctx.currentTime + .02); sg.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.4);
    sub.connect(sg).connect(master); sub.start(); sub.stop(ctx.currentTime + 1.5);
  }
  addEventListener('concorde:boom', boom);

  // footsteps on the cabin carpet: five real recordings ("Impact Sounds" by Kenney, CC0), a different one each time,
  // with a touch of pitch and level so no two steps sound the same
  const steps = []; let lastStep = -1, loading = null;
  const loadSteps = () => loading || (loading = Promise.all([0, 1, 2, 3, 4].map(i =>
    fetch(`assets/sound/step${i}.mp3`).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
  )).then(list => steps.push(...list)).catch(e => console.error(e)));
  function step(e) {
    if (!on || !ctx) return;
    if (!steps.length) { loadSteps(); return; }
    let i; do i = Math.floor(Math.random() * steps.length); while (i === lastStep && steps.length > 1); lastStep = i;
    const s = clamp(e.detail && e.detail.strength || .6, .35, 1), t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = steps[i]; src.playbackRate.value = .92 + Math.random() * .14;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600 + Math.random() * 900;   // soft carpet, not a hard floor
    const g = ctx.createGain(); g.gain.value = (.32 + .18 * s) * (.85 + Math.random() * .3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let out = src.connect(lp).connect(g);
    if (pan) { pan.pan.value = (e.detail && e.detail.left ? -.12 : .12); out = out.connect(pan); }
    out.connect(master); src.start(t);
  }
  addEventListener('concorde:step', step);

  // what the aircraft sounds like at each point of the page: [engine level, engine brightness Hz, cabin hum, whine]
  const ids = ['boarding', 'cabin', 'droop', 'boom', 'mach2', 'cruise', 'arrival', 'end'];
  const prog = id => { const s = document.getElementById(id); if (!s) return -1; const r = s.getBoundingClientRect(), span = s.offsetHeight - innerHeight;
    if (r.top > innerHeight || r.bottom < 0) return -1; return span > 0 ? clamp(-r.top / span) : 0; };
  function mix() {
    const P = {}; ids.forEach(id => P[id] = prog(id));
    let lvl = .05, hz = 260, hum = .3, whine = .25;                // at the gate
    if (P.cabin >= 0) { lvl = .08; hum = .45; whine = .4; }
    if (P.droop >= 0) { const p = P.droop;
      const roll = seg(p, .19, .58), climb = seg(p, .58, .85);
      lvl = .12 + .85 * roll - .2 * climb; hz = 320 + 1500 * roll - 500 * climb; hum = .2; whine = .5 + .3 * roll; }
    if (P.boom >= 0) { lvl = .75; hz = 1100 + 300 * P.boom; hum = .15; whine = .2; }
    if (P.mach2 >= 0 || P.cruise >= 0) { lvl = .38; hz = 520; hum = .5; whine = .15; }
    if (P.arrival >= 0) { const p = P.arrival; lvl = .38 - .3 * p; hz = 520 - 250 * p; hum = .5 - .3 * p; whine = .15; }
    if (P.end >= 0 && P.arrival < 0) { lvl = .02; hum = .05; whine = 0; }
    const t = ctx.currentTime;
    roarGain.gain.setTargetAtTime(lvl * .55, t, .35); roarFilter.frequency.setTargetAtTime(hz, t, .35);
    humGain.gain.setTargetAtTime(hum * .05, t, .5); whineGain.gain.setTargetAtTime(whine * .006, t, .5);
  }
  let timer = 0;
  function set(v) {
    on = v;
    if (on && !ctx) { build(); loadSteps(); }
    if (ctx) { if (on) ctx.resume(); master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .25); }
    btn.setAttribute('aria-pressed', String(on)); btn.querySelector('.sound-t').textContent = on ? 'Sound on' : 'Sound off';
    btn.classList.toggle('on', on);
    clearInterval(timer); if (on) { mix(); timer = setInterval(mix, 120); }
    else if (ctx) setTimeout(() => { if (!on) ctx.suspend(); }, 600);
  }
  let chose = false;                                          // once the visitor uses the switch, their choice stands
  btn.addEventListener('click', () => { chose = true; set(!on); });
  addEventListener('concorde:sound-wish', () => { if (!chose && !on) set(true); });
})();
