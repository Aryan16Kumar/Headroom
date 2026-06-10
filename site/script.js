// Headroom landing — demo badge cycle, scroll reveals, cursor glow, timeline draw.
// No dependencies, no network requests.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- badge demo: cycle through quota scenarios ---------- */

const COLORS = { green: '#5fd38a', amber: '#f0b342', red: '#ef6a5a' };

const SCENARIOS = [
  {
    f5: 7,  e5: '4h 32m', f7: 12, e7: '5d 03h',
    caption: 'Plenty of headroom — keep going.',
    captionColor: COLORS.green,
  },
  {
    f5: 72, e5: '1h 04m', f7: 31, e7: '4d 11h',
    caption: 'Pace yourself — reset in about an hour.',
    captionColor: COLORS.amber,
  },
  {
    f5: 91, e5: '4m 12s', f7: 38, e7: '4d 10h', tick: 252,
    caption: 'Wall ahead. Headroom counts you back in.',
    captionColor: COLORS.red,
  },
];

const colorFor = (pct) => pct >= 85 ? COLORS.red : pct >= 60 ? COLORS.amber : COLORS.green;

const el = (id) => document.getElementById(id);
const fill5 = el('fill5'), pct5 = el('pct5'), eta5 = el('eta5');
const fill7 = el('fill7'), pct7 = el('pct7'), eta7 = el('eta7');
const caption = el('caption');

let tickTimer = null;

function applyScenario(s) {
  fill5.style.width = s.f5 + '%';
  fill5.style.background = colorFor(s.f5);
  pct5.textContent = s.f5 + '%';
  eta5.textContent = s.e5;

  fill7.style.width = s.f7 + '%';
  fill7.style.background = colorFor(s.f7);
  pct7.textContent = s.f7 + '%';
  eta7.textContent = s.e7;

  caption.style.opacity = '0';
  setTimeout(() => {
    caption.textContent = s.caption;
    caption.style.color = s.captionColor;
    caption.style.opacity = '1';
  }, 350);

  clearInterval(tickTimer);
  if (s.tick && !reducedMotion) {
    let secs = s.tick;
    tickTimer = setInterval(() => {
      secs = secs > 0 ? secs - 1 : s.tick;
      eta5.textContent = Math.floor(secs / 60) + 'm ' + String(secs % 60).padStart(2, '0') + 's';
    }, 1000);
  }
}

applyScenario(SCENARIOS[0]);

if (!reducedMotion) {
  let i = 0;
  setInterval(() => {
    i = (i + 1) % SCENARIOS.length;
    applyScenario(SCENARIOS[i]);
  }, 5200);
}

/* ---------- sticky header background on scroll ---------- */

const siteHeader = el('siteHeader');
if (siteHeader) {
  const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- scroll reveal ---------- */

const revealEls = document.querySelectorAll('.reveal');

if (reducedMotion) {
  revealEls.forEach((node) => node.classList.add('in'));
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      // stagger siblings that arrive in the same batch
      const delay = (entry.target.dataset.idx % 4) * 90;
      setTimeout(() => entry.target.classList.add('in'), delay);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((node, idx) => {
    node.dataset.idx = idx;
    io.observe(node);
  });
}

/* ---------- cursor glow (desktop, motion-ok only) ---------- */

const glow = document.querySelector('.glow');
const finePointer = window.matchMedia('(pointer: fine)').matches;

if (glow && finePointer && !reducedMotion) {
  let targetX = innerWidth * 0.6, targetY = innerHeight * 0.25;
  let x = targetX, y = targetY;

  addEventListener('pointermove', (e) => { targetX = e.clientX; targetY = e.clientY; });

  (function follow() {
    x += (targetX - x) * 0.06;
    y += (targetY - y) * 0.06;
    glow.style.top = y + 'px';
    glow.style.left = x + 'px';
    requestAnimationFrame(follow);
  })();
}

/* ---------- roadmap timeline draw ---------- */

const timeline = el('timeline');
const tlProgress = el('tlProgress');

if (timeline && tlProgress && !reducedMotion) {
  const draw = () => {
    const rect = timeline.getBoundingClientRect();
    const viewport = innerHeight * 0.7;
    const progress = Math.min(1, Math.max(0, (viewport - rect.top) / rect.height));
    tlProgress.style.height = (progress * rect.height) + 'px';
  };
  addEventListener('scroll', draw, { passive: true });
  draw();
}
