// The interludes: one day with the caravan, packing a camel, a map that draws itself,
// the languages of the road, three voices and a starry finale. Every piece of text
// here arrives in its own way — sand, a loom, a stamp, a typewriter, a walking caravan,
// split-flap boards, a pen, runes being deciphered, ink, and constellations.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function pinProgress(el) {
  const r = el.getBoundingClientRect();
  const span = r.height - innerHeight;
  return span > 0 ? clamp(-r.top / span) : 0;
}
const onScreen = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -100 && r.top < innerHeight + 100;
};

// ------------------------------------------------------------------ 1. sand gathers into letters
function sandTitle(canvas, text) {
  const ctx = canvas.getContext('2d');
  let pts = [];
  let W = 0;
  let H = 0;
  const dpr = Math.min(devicePixelRatio, 2);
  function layout() {
    W = canvas.parentElement.clientWidth;
    // hidden or not laid out yet: getImageData throws on a 0-size canvas
    if (!W) return;
    const size = Math.max(40, Math.min(150, W * 0.085));
    // wrap the title into lines that fit
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `600 ${size}px "Cormorant Garamond", serif`;
    const words = text.toUpperCase().split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (probe.measureText(test).width > W * 0.98 && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
    H = Math.ceil(lines.length * size * 0.95 + size * 0.2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    // draw the text once, then sample its pixels as grain targets
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    o.font = probe.font;
    o.textBaseline = 'top';
    o.fillStyle = '#000';
    lines.forEach((l, i) => o.fillText(l, 0, i * size * 0.95 + size * 0.05));
    const data = o.getImageData(0, 0, W, H).data;
    const step = W < 600 ? 3 : 4;
    pts = [];
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] > 128) {
          const side = Math.random();
          pts.push({
            tx: x,
            ty: y,
            // grains start off the left/right edges or below, like blown sand
            sx: side < 0.4 ? -40 - Math.random() * 200 : side < 0.8 ? W + 40 + Math.random() * 200 : Math.random() * W,
            sy: side < 0.8 ? Math.random() * H * 2 - H * 0.5 : H + 60 + Math.random() * 200,
            d: Math.random() * 0.35 + (x / W) * 0.25,
            s: Math.random() < 0.2 ? 2 : 1.4,
          });
        }
      }
    }
  }
  layout();
  addEventListener('resize', layout);
  return (k, color) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color;
    for (const p of pts) {
      const e = ease(clamp((k - p.d) / 0.4));
      const wob = (1 - e) * Math.sin(p.tx * 0.05 + k * 20) * 8;
      ctx.globalAlpha = 0.25 + e * 0.75;
      ctx.fillRect(lerp(p.sx, p.tx, e), lerp(p.sy, p.ty, e) + wob, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  };
}

// ------------------------------------------------------------------ 2. loom: lines are woven in by a thread
function loom(p) {
  if (p.dataset.loomed) return;
  p.dataset.loomed = '1';
  const words = p.textContent.trim().split(/\s+/);
  p.innerHTML = words.map((w) => `<span class="lw">${w}</span>`).join(' ');
  const spans = $$('.lw', p);
  const lines = [];
  let top = null;
  for (const s of spans) {
    if (s.offsetTop !== top) {
      lines.push([]);
      top = s.offsetTop;
    }
    lines.at(-1).push(s.textContent);
  }
  p.innerHTML = lines.map((l, i) => `<span class="loom-line" style="--li:${i}">${l.join(' ')}</span>`).join('');
}

// ------------------------------------------------------------------ 8. Old Turkic runes resolving into text
const RUNE0 = 0x10c00;
function runeFor(ch) {
  if (!/\p{L}/u.test(ch)) return ch;
  return String.fromCodePoint(RUNE0 + (ch.toLowerCase().codePointAt(0) % 72));
}
function decipher(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((ch, i) => (ch === ' ' ? ' ' : `<span class="rn" data-ch="${ch}" style="--i:${i}">${runeFor(ch)}</span>`)).join('');
  return () => {
    const spans = $$('.rn', el);
    spans.forEach((s, i) => {
      setTimeout(() => {
        s.textContent = s.dataset.ch;
        s.classList.add('read');
      }, reduced ? 0 : 400 + i * 22 + Math.random() * 180);
    });
  };
}

// ------------------------------------------------------------------ 9. ink spreading into words
function inkWords(el) {
  el.innerHTML = el.textContent
    .trim()
    .split(/\s+/)
    .map((w, i) => `<span class="ink" style="--i:${i}">${w}</span>`)
    .join(' ');
}

// ------------------------------------------------------------------ 10. stars gathering into words
function constellation(canvas, text) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  let W = 0;
  let H = 0;
  let stars = [];
  let links = [];
  function layout() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const size = Math.min(W * 0.14, H * 0.28, 180);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    o.font = `600 ${size}px "Cormorant Garamond", serif`;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(text.toUpperCase(), W / 2, H * 0.3, W * 0.92);
    const d = o.getImageData(0, 0, W, H).data;
    const cand = [];
    const step = 7;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const a = d[(y * W + x) * 4 + 3] > 128;
        // keep pixels on the edge of the letters: they read as constellation lines
        const b = d[(y * W + Math.min(W - 1, x + step)) * 4 + 3] > 128;
        const c = d[(Math.min(H - 1, y + step) * W + x) * 4 + 3] > 128;
        if (a && (!b || !c)) cand.push([x, y]);
      }
    }
    const want = Math.min(cand.length, W < 600 ? 110 : 220);
    const pick = [];
    for (let i = 0; i < want; i++) pick.push(cand[Math.floor((i / want) * cand.length)]);
    stars = pick.map(([x, y]) => ({ tx: x, ty: y, sx: Math.random() * W, sy: Math.random() * H, tw: Math.random() * 6, r: Math.random() < 0.15 ? 1.8 : 1.1 }));
    // free stars that stay in the sky
    for (let i = 0; i < (W < 600 ? 60 : 140); i++) stars.push({ tx: null, sx: Math.random() * W, sy: Math.random() * H, tw: Math.random() * 6, r: Math.random() * 1.1 + 0.3 });
    links = [];
    const fixed = stars.filter((s) => s.tx != null);
    fixed.forEach((s, i) => {
      for (let j = i + 1; j < fixed.length; j++) {
        const q = fixed[j];
        if (Math.hypot(s.tx - q.tx, s.ty - q.ty) < step * 2.2) {
          links.push([s, q]);
          break;
        }
      }
    });
  }
  layout();
  addEventListener('resize', layout);
  return (k, time) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const e = ease(clamp(k));
    for (const s of stars) {
      s.x = s.tx == null ? s.sx : lerp(s.sx, s.tx, e);
      s.y = s.tx == null ? s.sy : lerp(s.sy, s.ty, e);
    }
    ctx.strokeStyle = `rgba(255, 220, 160, ${0.35 * clamp((k - 0.6) / 0.4)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [a, b] of links) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(time * 2 + s.tw * 3);
      ctx.fillStyle = `rgba(255, 240, 210, ${tw})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (s.tx != null ? 1 + e * 0.3 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

// ------------------------------------------------------------------ the map
const CITY_LL = [
  ["Chang'an", 108.94, 34.34], ['Dunhuang', 94.66, 40.14], ['Taklamakan', 82.2, 38.9], ['Kashgar', 75.99, 39.47], ['Pamir', 73.5, 38.5],
  ['Samarkand', 66.96, 39.65], ['Bukhara', 64.42, 39.77], ['Baghdad', 44.36, 33.31], ['Constantinople', 28.98, 41.01], ['Venice', 12.32, 45.44],
];
const mx = (lon) => 60 + ((lon - 10) / 102) * 880;
const my = (lat) => 330 - ((lat - 30) / 18) * 240;

// ------------------------------------------------------------------ languages
const WORDS = {
  silk: ['丝绸', 'ابریشم', 'حرير', 'ipak', 'ipek', 'μετάξι', 'seta', 'шёлк', 'silk'],
  caravan: ['商队', 'کاروان', 'قافلة', 'karvon', 'kervan', 'καραβάνι', 'carovana', 'караван', 'caravan'],
  friend: ['朋友', 'دوست', 'صديق', 'doʻst', 'dost', 'φίλος', 'amico', 'друг', 'friend'],
};
const LANG_NAMES = ['Chinese', 'Persian', 'Arabic', 'Uzbek', 'Turkish', 'Greek', 'Italian', 'Russian', 'English'];

// ------------------------------------------------------------------ bazaar (a playful price index)
const BZ_CITIES = ["Chang'an", 'Dunhuang', 'Kashgar', 'Samarkand', 'Bukhara', 'Baghdad', 'Constantinople', 'Venice'];
const BAZAAR = [
  { name: 'Silk', img: 'cocoons.jpg', mult: [1, 2, 4, 7, 9, 22, 45, 80], note: 'One bolt of silk could be worth about eighty times more in Venice than where it was woven.' },
  { name: 'Paper', img: 'paper.jpg', mult: [1, 2, 3, 2, 3, 6, 12, 20], note: 'Samarkand made its own paper — so the price dips there, then climbs again all the way west.' },
  { name: 'Jade', img: 'kashgar.jpg', mult: [12, 8, 1, 3, 4, 9, 15, 18], note: 'Jade came from the rivers near Khotan and Kashgar — cheapest there, precious in both directions.' },
  { name: 'Spices', img: 'raisins.jpg', mult: [6, 5, 4, 3, 3, 1, 8, 25], note: 'Pepper came up from India to Baghdad. By the time it reached Venice it was sold almost by the grain.' },
  { name: 'Glass', img: 'glass.jpg', east: true, mult: [1, 3, 5, 9, 11, 16, 24, 40], note: 'Going the other way: Roman glass was cheap at home and a treasure by the time it reached Chang’an.' },
];

export function buildExtra({ more, t }) {
  const updaters = [];
  const io = (el, fn, threshold = 0.35) => {
    const ob = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          ob.disconnect();
          fn();
        }),
      { threshold }
    );
    ob.observe(el);
  };

  // ---------------------------------------------------------------- one day with the caravan
  const day = $('[data-day]', more);
  if (day) {
    const sand = sandTitle($('[data-sand]', day), t('A day with the caravan'));
    const stages = $$('.x-stage', day);
    const ticks = $$('.x-clock li', day);
    const sun = $('.x-sun', day);
    const moon = $('.x-moon', day);
    // sky and ink for dawn, noon, dusk and night
    const SKY = [
      ['#f3cfa6', '#c98a6a', '#3b2416'],
      ['#f6e6c4', '#e8c98c', '#2a1a0e'],
      ['#e59a62', '#7a3b4f', '#fff1dc'],
      ['#0f1630', '#1d2850', '#f4ead6'],
    ];
    const mix = (a, b, k) => {
      const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
      const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
      return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',')})`;
    };
    let current = -1;
    updaters.push((dt, time) => {
      if (!onScreen(day)) return;
      const p = pinProgress(day);
      const f = clamp(p * 3.999, 0, 3.999);
      const i = Math.floor(f);
      const k = ease(clamp((f - i - 0.6) / 0.4));
      const j = Math.min(3, i + 1);
      day.style.setProperty('--sky-a', mix(SKY[i][0], SKY[j][0], k));
      day.style.setProperty('--sky-b', mix(SKY[i][1], SKY[j][1], k));
      const ink = mix(SKY[i][2], SKY[j][2], k);
      day.style.setProperty('--sky-ink', ink);
      // the sun climbs and sets, then the moon rises
      const a = clamp(p / 0.72);
      sun.style.transform = `translate(${lerp(-10, 110, a)}vw, ${(1 - Math.sin(a * Math.PI)) * 60 + 8}vh)`;
      sun.style.opacity = String(1 - clamp((p - 0.62) / 0.1));
      moon.style.opacity = String(clamp((p - 0.7) / 0.12));
      moon.style.transform = `translate(${lerp(60, 80, clamp((p - 0.7) / 0.3))}vw, ${lerp(30, 12, clamp((p - 0.7) / 0.3))}vh)`;
      if (i !== current) {
        current = i;
        stages.forEach((s, n) => {
          s.classList.toggle('on', n === i);
          if (n === i) loom($('[data-loom]', s));
        });
        ticks.forEach((tk, n) => tk.classList.toggle('on', n <= i));
      }
      // the title gathers from sand as the section arrives, and blows away as it leaves
      const r = day.getBoundingClientRect();
      const arrive = clamp((innerHeight - r.top) / (innerHeight * 0.9));
      const leave = clamp((r.bottom - innerHeight * 0.6) / (innerHeight * 0.6));
      sand(Math.min(arrive, leave) * 1.4, ink);
    });
  }

  // ---------------------------------------------------------------- the bazaar: a price that grows city by city
  const bz = $('[data-bazaar]', more);
  if (bz) {
    const goodsEl = $('[data-bz-goods]', bz);
    const chart = $('[data-bz-chart]', bz);
    const note = $('[data-bz-note]', bz);
    goodsEl.innerHTML = BAZAAR.map((g, i) => `<button type="button" role="tab" class="x-bz-tab" data-i="${i}" aria-selected="${i === 0}"><img src="photos/${g.img}" alt="" /><span>${t(g.name)}</span></button>`).join('');
    // odometer digits: each digit is a column of 0–9 that rolls into place
    const odo = (n) =>
      String(n)
        .split('')
        .map((d, i) => `<span class="od" style="--d:${d};--i:${i}"><span>${'0123456789'.split('').map((x) => `<b>${x}</b>`).join('')}</span></span>`)
        .join('');
    let shown = false;
    const render = (gi) => {
      const g = BAZAAR[gi];
      const route = g.east ? [...BZ_CITIES].reverse() : BZ_CITIES;
      const max = Math.max(...g.mult);
      chart.innerHTML = route
        .map(
          (c, i) => `<div class="x-bz-col" style="--h:${(g.mult[i] / max).toFixed(3)};--i:${i}">
            <div class="x-bz-val"><span class="x">×</span>${odo(g.mult[i])}</div>
            <div class="x-bz-bar"></div>
            <div class="x-bz-city">${t(c)}</div>
          </div>`
        )
        .join('');
      note.textContent = t(g.note);
      $$('.x-bz-tab', goodsEl).forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === gi)));
      chart.classList.remove('go');
      note.classList.remove('go');
      void chart.offsetWidth;
      if (shown) {
        chart.classList.add('go');
        note.classList.add('go');
      }
    };
    goodsEl.addEventListener('click', (e) => {
      const b = e.target.closest('.x-bz-tab');
      if (b) render(+b.dataset.i);
    });
    render(0);
    io(chart, () => {
      shown = true;
      chart.classList.add('go');
      note.classList.add('go');
    }, 0.3);
  }

  // ---------------------------------------------------------------- the map that draws itself
  const map = $('[data-map]', more);
  if (map) {
    const svg = $('[data-map-svg]', map);
    const NS = 'http://www.w3.org/2000/svg';
    let g = '';
    // graticule and a compass rose, like an old portolan chart
    for (let x = 60; x <= 940; x += 88) g += `<line class="grat" x1="${x}" y1="30" x2="${x}" y2="390" />`;
    for (let y = 30; y <= 390; y += 60) g += `<line class="grat" x1="40" y1="${y}" x2="960" y2="${y}" />`;
    g += `<g class="rose" transform="translate(880 340)">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="0" y1="0" x2="${(Math.cos((a * Math.PI) / 180) * (a % 90 ? 18 : 34)).toFixed(1)}" y2="${(Math.sin((a * Math.PI) / 180) * (a % 90 ? 18 : 34)).toFixed(1)}" />`).join('')}<circle r="6" /></g>`;
    const pts = CITY_LL.map(([, lon, lat]) => [mx(lon), my(lat)]);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      d += ` Q${((x0 + x1) / 2).toFixed(1)} ${(Math.min(y0, y1) - 26).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    g += `<path class="route-ghost" d="${d}" /><path class="route" d="${d}" />`;
    // label offsets chosen by hand so the crowded Central Asian stops don't overlap
    const LBL = [[0, 34, 'middle'], [0, -20, 'middle'], [0, 40, 'middle'], [10, -40, 'start'], [-6, 46, 'end'], [-8, -24, 'end'], [-12, 30, 'end'], [0, 34, 'middle'], [0, -20, 'middle'], [0, -20, 'middle']];
    g += pts.map(([x, y], i) => `<g class="city" data-c="${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="5" /><circle class="halo" r="12" /><text x="${LBL[i][0]}" y="${LBL[i][1]}" text-anchor="${LBL[i][2]}"></text></g>`).join('');
    svg.innerHTML = g;
    const route = $('.route', svg);
    const len = route.getTotalLength();
    route.style.strokeDasharray = `${len}`;
    const cities = $$('.city', svg);
    // where along the path each city sits
    const at = pts.map(([x, y]) => {
      let best = 0;
      let bd = Infinity;
      for (let s = 0; s <= 400; s++) {
        const q = route.getPointAtLength((s / 400) * len);
        const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = s / 400;
        }
      }
      return best;
    });
    // the caravan of words walking across the bottom of the chart
    const wc = $('[data-word-caravan]', map);
    wc.innerHTML = t('One step at a time — ten thousand kilometres.')
      .split(' ')
      .map((w, i) => `<span style="--i:${i}">${w}</span>`)
      .join(' ');
    const wcs = $$('span', wc);
    void NS;
    updaters.push((dt, time) => {
      if (!onScreen(map)) return;
      const k = ease(clamp(pinProgress(map) * 1.15));
      route.style.strokeDashoffset = `${len * (1 - k)}`;
      cities.forEach((c, i) => {
        const on = k >= at[i] - 0.005;
        const label = $('text', c);
        if (on && !c.classList.contains('on')) {
          c.classList.add('on');
          c._t0 = performance.now();
        }
        if (!on && c.classList.contains('on')) {
          c.classList.remove('on');
          label.textContent = '';
        }
        if (on) {
          // typewriter: one letter every 45 ms, with a caret while typing
          const full = t(CITY_LL[i][0]);
          const n = Math.min(full.length, Math.floor((performance.now() - c._t0) / 45) + 1);
          const txt = full.slice(0, n) + (n < full.length ? '▍' : '');
          if (label.textContent !== txt) label.textContent = txt;
        }
      });
      // words travel west→east with the scroll and sway in step, like camels in a line
      wc.style.transform = `translateX(${lerp(-60, 30, k)}%)`;
      wcs.forEach((s, i) => {
        const ph = time * 5 + i * 0.9;
        s.style.transform = `translateY(${(Math.abs(Math.sin(ph)) * -7).toFixed(1)}px) rotate(${(Math.sin(ph) * 3).toFixed(1)}deg)`;
      });
    });
  }

  // ---------------------------------------------------------------- languages: split-flap boards
  const langs = $('[data-langs]', more);
  if (langs) {
    const GL = 'ABCDEFGHIKLMNOPRSTUVYZ0123456789';
    const boards = $$('.x-board', langs).map((b, n) => ({ b, flap: $('[data-flap]', b), name: $('[data-lang-name]', b), words: WORDS[b.dataset.word], i: n * 3 }));
    const show = (bd) => {
      const word = bd.words[bd.i % bd.words.length];
      bd.name.textContent = t(LANG_NAMES[bd.i % LANG_NAMES.length]);
      // Arabic-script words must stay joined, so they flip as one tile
      const cells = /[؀-ۿ]/.test(word) ? [word] : [...word];
      bd.flap.dir = /[؀-ۿ]/.test(word) ? 'rtl' : 'ltr';
      bd.flap.innerHTML = cells.map((ch, i) => `<span class="cell" style="--i:${i}"><b>${ch}</b></span>`).join('');
      $$('.cell b', bd.flap).forEach((c, i) => {
        if (reduced || cells.length === 1) return;
        const final = c.textContent;
        let n = 0;
        const spin = () => {
          if (n++ < 5 + i) {
            c.textContent = GL[Math.floor(Math.random() * GL.length)];
            setTimeout(spin, 55);
          } else c.textContent = final;
        };
        spin();
      });
    };
    let timer = null;
    io(langs, () => {
      boards.forEach(show);
      timer = setInterval(() => {
        boards.forEach((bd, n) =>
          setTimeout(() => {
            bd.i++;
            show(bd);
          }, n * 260)
        );
      }, 2800);
    });
    void timer;
  }

  // ---------------------------------------------------------------- voices
  const voices = $('[data-voices]', more);
  if (voices) {
    // Marco Polo: written by a pen, stroke by stroke
    const pen = $('[data-pen]', voices);
    const txt = $('[data-pen-text]', pen);
    const svg = $('svg', pen);
    const sizePen = () => {
      const w = Math.max(400, txt.getComputedTextLength() + 30);
      svg.setAttribute('viewBox', `0 0 ${w} 160`);
    };
    document.fonts?.ready.then(sizePen);
    sizePen();
    io(pen, () => pen.classList.add('write'), 0.5);
    // Ibn Battuta: runes that resolve into words
    const dq = $('[data-decipher]', voices);
    const go = decipher(dq);
    io(dq, go, 0.5);
    // Xuanzang: ink spreading into words
    const iq = $('[data-ink]', voices);
    inkWords(iq);
    io(iq, () => iq.classList.add('lit'), 0.5);
  }

  // ---------------------------------------------------------------- finale: stars gather into words
  const starsCanvas = $('[data-stars]', more);
  if (starsCanvas) {
    const cta = starsCanvas.closest('section');
    let draw = null;
    let k = 0;
    io(cta, () => (draw = constellation(starsCanvas, t('Ride again'))), 0.05);
    updaters.push((dt, time) => {
      if (!draw || !onScreen(cta)) return;
      const r = cta.getBoundingClientRect();
      const target = clamp((innerHeight - r.top) / (innerHeight * 0.85));
      k = lerp(k, target, 1 - Math.exp(-dt * 2.6));
      draw(k, time);
    });
  }

  return {
    update(dt, time) {
      updaters.forEach((u) => u(dt, time));
    },
  };
}
