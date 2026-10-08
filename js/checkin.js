/* Check-in: before the window scene the visitor writes their name on a boarding pass and picks a seat.
   "Board the flight" stamps the pass, tears off the stub and sends the pass away; the name and seat then
   appear in the boarding scene, on the arrival ticket and in the ending. The name only lives in this page. */
(() => {
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const ck = $('checkin'); if (!ck) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap;
  const pass = $('pass'), stub = $('stub'), stamp = $('stamp'), nameIn = $('ck-name');

  // today's date, printed the way a boarding pass would
  const d = new Date(), MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateTxt = `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`;
  $('ck-date').textContent = dateTxt; $('stamp-date').textContent = dateTxt + ' ' + d.getFullYear();

  // seat map: 25 rows, two seats either side of the aisle (A B | C D), drawn nose to tail
  const seats = $('seats'), LET = ['A', 'B', 'C', 'D'], GRID_ROW = { A: 1, B: 2, C: 4, D: 5 };
  let html = '<span class="aisle" aria-hidden="true"><span>Aisle</span><span>Aisle</span></span>';
  for (let r = 1; r <= 25; r++) for (const l of LET) {
    const id = r + l;
    html += `<label class="seat" style="grid-column:${r};grid-row:${GRID_ROW[l]}" title="Seat ${id}">` +
      `<input type="radio" name="seat" value="${id}" aria-label="Row ${r}, seat ${l}${l === 'A' || l === 'D' ? ', window' : ', aisle'}"${id === '1A' ? ' checked' : ''}><span></span></label>`;
  }
  seats.innerHTML = html;

  const state = { name: '', seat: '1A' };
  const shownName = () => state.name.trim() || 'Passenger';
  const syncStub = () => { $('stub-name').textContent = shownName(); $('stub-seat').textContent = state.seat; $('ck-seat').textContent = state.seat; };
  nameIn.addEventListener('input', () => { state.name = nameIn.value; syncStub(); });
  seats.addEventListener('change', e => {
    if (e.target.name !== 'seat') return;
    state.seat = e.target.value; syncStub();
    if (G && !RM) G.fromTo('#ck-seat, #stub-seat', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out' });
  });

  // while the pass is open the page does not scroll
  root.classList.add('ck-open');
  const lenis = () => window.lenis;
  if (lenis()) lenis().stop();

  // entrance after the preloader, then a slow float like paper in a draught
  let float = null;
  if (G && !RM) {
    G.set(pass, { y: 80, rotation: -5, opacity: 0 });
    G.set(['.ck-kicker', '.ck-actions', '.ck-note'], { opacity: 0, y: 14 });
    G.timeline({ delay: 1.7 })
      .to(pass, { y: 0, rotation: -1.2, opacity: 1, duration: 1.3, ease: 'expo.out' })
      .to(['.ck-kicker', '.ck-actions', '.ck-note'], { opacity: 1, y: 0, duration: .9, ease: 'expo.out', stagger: .08 }, '-=.9')
      .add(() => {
        float = G.to(pass, { y: -7, rotation: -.4, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        if (matchMedia('(pointer:fine)').matches) nameIn.focus({ preventScroll: true });
      });
    // the pass tilts a little towards the pointer
    if (matchMedia('(pointer:fine)').matches) ck.addEventListener('pointermove', e => {
      const rx = (e.clientY / innerHeight - .5) * -5, ry = (e.clientX / innerWidth - .5) * 7;
      G.to(pass, { rotationX: rx, rotationY: ry, transformPerspective: 1400, duration: .8, ease: 'power3.out', overwrite: 'auto' });
    });
  }

  // write the name and seat into the rest of the flight
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function personalise() {
    const n = shownName(), named = !!state.name.trim();
    $('intro-seat').innerHTML = `Seat ${state.seat},<br>${named ? esc(n) : 'by the window'}`;
    $('arr-seat').textContent = `About 3.5 hours instead of 7 or more. Seat ${state.seat}${named ? ', ' + n : ''}.`;
    const th = $('thanks'); th.textContent = `Thank you for flying Concorde, ${n}.`; th.hidden = false;
    window.passenger = { name: n, seat: state.seat };
    dispatchEvent(new CustomEvent('concorde:passenger', { detail: window.passenger }));
  }

  let done = false;
  function close(boarded) {
    if (done) return; done = true;
    personalise();
    const finish = () => {
      ck.hidden = true; root.classList.remove('ck-open');
      if (lenis()) lenis().start();
      document.querySelector('main').setAttribute('tabindex', '-1'); document.querySelector('main').focus({ preventScroll: true });
      dispatchEvent(new Event('resize'));
    };
    if (!G || RM) { finish(); return; }
    if (float) float.kill();
    const tl = G.timeline({ onComplete: finish });
    tl.to(pass, { rotationX: 0, rotationY: 0, rotation: -1.2, y: 0, duration: .3, ease: 'power2.out' })
      .to(['.ck-kicker', '.ck-actions', '.ck-note'], { opacity: 0, y: 10, duration: .3, ease: 'power2.in' }, 0);
    if (boarded) {
      tl.fromTo(stamp, { opacity: 0, scale: 2.4, rotation: -30 }, { opacity: .92, scale: 1, rotation: -14, duration: .42, ease: 'back.out(2.2)' }, .15)
        .to(pass, { x: 3, y: 4, duration: .06, yoyo: true, repeat: 1, ease: 'power1.inOut' }, .5)   // the thud of the stamp
        .to(stub, { rotation: 9, duration: .35, ease: 'power2.in' }, .95)                          // the stub tears along the perforation
        .to(stub, { y: '60vh', x: 60, rotation: 24, opacity: 0, duration: .9, ease: 'power2.in' }, 1.25);
    }
    tl.to(pass, { y: '-115vh', rotation: -6, duration: 1, ease: 'power3.in' }, boarded ? 1.55 : .25)
      .to(ck, { opacity: 0, duration: .6, ease: 'power2.inOut' }, boarded ? 2.15 : .85);
  }

  pass.addEventListener('submit', e => { e.preventDefault(); close(true); });
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); close(true); } });
  $('ck-skip').addEventListener('click', () => close(false));
  ck.addEventListener('keydown', e => { if (e.key === 'Escape') close(false); });
})();
