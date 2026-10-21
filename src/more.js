// The long page that follows the 3D journey: pinned sections, counters,
// a camel you can turn, a climate slider and a caravan post office.
import { clamp, lerp } from './noise.js';
import { buildMotion } from './motion.js';
import { buildStories } from './story.js';
import { buildQuiz } from './quiz.js';
import { buildExtra } from './extra.js';
import { t } from './i18n.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

// 0 when the section's top reaches the top of the screen, 1 when its bottom does
function pinProgress(el) {
  const r = el.getBoundingClientRect();
  const span = r.height - innerHeight;
  return span > 0 ? clamp(-r.top / span) : 0;
}

export function buildMore({ cities, scrollToTop }) {
  const more = $('#more');
  const updaters = [];

  // ------------------------------------------------ reveal on enter
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }),
    { threshold: 0.2 }
  );
  $$('.m-head, .m-stat, .m-review, .m-card, .m-specs > div, .m-log li, .m-table tr, .m-abstract, .m-bib, .m-cta h2 .row', more).forEach((el) =>
    io.observe(el)
  );

  // ------------------------------------------------ 01 manifesto: words light up as you scroll
  const words = $('[data-words]');
  words.innerHTML = words.textContent
    .trim()
    .split(/\s+/)
    .map((w) => `<span>${w}</span>`)
    .join(' ');
  const wordEls = [...words.children];
  const manifesto = $('#manifesto');
  updaters.push(() => {
    const k = pinProgress(manifesto) * 1.15;
    wordEls.forEach((w, i) => w.classList.toggle('on', i / wordEls.length < k));
  });

  // ------------------------------------------------ 02 counters
  const countIO = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countIO.unobserve(e.target);
        const to = +e.target.dataset.count;
        const t0 = performance.now();
        const tick = (now) => {
          const k = clamp((now - t0) / 1600);
          e.target.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { threshold: 0.6 }
  );
  $$('[data-count]').forEach((el) => countIO.observe(el));

  // ------------------------------------------------ 03 goods: vertical scroll drives a horizontal track
  const goods = $('#goods');
  const track = $('[data-track]');
  const sizeGoods = () => {
    const extra = Math.max(0, track.scrollWidth - innerWidth + 64);
    goods.style.height = `${innerHeight + extra}px`;
    goods.dataset.extra = extra;
  };
  sizeGoods();
  addEventListener('resize', sizeGoods);
  updaters.push(() => {
    track.style.transform = `translate3d(${-pinProgress(goods) * +goods.dataset.extra}px,0,0)`;
  });

  // ------------------------------------------------ postcards: each photo drifts at its own speed
  const shots = $$('.m-shot');
  updaters.push(() => {
    for (const el of shots) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      const mid = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      el.style.setProperty('--py', `${(-mid * +el.dataset.speed * 600).toFixed(1)}px`);
      el.style.setProperty('--zoom', (1.18 - clamp(1 - Math.abs(mid)) * 0.13).toFixed(3));
    }
  });
  shots.forEach((el) => io.observe(el));
  buildStories(shots);
  buildQuiz($('[data-quiz]'), t);
  const extra = buildExtra({ more, t });

  // ------------------------------------------------ photo break: the frame opens up as you scroll in
  const brk = $('[data-break]');
  updaters.push(() => {
    const r = brk.getBoundingClientRect();
    const k = clamp((innerHeight - r.top) / (innerHeight * 0.9));
    brk.style.setProperty('--open', k.toFixed(4));
    brk.style.setProperty('--drift', `${((r.top / innerHeight) * 80).toFixed(1)}px`);
  });

  // ------------------------------------------------ photo credits
  fetch('photos/credits.json')
    .then((r) => r.json())
    .then((c) => {
      $('[data-credits]').innerHTML = Object.values(c)
        .map((x) => `<li><a href="${x.page}" target="_blank" rel="noopener">${x.title.replace(/^File:/, '').replace(/\.(jpe?g|png)$/i, '')}</a> — ${x.artist}, ${x.license}</li>`)
        .join('');
    })
    .catch(() => {});

  // ------------------------------------------------ 05 climate slider
  const climate = $('[data-climate]');
  const tempIn = $('[data-temp-input]');
  const CLIMATE = [
    [-30, 'Pamir pass, January', 'Wearing every blanket on the caravan', '8 km / day'],
    [-10, 'Kashgar, winter', 'Grumpy but moving', '20 km / day'],
    [10, 'Dunhuang, spring', 'Shedding its winter coat everywhere', '30 km / day'],
    [25, 'Samarkand, May', 'Perfect. Asking for melons', '35 km / day'],
    [38, 'Bukhara, July', 'Travelling by night, sleeping by day', '25 km / day'],
    [50, 'Taklamakan, noon', 'Refusing to stand up. Respect it', '0 km / day'],
  ];
  const cold = [96, 140, 190];
  const mid = [244, 228, 201];
  const hot = [214, 92, 38];
  const setClimate = () => {
    const v = +tempIn.value;
    $('[data-temp]', climate).textContent = (v > 0 ? '+' : '') + v;
    const row = CLIMATE.reduce((best, r) => (Math.abs(r[0] - v) < Math.abs(best[0] - v) ? r : best));
    $('[data-where]', climate).textContent = t(row[1]);
    $('[data-status]', climate).textContent = t(row[2]);
    $('[data-speed]', climate).textContent = t(row[3]);
    const k = (v + 30) / 80;
    const c = k < 0.5 ? cold.map((x, i) => lerp(x, mid[i], k / 0.5)) : mid.map((x, i) => lerp(x, hot[i], (k - 0.5) / 0.5));
    climate.style.setProperty('--heat', `rgb(${c.map(Math.round).join(',')})`);
    climate.style.setProperty('--k', k.toFixed(3));
  };
  tempIn.addEventListener('input', setClimate);
  setClimate();

  // ------------------------------------------------ 06 caravan post
  const form = $('[data-post]');
  const opts = cities.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
  form.from.innerHTML = opts;
  form.to.innerHTML = opts;
  form.from.value = 5; // Samarkand
  form.to.value = 0; // Chang'an
  const cipherEl = $('[data-cipher]');
  let open = false;
  const shift = (s, k) =>
    s.replace(/[a-z]/gi, (ch) => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + k + 26) % 26) + base);
    });
  const setPost = () => {
    const a = cities[+form.from.value];
    const b = cities[+form.to.value];
    const km = Math.abs(a.km - b.km);
    const days = Math.ceil(km / 30);
    const msg = form.msg.value || '…';
    cipherEl.textContent = open ? msg : shift(msg, (days % 25) + 1);
    cipherEl.classList.toggle('open', open);
    $('[data-eta]').textContent = km ? `${fmt(days)} ${t('days')}` : t('Same day');
    $('[data-eta-note]').textContent = km
      ? `${fmt(km)} ${t('km at 30 km a day')}${days > 300 ? t(' — maybe write a shorter letter') : ''}`
      : t('You could just shout.');
  };
  form.addEventListener('input', () => {
    open = false;
    $('[data-decode]').textContent = t('Break the seal');
    setPost();
  });
  $('[data-decode]').addEventListener('click', (e) => {
    open = !open;
    e.currentTarget.textContent = open ? t('Seal it again') : t('Break the seal');
    setPost();
  });
  setPost();

  // ------------------------------------------------ 07 timeline: the silk line grows with scroll
  const log = $('[data-log]');
  updaters.push(() => {
    const r = log.getBoundingClientRect();
    const k = clamp((innerHeight * 0.6 - r.top) / r.height);
    log.style.setProperty('--grow', k.toFixed(4));
  });

  // ------------------------------------------------ 11 copy BibTeX
  $('[data-copy-bib]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText($('[data-bib]').textContent);
      btn.textContent = t('Copied');
    } catch {
      btn.textContent = t('Select & copy');
    }
    setTimeout(() => (btn.textContent = t('Copy BibTeX')), 1800);
  });

  // ------------------------------------------------ buttons
  $$('[data-ride]').forEach((b) => b.addEventListener('click', scrollToTop));
  $('[data-share]').addEventListener('click', async (e) => {
    const data = { title: 'Silk Road 2.0', text: 'Ride a caravan from Chang\'an to Venice', url: location.href.split('#')[0] };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        e.currentTarget.textContent = t('Link copied');
      }
    } catch {}
  });
  const motion = buildMotion({
    more,
    scrollTo: (target) =>
      window.__lenis ? window.__lenis.scrollTo(target, { offset: target === more ? 0 : -96, duration: 1.6 }) : target.scrollIntoView({ behavior: 'smooth' }),
  });

  // ------------------------------------------------ 3D layer behind the text (silk ribbon + walking camel)
  let layer = null;
  const layerCanvas = $('.m-3d');
  new IntersectionObserver(
    (entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      import('./more3d.js').then((m) => (layer = m.createMore3D(layerCanvas)));
    },
    { rootMargin: '100% 0px' }
  ).observe(more);

  // ------------------------------------------------ 04 camel viewer, created only when it gets close
  const viewer = $('[data-viewer]');
  let camel = null;
  new IntersectionObserver(
    (entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      import('./camel-viewer.js').then((m) => (camel = m.createCamelViewer(viewer)));
    },
    { rootMargin: '600px' }
  ).observe(viewer);

  return {
    // true once the long page fully covers the 3D scene, so the scene can stop rendering
    covers() {
      return more.getBoundingClientRect().top <= 0;
    },
    update(dt) {
      const top = more.getBoundingClientRect().top;
      document.body.classList.toggle('is-more', top < innerHeight * 0.5);
      motion.nav(dt, top);
      if (layer) layer.update(dt, performance.now() / 1000, clamp(1 - top / (innerHeight * 0.4)));
      if (top > innerHeight) return;
      motion.update(dt);
      extra.update(dt, performance.now() / 1000);
      updaters.forEach((u) => u());
      if (camel) camel.update(dt);
    },
  };
}

