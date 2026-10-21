import { sfx } from './sound.js';
import { t } from './i18n.js';
// Motion for the long page: letters and words that rise, eyebrows that decode,
// photos that tilt and breathe, a marquee driven by scroll speed and a navigation
// pill that follows the section you're reading.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ split text
// Wraps every word in a mask and every letter in a span with its own index,
// keeping <em>, <br> and other inline markup intact.
export function splitLetters(el) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  let ci = 0;
  let wi = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const w = document.createElement('span');
          w.className = 'w';
          w.setAttribute('aria-hidden', 'true');
          w.style.setProperty('--wi', wi++);
          for (const ch of part) {
            const c = document.createElement('span');
            c.className = 'c';
            c.textContent = ch;
            c.style.setProperty('--ci', ci++);
            w.append(c);
          }
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(el);
}

export function splitWords(el) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  let wi = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const w = document.createElement('span');
          w.className = 'ww';
          w.textContent = part;
          w.style.setProperty('--wi', wi++);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    }
  };
  walk(el);
}

// ------------------------------------------------------------------ decode effect for small mono labels
const GLYPHS = '—·/\\|_+*×#%&01ABCDEFXYZ';
function scramble(el) {
  const final = el.dataset.final || (el.dataset.final = el.textContent);
  if (reduced) return;
  const start = performance.now();
  const dur = 700 + final.length * 18;
  const tick = (now) => {
    const k = clamp((now - start) / dur);
    let out = '';
    for (let i = 0; i < final.length; i++) {
      const ch = final[i];
      const reveal = i / final.length < k * 1.15 - 0.1;
      out += ch === ' ' || reveal ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (k < 1) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ tilt + glare on photos
function tilt(el) {
  if (reduced || matchMedia('(hover: none)').matches) return;
  let raf = 0;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      el.classList.add('hot');
    });
  });
  el.addEventListener('pointerleave', () => {
    el.classList.remove('hot');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  });
}

// ------------------------------------------------------------------ main
export function buildMotion({ more, scrollTo }) {
  // headings: letters rise out of masks; the whole heading reveals when its header enters
  $$('.m-head h2, .m-break h2, .m-cta h2, .m-good h3, .m-good h4, .s-title, .m-shot figcaption b', more).forEach(splitLetters);
  $$('.m-review blockquote, .m-abstract > p:not(.m-authors), .m-break-text .eyebrow + h2 + p', more).forEach(splitWords);
  // nav and menu labels: letters that flip over one after another on hover
  $$('[data-roll], .m-menu-list a').forEach((el) => {
    const small = el.querySelector('small');
    if (small) small.remove();
    splitLetters(el);
    el.classList.add('lit', 'flipper');
    if (small) el.prepend(small);
  });
  $$('.ph.tilt, .m-good, .m-review').forEach(tilt);
  $$('.ph', more).forEach((el, i) => el.style.setProperty('--d', ((i * 1.7) % 7).toFixed(1)));

  // anything with letters/words animates when it (or its header) enters the viewport
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in', 'lit');
        $$('.eyebrow', e.target).forEach(scramble);
        io.unobserve(e.target);
      }),
    { threshold: 0.25 }
  );
  $$('.m-head, .m-break-text, .m-cta, .m-good, .m-card, .m-review, .m-abstract, .m-face, .m-thumb', more).forEach((el) => io.observe(el));

  // photos start fully masked (clip-path), and a masked element never counts as visible —
  // so watch the photo's parent and open the mask from there
  const masked = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.querySelectorAll(':scope > .ph, :scope > .m-th-img').forEach((m) => m.classList.add('in'));
        masked.unobserve(e.target);
      }),
    { threshold: 0.15 }
  );
  new Set($$('.ph, .m-th-img', more).map((el) => el.parentElement)).forEach((parent) => masked.observe(parent));

  // hovering text sends a wave of turning letters through it
  const wave = (h) => {
    if (h.classList.contains('wave')) return;
    h.classList.add('wave');
    const n = h.querySelectorAll('.c').length;
    setTimeout(() => h.classList.remove("wave"), 1000 + n * 32);
  };
  $$('.m-head h2, .m-cta h2, .m-break h2, .m-shot figcaption b, .m-good h3', more).forEach((h) => h.addEventListener('pointerenter', () => wave(h)));
  $$('.m-shot', more).forEach((f) => f.addEventListener('pointerenter', () => wave(f.querySelector('figcaption b'))));
  $$('.flipper').forEach((a) => a.addEventListener('pointerenter', () => wave(a)));

  // ---------------------------------------------------------------- goods: tap to turn the card over
  $$('.m-good', more).forEach((card) => {
    const flip = () => {
      const on = !card.classList.contains('flipped');
      card.classList.toggle('flipped', on);
      card.setAttribute('aria-pressed', String(on));
      if (on) {
        card.classList.remove('lit');
        void card.offsetWidth;
        card.classList.add('lit');
      }
    };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip()));
  });

  // ---------------------------------------------------------------- features: photo strips that open up
  const strips = $$('.m-strip', more);
  const open = (st) => {
    if (st.classList.contains('on')) return;
    strips.forEach((x) => {
      x.classList.toggle('on', x === st);
      x.setAttribute('aria-expanded', String(x === st));
    });
    st.classList.remove('lit');
    void st.offsetWidth;
    st.classList.add('lit');
  };
  strips.forEach((st) => {
    st.addEventListener('click', () => open(st));
    st.addEventListener('pointerenter', () => matchMedia('(hover: hover)').matches && open(st));
  });
  strips[0]?.classList.add('lit');

  // ---------------------------------------------------------------- marquees: drift, and speed up with scroll
  const bands = $$('[data-marquee]', more).map((el) => ({ el, track: $('.m-mq-track', el), x: 0, dir: el.classList.contains('m-mq-dark') ? 1 : -1 }));

  // ---------------------------------------------------------------- climate backdrop crossfades with temperature
  const climate = $('[data-climate]');
  const cbg = { cold: $('[data-c="cold"]', climate), mild: $('[data-c="mild"]', climate), hot: $('[data-c="hot"]', climate) };
  const tempIn = $('[data-temp-input]', climate);
  const setBg = () => {
    const v = +tempIn.value;
    const k = (v + 30) / 80;
    cbg.cold.style.opacity = clamp(1 - k / 0.5).toFixed(3);
    cbg.hot.style.opacity = clamp((k - 0.5) / 0.5).toFixed(3);
    cbg.mild.style.opacity = '1';
  };
  tempIn.addEventListener('input', setBg);
  setBg();

  // ---------------------------------------------------------------- navigation
  const nav = $('.m-nav');
  const pill = $('[data-pill]', nav);
  const ind = $('.m-ind', pill);
  const links = $$('a', pill);
  const nowEl = $('[data-now]', nav);
  const ring = $('[data-ring]', nav);
  const RING = 2 * Math.PI * 20;
  ring.style.strokeDasharray = RING;
  const sections = $$('section[id], section.m-cta', more);
  const names = {
    manifesto: 'Manifesto', postcards: 'Places', goods: 'Cargo', camel: 'The camel', climate: 'Climate', post: 'Caravan post',
    time: 'History', reviews: 'Reviews', oneday: 'One day', bazaar: 'The bazaar', map: 'The map', langs: 'Languages', voices: 'Voices', quiz: 'Quiz', features: 'Features', compare: 'Plans', paper: 'Research',
  };
  let current = '';
  let skew = 0;
  let lastSkew = 0;
  let currentLink = null;
  const navEl = nav;

  const moveInd = (a) => {
    if (!a) {
      ind.style.opacity = '0';
      return;
    }
    ind.style.opacity = '1';
    ind.style.width = `${a.offsetWidth}px`;
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  links.forEach((a) => {
    a.addEventListener('pointerenter', () => moveInd(a));
    a.addEventListener('pointerleave', () => moveInd(currentLink));
  });

  const go = (href, e) => {
    e?.preventDefault();
    if (href === '#top') {
      window.__lenis ? window.__lenis.scrollTo(0, { duration: 2.4 }) : scrollTo(0, 0);
      return;
    }
    const target = $(href);
    if (target) scrollTo(target);
  };
  $$('a[href^="#"]', nav).forEach((a) => a.addEventListener('click', (e) => go(a.getAttribute('href'), e)));

  // sound on/off (remembered; browsers only allow audio after a tap)
  const soundBtn = $('[data-sound]');
  const setSound = () => {
    const v = sfx.toggle();
    soundBtn.classList.toggle('on', v);
    soundBtn.setAttribute('aria-pressed', String(v));
  };
  soundBtn.addEventListener('click', setSound);
  let wanted = false;
  try {
    wanted = localStorage.getItem('silk-sound') === '1';
  } catch {}
  if (wanted) {
    const first = (e) => {
      if (!soundBtn.contains(e.target) && !sfx.on) setSound();
    };
    addEventListener('pointerdown', first, { once: true });
  }

  // full-screen menu with photo previews
  const menu = $('[data-menu]');
  const burger = $('[data-burger]', nav);
  const mphoto = $('[data-menu-photo]', menu);
  const setMenu = (open) => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    if (open) window.__lenis?.stop();
    else window.__lenis?.start();
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $$('a', menu).forEach((a, i) => {
    a.style.setProperty('--i', i);
    a.addEventListener('pointerenter', () => {
      mphoto.style.backgroundImage = `url(photos/${a.dataset.img})`;
      mphoto.classList.add('on');
    });
    a.addEventListener('click', (e) => {
      setMenu(false);
      go(a.getAttribute('href'), e);
    });
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

  return {
    // the navigation lives on every screen: on the road it shows the city, below it the section
    nav(dt, top) {
      let id = 'top';
      let label = document.getElementById('stop-name')?.textContent.replace(/^\d+ — /, '') || t('On the road');
      if (top < innerHeight * 0.45) {
        id = 'manifesto';
        for (const s of sections) {
          const r = s.getBoundingClientRect();
          if (r.top < innerHeight * 0.45 && r.bottom > innerHeight * 0.45) id = s.id || 'end';
        }
        label = t(names[id] || (id === 'end' ? 'The end' : 'Manifesto'));
      }
      if (id + label !== current) {
        current = id + label;
        nowEl.textContent = label;
        nowEl.classList.remove('flip');
        void nowEl.offsetWidth;
        nowEl.classList.add('flip');
        const a = links.find((l) => l.getAttribute('href') === `#${id}`);
        links.forEach((l) => l.classList.toggle('on', l === a));
        moveInd(a);
        currentLink = a;
      }
      // progress ring = how far through the whole site
      const h = document.documentElement.scrollHeight - innerHeight;
      ring.style.strokeDashoffset = (RING * (1 - clamp(scrollY / h))).toFixed(1);

      navEl.classList.toggle('on-road', top > 0);
    },
    update(dt) {
      // scroll speed bends the photos slightly
      const vel = window.__lenis?.velocity ?? 0;
      skew += (clamp(vel * 0.06, -3, 3) - skew) * (1 - Math.exp(-dt * 6));
      if (Math.abs(skew - lastSkew) > 0.01) {
        lastSkew = skew;
        more.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
        more.style.setProperty('--stretch', (1 + Math.min(0.04, Math.abs(skew) * 0.012)).toFixed(3));
      }

      // marquees
      const v = window.__lenis?.velocity ?? 0;
      for (const b of bands) {
        const r = b.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        b.x += (b.dir * (40 + Math.abs(v) * 14)) * dt;
        const w = b.track.scrollWidth / 2;
        if (b.x < -w) b.x += w;
        if (b.x > 0) b.x -= w;
        b.track.style.transform = `translate3d(${b.x.toFixed(1)}px,0,0) skewX(${clamp(-v * 0.4, -12, 12).toFixed(2)}deg)`;
      }
    },
  };
}
