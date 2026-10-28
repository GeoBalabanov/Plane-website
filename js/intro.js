/* Intro: before check-in, the years count up from 1976, when Concorde entered service, to today.
   "Check in" lifts the screen away and tells the check-in that it can bring the boarding pass in. */
(() => {
  const $ = id => document.getElementById(id);
  const el = $('opening'); if (!el) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap;
  const FROM = 1976, NOW = new Date().getFullYear(), years = NOW - FROM;
  const WORDS = { 50: 'Fifty', 51: 'Fifty-one', 52: 'Fifty-two', 53: 'Fifty-three', 54: 'Fifty-four', 55: 'Fifty-five' };
  $('in-to').textContent = NOW;
  window.introOpen = true;

  // the headline rises word by word
  const title = $('in-title');
  title.innerHTML = `${WORDS[years] || years} years later, take the flight once more.`.split(' ').map(w => `<span class="w"><i>${w}</i></span>`).join(' ');

  const go = $('in-go'), to = $('in-to');
  if (G && !RM) {
    const yr = { v: FROM };
    to.textContent = FROM;
    G.set(['.in-label', '.in-body', '.in-go', '#in-from'], { opacity: 0, y: 14 });
    G.set('#in-to', { opacity: 0 });
    G.set('.in-rule', { scaleX: 0 });
    G.set('.in-title .w i', { yPercent: 110 });
    G.timeline({ delay: 1.6 })
      .to('.in-label', { opacity: 1, y: 0, duration: 1, ease: 'expo.out' })
      .to('#in-from', { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }, '-=.7')
      .to('.in-rule', { scaleX: 1, duration: 2.2, ease: 'power3.inOut' }, '-=.4')
      .to('#in-to', { opacity: 1, duration: .5 }, '<')
      .to(yr, { v: NOW, duration: 2.2, ease: 'power3.inOut', onUpdate: () => { to.textContent = Math.round(yr.v); } }, '<')
      .to('.in-title .w i', { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .045 }, '-=.5')
      .to(['.in-body', '.in-go'], { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: .12 }, '-=.7')
      .add(() => { if (matchMedia('(pointer:fine)').matches) go.focus({ preventScroll: true }); });
  }

  let done = false;
  function close() {
    if (done) return; done = true;
    const finish = () => { el.hidden = true; window.introOpen = false; dispatchEvent(new Event('concorde:intro-done')); };
    if (!G || RM) { finish(); return; }
    G.timeline({ onComplete: finish })
      .to('.in-col > *', { opacity: 0, y: -24, duration: .6, ease: 'power3.in', stagger: .05 })
      .to(el, { opacity: 0, duration: .7, ease: 'power2.inOut' }, '-=.2');
  }
  go.addEventListener('click', close);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
