import * as THREE from 'three';
import { clamp, smoothstep } from './noise.js';
import { t as tr } from './i18n.js';

const $ = (s, el = document) => el.querySelector(s);

function letters(text) {
  return [...text]
    .map((ch, i) => `<span class="l" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`)
    .join('');
}

const fmtKm = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

export function buildUI({ cities, P0, P1, SLOT }) {
  const root = document.documentElement;
  const chaptersEl = $('#chapters');
  const n = cities.length;

  chaptersEl.innerHTML = cities
    .map(
      (c, i) => `
    <article class="chapter ${i % 2 ? 'right' : 'left'}" data-i="${i}">
      <div class="ch-photo"><img src="${c.photo}" alt="${c.landmark}" loading="lazy" /><span>${c.landmark}</span></div>
      <div class="ch-meta"><span>${tr('Stop')} ${String(i + 1).padStart(2, '0')} / ${n}</span><span>${c.coords}</span></div>
      <h2 aria-label="${c.name}">${letters(c.name)}</h2>
      <p class="ch-sub">${c.sub}</p>
      <p class="ch-fact">${c.fact}</p>
      <div class="ch-lm"><small>${tr('Landmark')}</small><strong>${c.landmark}</strong><em>${c.built}</em></div>
      <p class="ch-story">${c.story}</p>
      <div class="ch-foot">
        <span class="ch-km">≈ ${fmtKm(c.km)} ${tr("km from Chang'an")}</span>
        <span class="ch-cargo">+ ${c.cargo}</span>
      </div>
    </article>`
    )
    .join('');
  const chapters = [...chaptersEl.children];

  // route bar
  const bar = $('#route-bar');
  bar.innerHTML =
    `<div class="rb-line"><div class="rb-fill"></div></div>` +
    cities
      .map(
        (c, i) =>
          `<button class="rb-stop" style="left:${((c.p - P0) / (P1 - P0)) * 100}%" data-i="${i}" aria-label="${tr('Jump to')} ${c.name}"><i></i><span>${c.name}</span></button>`
      )
      .join('');
  const fill = $('.rb-fill', bar);
  const stops = [...bar.querySelectorAll('.rb-stop')];
  stops.forEach((s) =>
    s.addEventListener('click', () => {
      const c = cities[+s.dataset.i];
      const max = window.__journeyMax();
      (window.__lenis ? window.__lenis.scrollTo(c.p * max, { duration: 2.2 }) : scrollTo({ top: c.p * max, behavior: 'smooth' }));
    })
  );

  // cargo
  const cargoEl = $('#cargo-list');
  cargoEl.innerHTML = cities.map((c) => `<li>${c.cargo}</li>`).join('');
  const cargoItems = [...cargoEl.children];

  const kmEl = $('#km');
  const dayEl = $('#day');
  const stopEl = $('#stop-name');
  const intro = $('#intro');
  const outro = $('#outro');
  const hint = $('#camel-hint');
  const card = $('#camel-card');

  $('#again').addEventListener('click', () => (window.__lenis ? window.__lenis.scrollTo(0, { duration: 3 }) : scrollTo({ top: 0, behavior: 'smooth' })));
  $('#start').addEventListener('click', () => {
    const max = window.__journeyMax();
    window.__lenis ? window.__lenis.scrollTo(cities[0].p * max, { duration: 2.2 }) : scrollTo({ top: cities[0].p * max, behavior: 'smooth' });
  });

  const inkDay = new THREE.Color('#25170d');
  const inkNight = new THREE.Color('#f4ead6');
  const paperDay = new THREE.Color('#f4e4c9');
  const paperNight = new THREE.Color('#0f1630');
  const ink = new THREE.Color();
  const paper = new THREE.Color();

  let last = { km: -1, stop: -1, cargo: -1, ink: -1 };
  let cardTimer;

  return {
    ready() {
      document.body.classList.add('is-ready');
    },

    moveCursor(x, y) {
      hint.style.transform = `translate(${x + 18}px, ${y + 14}px)`;
    },

    hoverCamel(on) {
      hint.classList.toggle('on', on);
    },

    showCamel(camel, i, x, y) {
      card.innerHTML = `<small>${tr('Camel')} ${String(i + 1).padStart(2, '0')}</small><strong>${camel.name}</strong><p>${camel.line}</p>`;
      const cx = Math.min(x + 20, innerWidth - 280);
      const cy = Math.min(y - 20, innerHeight - 160);
      card.style.transform = `translate(${cx}px, ${cy}px)`;
      card.classList.add('on');
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => card.classList.remove('on'), 3200);
    },

    update({ p, t, km, ink: night }) {
      // theme follows the time of day
      const q = Math.round(night * 100) / 100;
      if (q !== last.ink) {
        last.ink = q;
        ink.copy(inkDay).lerp(inkNight, q);
        paper.copy(paperDay).lerp(paperNight, q);
        root.style.setProperty('--ink', `#${ink.getHexString()}`);
        root.style.setProperty('--paper', `#${paper.getHexString()}`);
      }

      const vi = 1 - smoothstep(0.004, P0 * 0.75, p);
      intro.style.setProperty('--v', vi.toFixed(3));
      intro.style.visibility = vi > 0.001 ? 'visible' : 'hidden';

      const vo = smoothstep(P1 + 0.03, 0.975, p);
      outro.style.setProperty('--v', vo.toFixed(3));
      outro.style.visibility = vo > 0.001 ? 'visible' : 'hidden';
      document.body.classList.toggle('is-outro', vo > 0.2);
      document.body.classList.toggle('is-journey', vi < 0.6 && vo < 0.4);

      let nearest = -1;
      chapters.forEach((el, i) => {
        const d = Math.abs(p - cities[i].p);
        const v = clamp(1 - (d - SLOT * 0.2) / (SLOT * 0.16));
        el.style.setProperty('--v', v.toFixed(3));
        el.style.visibility = v > 0.001 ? 'visible' : 'hidden';
        if (d < SLOT * 0.5) nearest = i;
      });

      const k = Math.round(km / 10) * 10;
      if (k !== last.km) {
        last.km = k;
        kmEl.textContent = fmtKm(k);
        dayEl.textContent = String(Math.floor(km / 30) + 1);
      }

      if (nearest !== last.stop) {
        last.stop = nearest;
        stopEl.textContent =
          nearest >= 0 ? `${String(nearest + 1).padStart(2, '0')} — ${cities[nearest].name}` : tr('On the road');
        stops.forEach((s, i) => s.classList.toggle('current', i === nearest));
      }

      let got = 0;
      cities.forEach((c, i) => {
        if (p > c.p - SLOT * 0.12) got = i + 1;
      });
      if (got !== last.cargo) {
        last.cargo = got;
        cargoItems.forEach((li, i) => li.classList.toggle('on', i < got && i >= got - 3));
        stops.forEach((s, i) => s.classList.toggle('passed', i < got));
      }

      fill.style.transform = `scaleX(${clamp((p - P0) / (P1 - P0)).toFixed(4)})`;
    },
  };
}
