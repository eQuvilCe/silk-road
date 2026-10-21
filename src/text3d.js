import * as THREE from 'three';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontUrl from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url';
import { heightAt } from './world.js';
import { clamp } from './noise.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);

async function loadFont() {
  const buf = await (await fetch(fontUrl)).arrayBuffer();
  const json = new TTFLoader().parse(buf);
  return new Font(json);
}

// A word made of separate 3D letters so each one can rise on its own.
function makeWord(font, text, size, material, { depth = 0.22, track = 0.03, bevel = true } = {}) {
  const group = new THREE.Group();
  const scale = size / font.data.resolution;
  const letters = [];
  let x = 0;
  for (const ch of text) {
    const glyph = font.data.glyphs[ch] || font.data.glyphs['?'];
    const adv = (glyph ? glyph.ha : font.data.resolution * 0.3) * scale + size * track;
    if (ch !== ' ') {
      const geo = new TextGeometry(ch, {
        font,
        size,
        depth: size * depth,
        curveSegments: 12,
        bevelEnabled: bevel,
        bevelThickness: size * 0.025,
        bevelSize: size * 0.015,
        bevelSegments: 3,
      });
      geo.computeVertexNormals();
      // centre each glyph on its own axis so it turns in place, not around its corner
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2;
      geo.translate(-cx, 0, -(bb.min.z + bb.max.z) / 2);
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      holder.add(mesh);
      holder.position.x = x + cx;
      group.add(holder);
      letters.push(holder);
    }
    x += adv;
  }
  letters.forEach((l) => (l.position.x -= x / 2));
  return { group, letters, width: x, size, material };
}

const TAU = Math.PI * 2;
function animateWord(word, v, time, seed = 0) {
  word.group.visible = v > 0.001;
  if (word.light) word.light.intensity = 0;
  if (!word.group.visible) return;
  const n = word.letters.length;
  const spread = 0.45;
  word.letters.forEach((l, i) => {
    const start = (i / Math.max(1, n - 1)) * spread;
    const k = ease(clamp((v - start) / (1 - spread)));
    // each letter turns a full circle as it rises into place
    l.position.y = (1 - k) * word.size * 0.5;
    l.rotation.y = (1 - k) * TAU;
    l.rotation.x = (1 - k) * -0.25;
    l.scale.setScalar(0.92 + 0.08 * k);
    // every ~9 s a calm wave of full turns runs through the word, letter by letter
    const cyc = (((time * 0.11 + seed - i * 0.03) % 1) + 1) % 1;
    const k2 = Math.min(1, cyc / 0.14);
    l.rotation.y += (cyc < 0.14 ? k2 * k2 * (3 - 2 * k2) : 0) * TAU;
  });
  word.material.opacity = ease(clamp(v * 1.4));
  // a warm glint slides along the letters
  if (word.light) {
    const sweep = (time * 0.18 + seed) % 1;
    word.light.position.set((sweep * 1.4 - 0.7) * word.width, word.size * 0.6, word.size * 1.2);
    word.light.intensity = 26 * word.size * ease(clamp(v * 1.2));
  }
}

export async function createTitles({ cities, introAnchor, introFacing, frameAt }) {
  const font = await loadFont();
  const group = new THREE.Group();

  // thin, softly glowing letters that float above the road (like the credit titles of a film)
  // gilded letters: metal catches the sky and the glint light, a little glow keeps them readable at night
  const mkMat = (color) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.22,
      metalness: 0.65,
      roughness: 0.28,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 1,
    });
  const gold = mkMat('#f0cf8a');

  const tangent = new THREE.Vector3();
  const face = new THREE.Vector3();

  const words = cities.map((c) => {
    const text = (c.nameLatin || c.name).toUpperCase();
    const size = Math.min(2.1, 21 / text.length);
    const word = makeWord(font, text, size, mkMat('#f3dcaa'), { depth: 0.16, track: 0.28, bevel: true });
    word.light = new THREE.PointLight('#ffd9a0', 0, size * 9, 1.6);
    word.group.add(word.light);
    // stand in the middle of the shot the camera has while dwelling in this city
    const { pos: cam, look } = frameAt(c.p);
    tangent.copy(look).sub(cam).setY(0).normalize();
    const pos = look.clone().addScaledVector(tangent, 5);
    pos.y = heightAt(pos.x, pos.z).h + 3.4;
    word.group.position.copy(pos);
    face.copy(cam).setY(pos.y);
    word.group.lookAt(face);
    group.add(word.group);
    return word;
  });

  const title = makeWord(font, 'SILK ROAD', 5.2, gold, { depth: 0.07, track: 0.3, bevel: false });
  title.group.position.copy(introAnchor);
  title.group.position.y = heightAt(introAnchor.x, introAnchor.z).h + 9;
  face.copy(introFacing).setY(title.group.position.y);
  title.group.lookAt(face);
  group.add(title.group);

  return {
    group,
    update(cityVis, introVis) {
      const t = performance.now() / 1000;
      words.forEach((w, i) => animateWord(w, cityVis[i], t, i * 0.37));
      animateWord(title, introVis, t, 0.5);
    },
  };
}
