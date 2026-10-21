// Click a postcard and its story opens: the photo flies out of the card into a large
// frame, the title sets itself letter by letter in a display serif, the text fades in
// word by word, and a small map shows where on the road the place lies.
import { splitLetters, splitWords } from './motion.js';
import { t } from './i18n.js';

const STORIES = [
  {
    img: 'shahizinda.jpg', place: 'Samarkand', lon: 66.99, lat: 39.66, title: 'Shah-i-Zinda', sub: 'The avenue of the living king',
    body: [
      'A narrow street of blue-tiled mausoleums climbing a hill outside old Samarkand. Most were built in the 14th and 15th centuries for the family and generals of Timur.',
      'Its name means “the living king”: legend says Kusam ibn Abbas, a cousin of the Prophet, never died here but walked into the hill and lives on inside it.',
    ],
    facts: [['Built', '11th–19th c.'], ['Look for', 'Carved glazed tiles'], ['Steps', 'Count them going up — and down']],
  },
  {
    img: 'dunhuang.jpg', place: 'Dunhuang', lon: 94.67, lat: 40.09, title: 'Crescent Lake', sub: 'Water inside the dunes',
    body: [
      'A spring-fed lake shaped like a new moon, hiding between the Mingsha Shan — the “Singing Sand Mountains” — just south of Dunhuang.',
      'When sand slides down the dunes they hum and boom. For caravans coming out of the desert, this was the first sight of water in days.',
    ],
    facts: [['Dunes', 'Sing when they slide'], ['Nearby', 'Mogao Caves'], ['Best at', 'Sunset']],
  },
  {
    img: 'camels.jpg', place: 'The caravan', lon: 108.9, lat: 34.3, title: 'Bactrian camels', sub: 'The engines of the road',
    body: [
      'Photographed in the 1890s by William Henry Jackson: a military caravan of two-humped camels — the same animals that carried silk for two thousand years.',
      'A Bactrian can carry around 200 kg, walk 30–40 km a day and survive frozen passes and burning sand. No machine replaced them until the railway.',
    ],
    facts: [['Payload', '≈ 200 kg'], ['Range', '30–40 km a day'], ['Humps', 'Fat, not water']],
  },
  {
    img: 'kalyan.jpg', place: 'Bukhara', lon: 64.41, lat: 39.78, title: 'Kalyan Minaret', sub: 'The lighthouse of the desert',
    body: [
      'Built in 1127 by the Karakhanid ruler Arslan Khan, about 46 metres of carved brick in fourteen different patterns.',
      'At night a fire burned at the top so caravans could find the city across the steppe. Legend says Genghis Khan spared it in 1220 when everything around it burned.',
    ],
    facts: [['Built', '1127'], ['Height', '≈ 46 m'], ['Patterns', '14 bands of brick']],
  },
  {
    img: 'kashgar.jpg', place: 'Kashgar', lon: 75.99, lat: 39.47, title: 'The old town', sub: 'Where the two roads meet',
    body: [
      'The northern and southern routes around the Taklamakan join again in Kashgar, and they have met here for more than two thousand years.',
      'Clay houses lean over narrow lanes, and the Sunday bazaar still sells horses, knives, carpets and melons, much as it did for the caravans.',
    ],
    facts: [['Mosque', 'Id Kah, 1442'], ['Market', 'Every Sunday'], ['Known for', 'Knives and melons']],
  },
  {
    img: 'pamir.jpg', place: 'Pamir', lon: 73.5, lat: 38.5, title: 'The Pamir Highway', sub: 'The road on the roof of the world',
    body: [
      'An old caravan way turned into a mountain road in the 1930s. It crosses the Ak-Baital pass at about 4,655 metres.',
      'Snow in summer, thin air, almost no trees. Xuanzang crossed these mountains on foot in the 7th century — on his way home from India.',
    ],
    facts: [['Highest pass', '≈ 4,655 m'], ['Built', '1930s'], ['Air', 'Very thin']],
  },
  {
    img: 'taklamakan.jpg', place: 'Taklamakan', lon: 82.2, lat: 38.9, title: 'The sea of sand', sub: 'Seen from orbit',
    body: [
      'One of the largest sand deserts on Earth, roughly 337,000 km². Its moving dunes can rise more than 200 metres.',
      'The caravans never crossed it — they split and went around, along strings of oases at the foot of the mountains, and met again in Kashgar.',
    ],
    facts: [['Area', '≈ 337,000 km²'], ['Dunes', '200 m and more'], ['Photo', 'NASA Landsat 7']],
  },
  {
    img: 'hagia.jpg', place: 'Constantinople', lon: 28.98, lat: 41.01, title: 'Hagia Sophia', sub: 'A dome between two continents',
    body: [
      'Finished in 537 for Emperor Justinian. Its dome, more than 30 metres across, seemed to float on a ring of light.',
      'A cathedral for nine centuries, a mosque from 1453, a museum from 1934, and a mosque again since 2020.',
    ],
    facts: [['Finished', '537'], ['Dome', '> 30 m across'], ['Built in', 'About five years']],
  },
  {
    img: 'venice.jpg', place: 'Venice', lon: 12.33, lat: 45.44, title: 'The Grand Canal', sub: 'Where the silk was sold',
    body: [
      'Almost four kilometres of water lined with merchants’ palaces. Silk, pepper and glass from the East came ashore here and went on to the rest of Europe.',
      'The stone Rialto bridge, finished in 1591, still stands over the market where traders once argued about prices.',
    ],
    facts: [['Length', '≈ 3.8 km'], ['Rialto', '1591'], ['Famous son', 'Marco Polo']],
  },
];

// the ten stops of the road, by longitude/latitude, for the little map
const ROAD = [
  [108.94, 34.34], [94.66, 40.14], [82.2, 38.9], [75.99, 39.47], [73.5, 38.5],
  [66.96, 39.65], [64.42, 39.77], [44.36, 33.31], [28.98, 41.01], [12.32, 45.44],
];
const mapX = (lon) => 12 + ((lon - 10) / 102) * 276;
const mapY = (lat) => 70 - ((lat - 30) / 18) * 56;

export function buildStories(shots) {
  const el = document.createElement('div');
  el.className = 'story';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="st-backdrop" data-close></div>
    <article class="st-panel" role="dialog" aria-modal="true" aria-labelledby="st-title">
      <figure class="st-photo"><img alt="" /></figure>
      <div class="st-text">
        <p class="st-kicker"></p>
        <h3 class="st-title" id="st-title"></h3>
        <p class="st-sub"></p>
        <div class="st-body"></div>
        <dl class="st-facts"></dl>
        <svg class="st-map" viewBox="0 0 300 80" aria-hidden="true">
          <path class="st-road" d="M${ROAD.map(([a, b]) => `${mapX(a).toFixed(1)} ${mapY(b).toFixed(1)}`).join(' L')}" />
          ${ROAD.map(([a, b]) => `<circle cx="${mapX(a).toFixed(1)}" cy="${mapY(b).toFixed(1)}" r="2.2" />`).join('')}
          <circle class="st-here-ring" r="9" /><circle class="st-here" r="4" />
        </svg>
        <div class="st-nav">
          <button type="button" data-prev aria-label="${t('Previous place')}">←</button>
          <span class="st-count"></span>
          <button type="button" data-next aria-label="${t('Next place')}">→</button>
        </div>
      </div>
      <button class="st-close" type="button" data-close aria-label="${t('Close')}">✕</button>
    </article>`;
  document.body.append(el);
  const $ = (s) => el.querySelector(s);
  const photo = $('.st-photo');
  const img = $('.st-photo img');
  let index = 0;
  let lastFocus = null;

  function fill(i) {
    const s = STORIES[i];
    img.src = `photos/${s.img}`;
    img.alt = t(s.title);
    $('.st-kicker').textContent = `${t(s.place)} · ${s.lat.toFixed(2)}°N ${s.lon.toFixed(2)}°E`;
    const ttl = $('.st-title');
    ttl.removeAttribute('data-split');
    ttl.textContent = t(s.title);
    splitLetters(ttl);
    $('.st-sub').textContent = t(s.sub);
    $('.st-body').innerHTML = s.body.map((p) => `<p>${t(p)}</p>`).join('');
    el.querySelectorAll('.st-body p').forEach(splitWords);
    $('.st-facts').innerHTML = s.facts.map(([k, v], n) => `<div style="--n:${n}"><dt>${t(k)}</dt><dd>${t(v)}</dd></div>`).join('');
    $('.st-count').textContent = `${String(i + 1).padStart(2, '0')} / ${String(STORIES.length).padStart(2, '0')}`;
    const x = mapX(s.lon).toFixed(1);
    const y = mapY(s.lat).toFixed(1);
    for (const c of el.querySelectorAll('.st-here, .st-here-ring')) c.setAttribute('cx', x), c.setAttribute('cy', y);
    // replay the text animations
    const text = $('.st-text');
    text.classList.remove('lit');
    void text.offsetWidth;
    requestAnimationFrame(() => text.classList.add('lit'));
  }

  function open(i, from) {
    index = i;
    lastFocus = document.activeElement;
    fill(i);
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    window.__lenis?.stop();
    // the photo flies from the card into place
    if (from) {
      const a = from.getBoundingClientRect();
      const b = photo.getBoundingClientRect();
      photo.style.transition = 'none';
      photo.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
      photo.style.borderRadius = '18px';
      void photo.offsetWidth;
      photo.style.transition = '';
      photo.style.transform = '';
      photo.style.borderRadius = '';
    }
    setTimeout(() => $('.st-close').focus({ preventScroll: true }), 50);
  }
  function close() {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    window.__lenis?.start();
    lastFocus?.focus?.({ preventScroll: true });
  }
  function step(d) {
    index = (index + d + STORIES.length) % STORIES.length;
    photo.classList.remove('swap');
    void photo.offsetWidth;
    photo.classList.add('swap');
    fill(index);
  }

  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  $('[data-prev]').addEventListener('click', () => step(-1));
  $('[data-next]').addEventListener('click', () => step(1));
  addEventListener('keydown', (e) => {
    if (!el.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  shots.forEach((shot, i) => {
    if (!STORIES[i]) return;
    shot.setAttribute('tabindex', '0');
    shot.setAttribute('role', 'button');
    shot.setAttribute('aria-label', `${t(STORIES[i].title)} — ${t('Open the story')}`);
    const go = () => open(i, shot.querySelector('.m-shot-img'));
    shot.addEventListener('click', go);
    shot.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  });
}
