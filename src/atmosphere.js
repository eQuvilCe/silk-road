import * as THREE from 'three';
import { clamp } from './noise.js';

// Time of day along the journey: dawn in China → noon in the desert →
// golden Samarkand → sunset over Baghdad → night in Venice.
// [progress, horizon/fog, zenith, sun colour, sun intensity, sun elevation,
//  hemi sky, hemi ground, stars, dust, ink]
const KEYS = [
  [0.0, '#f2c9a4', '#7d9cc4', '#ffcf9e', 2.6, 0.22, '#ffe2c8', '#6e5040', 0, 0, 0],
  [0.17, '#efdcbc', '#6f9fd4', '#fff0d6', 3.4, 0.75, '#fff1de', '#8a6a4a', 0, 0.1, 0],
  [0.27, '#e7c493', '#9db3c4', '#ffe4ad', 3.1, 0.9, '#ffeccc', '#957250', 0, 1, 0],
  [0.35, '#ecd8b4', '#6f9fd4', '#fff0d6', 3.3, 0.8, '#fff2df', '#8a6a4a', 0, 0.2, 0],
  [0.44, '#d5dde4', '#5c86b8', '#f3f6ff', 3.0, 0.65, '#e5edf6', '#5b6470', 0, 0.05, 0],
  [0.52, '#f0c592', '#7d9cc4', '#ffc47c', 3.2, 0.42, '#ffe0b8', '#7a5236', 0, 0, 0],
  [0.6, '#eeb27a', '#8a9cbc', '#ffaf66', 2.9, 0.3, '#ffd5ad', '#6f4a33', 0, 0.15, 0],
  [0.69, '#ec9563', '#76789e', '#ff8a48', 2.5, 0.12, '#f7b78e', '#5a3a3a', 0, 0, 0.15],
  [0.775, '#a2708a', '#3d3c66', '#ff8d6a', 1.2, 0.03, '#ad98c0', '#3a2f45', 0.35, 0, 0.75],
  [0.86, '#28345a', '#0b1230', '#a9bcff', 0.6, 0.5, '#4f5f90', '#151a2c', 1, 0, 1],
  [1.0, '#1a2448', '#070c22', '#a9bcff', 0.5, 0.55, '#3d4b78', '#11152a', 1, 0, 1],
].map(([p, sky, zen, sun, si, el, hs, hg, stars, dust, ink]) => ({
  p,
  sky: new THREE.Color(sky),
  zen: new THREE.Color(zen),
  sun: new THREE.Color(sun),
  si,
  el,
  hs: new THREE.Color(hs),
  hg: new THREE.Color(hg),
  stars,
  dust,
  ink,
}));

const out = {
  sky: new THREE.Color(),
  zen: new THREE.Color(),
  sun: new THREE.Color(),
  hs: new THREE.Color(),
  hg: new THREE.Color(),
  si: 0,
  el: 0,
  stars: 0,
  dust: 0,
  ink: 0,
};

export function sampleAtmosphere(p) {
  p = clamp(p);
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  let t = clamp((p - a.p) / (b.p - a.p));
  t = t * t * (3 - 2 * t);
  for (const k of ['sky', 'zen', 'sun', 'hs', 'hg']) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of ['si', 'el', 'stars', 'dust', 'ink']) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
